import { Router } from 'express';
import { z } from 'zod';
import { MAX_ADMIN_ADJUST } from '../../config.js';
import { BOT_LEVELS } from '../../game/engine.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { getBotLevel, setBotLevel } from '../../lib/settings.js';
import { parse } from '../../lib/validate.js';
import { requireAdmin } from '../../middleware/auth.js';
import { gameManager } from '../../realtime/gameManager.js';
import { hub } from '../../realtime/hub.js';
import { leaveWaitingRoom } from '../rooms/rooms.service.js';
import { getPaidWheel, getWheel, PAID_MAX_PRICE, PAID_MAX_SPINS, setPaidWheel, setWheel, wheelStats, WHEEL_MAX_AMOUNT, WHEEL_MAX_SEGMENTS, WHEEL_MIN_SEGMENTS } from '../wheel/wheel.service.js';
import { walletOp } from '../wallet/wallet.service.js';

// Toutes les routes ci-dessous sont vérifiées côté serveur (rôle ADMIN relu en base à chaque requête).
export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/overview', async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [users, newUsers, gamesToday, activeGames, credits, suspended, privateOpen, abandonsToday, pendingDeposits, pendingWithdrawals] = await Promise.all([
    prisma.user.count({ where: { isBot: false } }),
    prisma.user.count({ where: { isBot: false, createdAt: { gte: weekAgo } } }),
    prisma.game.count({ where: { startedAt: { gte: startOfDay } } }),
    prisma.game.count({ where: { status: 'ACTIVE' } }),
    prisma.wallet.aggregate({ _sum: { balance: true }, where: { user: { isBot: false } } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.room.count({ where: { visibility: 'PRIVATE', status: { in: ['WAITING', 'PLAYING'] } } }),
    prisma.game.count({ where: { endedAt: { gte: startOfDay }, endReason: { in: ['FORFEIT', 'DISCONNECT'] } } }),
    prisma.depositRequest.count({ where: { status: 'PENDING' } }),
    prisma.withdrawalRequest.count({ where: { status: 'PENDING' } })
  ]);
  res.json({
    users,
    newUsersWeek: newUsers,
    online: hub.onlineCount(),
    gamesToday,
    activeGames,
    creditsInCirculation: credits._sum.balance ?? 0,
    suspended,
    privateOpen,
    abandonsToday,
    pendingDeposits,
    pendingWithdrawals
  });
});

adminRouter.get('/users', async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(100).optional(), take: z.coerce.number().int().min(1).max(100).default(50) }), req.query);
  const users = await prisma.user.findMany({
    where: { isBot: false, ...(q.q ? { OR: [{ username: { contains: q.q } }, { email: { contains: q.q } }, { phone: { contains: q.q.replace(/[\s.\-]/g, '') } }, ...(q.q.length >= 6 ? [{ id: { endsWith: q.q.toLowerCase() } }] : [])] } : {}) },
    orderBy: { createdAt: 'desc' },
    take: q.take,
    include: { wallet: { select: { balance: true } }, profile: { select: { xp: true, avatarColor: true } }, _count: { select: { gameSeats: true } } }
  });
  res.json({
    items: users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      suspendedReason: u.suspendedReason,
      balance: u.wallet?.balance ?? 0,
      level: Math.floor((u.profile?.xp ?? 0) / 1000) + 1,
      avatarColor: u.profile?.avatarColor ?? '#2F6BFF',
      games: u._count.gameSeats,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt
    }))
  });
});

const reasonSchema = z.string().trim().min(5, 'Justification obligatoire (5 caractères minimum)').max(500);

adminRouter.post('/users/:id/suspend', async (req, res) => {
  const { reason } = parse(z.object({ reason: reasonSchema }), req.body);
  const id = String(req.params.id);
  if (id === req.user!.id) throw badRequest('SELF_SUSPEND', 'Vous ne pouvez pas suspendre votre propre compte');
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw notFound('Utilisateur introuvable');
  if (target.role === 'ADMIN') throw conflict('TARGET_IS_ADMIN', 'Impossible de suspendre un administrateur');
  await prisma.$transaction(async (tx) => {
    // tokenVersion++ : toutes les sessions du compte deviennent invalides immédiatement.
    await tx.user.update({ where: { id }, data: { status: 'SUSPENDED', suspendedReason: reason, tokenVersion: { increment: 1 } } });
    await audit({ actorId: req.user!.id, action: 'admin.user_suspend', targetType: 'user', targetId: id, details: { reason }, ip: req.ip }, tx);
  });
  // Conséquences en jeu : défaite par forfait en partie, remboursement en salle d'attente.
  const seat = await prisma.roomPlayer.findFirst({
    where: { userId: id, room: { status: { in: ['WAITING', 'PLAYING'] } } },
    include: { room: { include: { games: { where: { status: 'ACTIVE' }, select: { id: true } } } } }
  });
  if (seat?.room.status === 'PLAYING' && seat.room.games[0]) await gameManager.forfeit(seat.room.games[0].id, id, 'ADMIN');
  if (seat?.room.status === 'WAITING') await leaveWaitingRoom(id, seat.roomId, req.ip);
  hub.io?.in(`user:${id}`).disconnectSockets(true);
  hub.lobbyChanged();
  res.status(204).end();
});

adminRouter.post('/users/:id/reactivate', async (req, res) => {
  const { reason } = parse(z.object({ reason: reasonSchema }), req.body);
  const id = String(req.params.id);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw notFound('Utilisateur introuvable');
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { status: 'ACTIVE', suspendedReason: null } });
    await audit({ actorId: req.user!.id, action: 'admin.user_reactivate', targetType: 'user', targetId: id, details: { reason }, ip: req.ip }, tx);
  });
  res.status(204).end();
});

adminRouter.post('/users/:id/credits', async (req, res) => {
  const body = parse(
    z.object({
      amount: z.number().int().refine((v) => v !== 0 && Math.abs(v) <= MAX_ADMIN_ADJUST, { message: `Montant non nul, au plus ${MAX_ADMIN_ADJUST}` }),
      reason: reasonSchema,
      // Fourni par le client (UUID) : un double clic ou une requête rejouée n'ajuste qu'une fois.
      requestId: z.string().uuid()
    }),
    req.body
  );
  const id = String(req.params.id);
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
  if (!target) throw notFound('Utilisateur introuvable');
  const r = await walletOp({
    userId: id,
    amount: body.amount,
    type: body.amount > 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
    reason: `Ajustement admin (${req.user!.username}) : ${body.reason}`,
    idempotencyKey: `admin:${req.user!.id}:${body.requestId}`,
    actorId: req.user!.id
  });
  if (!r.duplicate) {
    await audit({
      actorId: req.user!.id,
      action: 'admin.credit_adjust',
      targetType: 'user',
      targetId: id,
      details: { amount: body.amount, reason: body.reason, balanceAfter: r.balance, transactionId: r.transaction.id },
      ip: req.ip
    });
  }
  res.status(r.duplicate ? 200 : 201).json({ balance: r.balance, transaction: r.transaction, duplicate: r.duplicate });
});

adminRouter.get('/games', async (req, res) => {
  const q = parse(z.object({ status: z.enum(['ACTIVE', 'FINISHED', 'ABORTED']).optional() }), req.query);
  const games = await prisma.game.findMany({
    where: q.status ? { status: q.status } : {},
    orderBy: { startedAt: 'desc' },
    take: 50,
    include: {
      room: { select: { name: true, code: true, stake: true, visibility: true, gameType: true } },
      players: { include: { user: { select: { username: true } } } },
      winner: { select: { username: true } },
      _count: { select: { moves: true } }
    }
  });
  res.json({
    items: games.map((g) => ({
      id: g.id,
      room: g.room,
      status: g.status,
      endReason: g.endReason,
      players: g.players.map((p) => ({ username: p.user.username, color: p.color, result: p.result })),
      winner: g.winner?.username ?? null,
      moves: g._count.moves,
      startedAt: g.startedAt,
      endedAt: g.endedAt
    }))
  });
});

adminRouter.post('/games/:id/abort', async (req, res) => {
  const { reason } = parse(z.object({ reason: reasonSchema }), req.body);
  const id = String(req.params.id);
  await audit({ actorId: req.user!.id, action: 'admin.game_abort_request', targetType: 'game', targetId: id, details: { reason }, ip: req.ip });
  res.json({ game: await gameManager.abort(id, 'ADMIN', req.user!.id) });
});

adminRouter.get('/settings/bot-level', async (_req, res) => {
  res.json({ level: await getBotLevel() });
});

adminRouter.patch('/settings/bot-level', async (req, res) => {
  const { level } = parse(z.object({ level: z.enum(BOT_LEVELS) }), req.body);
  await setBotLevel(level, req.user!.id, req.ip);
  res.json({ level });
});

adminRouter.get('/settings/wheel', async (_req, res) => {
  res.json({ segments: await getWheel(), paid: await getPaidWheel(), ...(await wheelStats()) });
});

adminRouter.put('/settings/wheel', async (req, res) => {
  const { segments } = parse(
    z.object({
      segments: z
        .array(z.object({ amount: z.number().int().min(0).max(WHEEL_MAX_AMOUNT), weight: z.number().int().min(0).max(1000) }))
        .min(WHEEL_MIN_SEGMENTS)
        .max(WHEEL_MAX_SEGMENTS)
        .refine((s) => s.some((x) => x.weight > 0), 'Au moins une case doit pouvoir sortir')
    }),
    req.body
  );
  await setWheel(segments, req.user!.id, req.ip);
  res.json({ segments });
});

adminRouter.put('/settings/wheel-paid', async (req, res) => {
  const paid = parse(
    z.object({
      basePrice: z.number().int().min(1).max(PAID_MAX_PRICE),
      step: z.number().int().min(0).max(PAID_MAX_PRICE),
      maxSpins: z.number().int().min(0).max(PAID_MAX_SPINS)
    }),
    req.body
  );
  await setPaidWheel(paid, req.user!.id, req.ip);
  res.json({ paid });
});

adminRouter.get('/transactions', async (_req, res) => {
  const items = await prisma.walletTransaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { wallet: { select: { user: { select: { username: true } } } }, actor: { select: { username: true } } }
  });
  res.json({
    items: items.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      reason: t.reason,
      username: t.wallet.user.username,
      actor: t.actor?.username ?? null,
      createdAt: t.createdAt
    }))
  });
});

adminRouter.get('/audit', async (_req, res) => {
  const items = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { actor: { select: { username: true } } }
  });
  res.json({
    items: items.map((a) => ({
      id: a.id,
      action: a.action,
      actor: a.actor?.username ?? null,
      targetType: a.targetType,
      targetId: a.targetId,
      details: a.details ? JSON.parse(a.details) : null,
      createdAt: a.createdAt
    }))
  });
});
