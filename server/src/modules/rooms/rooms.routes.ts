import { Router } from 'express';
import { z } from 'zod';
import { ALLOWED_STAKES, TURN_SECONDS } from '../../config.js';
import { prisma } from '../../lib/prisma.js';
import { conflict } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { gameManager } from '../../realtime/gameManager.js';
import { hub } from '../../realtime/hub.js';
import {
  createPracticeRoom, createRoom, currentRoomOf, getRoomFor, joinByCode, joinRoom, leaveWaitingRoom, listPublicRooms, quickJoin,
  type JoinResult
} from './rooms.service.js';

export const roomsRouter = Router();

export const stakeSchema = z.coerce.number().int().refine((v) => (ALLOWED_STAKES as readonly number[]).includes(v), {
  message: `Mise autorisée : ${ALLOWED_STAKES.join(', ')}`
});

roomsRouter.get('/', async (req, res) => {
  const q = parse(z.object({ status: z.enum(['WAITING', 'PLAYING']).optional(), q: z.string().trim().max(40).optional() }), req.query);
  res.json({ items: await listPublicRooms(q, req.user?.id) });
});

roomsRouter.get('/current', requireAuth, async (req, res) => {
  res.json({ room: await currentRoomOf(req.user!.id) });
});

roomsRouter.get('/:id', requireAuth, async (req, res) => {
  res.json({ room: await getRoomFor(String(req.params.id), req.user!.id) });
});

const playersSchema = z.coerce.number().int().min(2, '2 à 4 joueurs').max(4, '2 à 4 joueurs').default(2);
export const gameTypeSchema = z.enum(['PARCHEESI', 'CONNECT4']).default('PARCHEESI');

const createSchema = z.object({
  name: z.string().trim().min(3, '3 caractères minimum').max(40),
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
  stake: stakeSchema.default(0),
  turnSeconds: z.coerce.number().int().refine((v) => (TURN_SECONDS as readonly number[]).includes(v)).default(30),
  maxPlayers: playersSchema,
  gameType: gameTypeSchema
});

roomsRouter.post('/', requireAuth, async (req, res) => {
  const body = parse(createSchema, req.body);
  await releaseIdleSeat(req.user!.id, req.ip);
  const room = await createRoom(req.user!.id, body, req.ip);
  hub.lobbyChanged();
  res.status(201).json({ room });
});

/**
 * Avant de lancer une autre partie : libère une place « oubliée » au lieu de renvoyer le joueur dessus.
 * Table encore en attente → on la quitte (mise remboursée) ; partie contre le robot → annulée.
 * Une vraie partie en cours n'est jamais touchée : le joueur y est renvoyé (ALREADY_IN_ROOM) pour la finir.
 */
export async function releaseIdleSeat(userId: string, ip?: string, keepRoomId?: string) {
  const seat = await prisma.roomPlayer.findFirst({
    where: { userId, room: { status: { in: ['WAITING', 'PLAYING'] } } },
    include: { room: { select: { id: true, status: true, isPractice: true, games: { where: { status: 'ACTIVE' }, select: { id: true } } } } }
  });
  if (!seat || seat.roomId === keepRoomId) return;
  if (seat.room.status === 'WAITING') {
    await leaveWaitingRoom(userId, seat.roomId, ip).catch(() => {}); // partie démarrée entre-temps : ALREADY_IN_ROOM suivra
    hub.roomChanged(seat.roomId, null);
    hub.lobbyChanged();
  } else if (seat.room.isPractice && seat.room.games[0]) {
    await gameManager.abort(seat.room.games[0].id, 'FORFEIT', userId);
  }
}

/** Après un join : si la table est complète, la partie démarre et les joueurs sont prévenus. */
export async function afterJoin(r: JoinResult) {
  if (r.startedGameId) {
    await gameManager.load(r.startedGameId);
    hub.roomChanged(r.room.id, { ...r.room, status: 'PLAYING', gameId: r.startedGameId });
  } else {
    hub.roomChanged(r.room.id, r.room);
  }
  hub.lobbyChanged();
  return { room: r.startedGameId ? { ...r.room, status: 'PLAYING', gameId: r.startedGameId } : r.room };
}

roomsRouter.post('/practice', requireAuth, async (req, res) => {
  const body = parse(
    z.object({
      bots: z.coerce.number().int().min(1, '1 à 3 robots').max(3, '1 à 3 robots').default(1),
      turnSeconds: z.coerce.number().int().refine((v) => (TURN_SECONDS as readonly number[]).includes(v)).default(30),
      gameType: gameTypeSchema
    }),
    req.body ?? {}
  );
  await releaseIdleSeat(req.user!.id, req.ip);
  res.status(201).json(await afterJoin(await createPracticeRoom(req.user!.id, body.bots, body.turnSeconds, body.gameType, req.ip)));
});

roomsRouter.post('/quick', requireAuth, async (req, res) => {
  const { stake, maxPlayers, gameType } = parse(z.object({ stake: stakeSchema.default(0), maxPlayers: playersSchema, gameType: gameTypeSchema }), req.body ?? {});
  await releaseIdleSeat(req.user!.id, req.ip);
  res.json(await afterJoin(await quickJoin(req.user!.id, stake, maxPlayers, gameType, req.ip)));
});

roomsRouter.post('/join-code', requireAuth, async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().regex(/^PRC-[A-Za-z0-9]{4}$/, 'Format attendu : PRC-XXXX') }), req.body);
  await releaseIdleSeat(req.user!.id, req.ip);
  res.json(await afterJoin(await joinByCode(req.user!.id, code, req.ip)));
});

roomsRouter.post('/:id/join', requireAuth, async (req, res) => {
  await releaseIdleSeat(req.user!.id, req.ip, String(req.params.id));
  res.json(await afterJoin(await joinRoom(req.user!.id, String(req.params.id), req.ip)));
});

roomsRouter.post('/:id/leave', requireAuth, async (req, res) => {
  const id = String(req.params.id);
  await leaveWaitingRoom(req.user!.id, id, req.ip);
  hub.roomChanged(id, null);
  hub.lobbyChanged();
  res.status(204).end();
});

/**
 * Aucun adversaire après l'attente : la mise est remboursée et une partie d'entraînement contre le robot
 * (même jeu, même nombre de joueurs, sans mise) démarre à la place.
 */
roomsRouter.post('/:id/play-bot', requireAuth, async (req, res) => {
  const id = String(req.params.id);
  // Une table créée pour inviter quelqu'un (avec code) ne bascule jamais vers le robot.
  const target = await prisma.room.findUnique({ where: { id }, select: { quickMatch: true } });
  if (!target?.quickMatch) throw conflict('NOT_QUICK_MATCH', 'Cette table attend un joueur invité');
  const room = await leaveWaitingRoom(req.user!.id, id, req.ip, true);
  hub.roomChanged(id, null);
  res.status(201).json(await afterJoin(await createPracticeRoom(req.user!.id, room.maxPlayers - 1, room.turnSeconds, room.gameType, req.ip, room.name)));
});
