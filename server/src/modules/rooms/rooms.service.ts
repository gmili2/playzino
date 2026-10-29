import { randomInt } from 'node:crypto';
import { Prisma, type Room, type RoomVisibility } from '@prisma/client';
import { audit } from '../../lib/audit.js';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.js';
import { prisma, type Tx } from '../../lib/prisma.js';
import { createGame, turnOrder, type Color } from '../../game/engine.js';
import { applyWalletOp } from '../wallet/wallet.service.js';

/** Couleurs par siège : les deux premiers joueurs occupent des coins opposés du plateau. */
export const SEAT_COLORS: Color[] = ['blue', 'yellow', 'red', 'green'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const roomInclude = {
  players: {
    orderBy: { seat: 'asc' },
    include: { user: { select: { id: true, username: true, profile: { select: { avatarColor: true, xp: true } } } } }
  },
  games: { orderBy: { startedAt: 'desc' }, take: 1, select: { id: true, status: true } }
} satisfies Prisma.RoomInclude;

export type RoomWithPlayers = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;

export function serializeRoom(r: RoomWithPlayers, viewerId?: string) {
  const isMember = !!viewerId && r.players.some((p) => p.userId === viewerId);
  return {
    id: r.id,
    // Le code d'une table privée n'est révélé qu'à ses membres.
    code: r.visibility === 'PUBLIC' || isMember ? r.code : null,
    name: r.name,
    visibility: r.visibility,
    status: r.status,
    maxPlayers: r.maxPlayers,
    stake: r.stake,
    turnSeconds: r.turnSeconds,
    hostId: r.hostId,
    createdAt: r.createdAt,
    gameId: r.games[0]?.id ?? null,
    players: r.players.map((p) => ({
      userId: p.userId,
      username: p.user.username,
      seat: p.seat,
      color: p.color,
      avatarColor: p.user.profile?.avatarColor ?? '#2F6BFF',
      level: Math.floor((p.user.profile?.xp ?? 0) / 1000) + 1
    }))
  };
}

const newCode = () => 'PRC-' + Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

/** Place encore active : table en attente ou en cours, sauf si le joueur y a déjà été éliminé. */
const activeSeatWhere = (userId: string): Prisma.RoomPlayerWhereInput => ({
  userId,
  room: {
    status: { in: ['WAITING', 'PLAYING'] },
    games: { none: { status: 'ACTIVE', players: { some: { userId, result: 'LOSS' } } } }
  }
});

async function assertNotSeated(tx: Tx, userId: string) {
  const seat = await tx.roomPlayer.findFirst({ where: activeSeatWhere(userId), select: { roomId: true } });
  if (seat) {
    throw new AppError(409, 'ALREADY_IN_ROOM', 'Vous êtes déjà à une table', { roomId: seat.roomId });
  }
}

async function lockRoom(tx: Tx, roomId: string) {
  // Verrou de ligne InnoDB : les arrivées simultanées sur la même table sont sérialisées.
  await tx.$queryRaw`SELECT id FROM Room WHERE id = ${roomId} FOR UPDATE`;
  return tx.room.findUnique({ where: { id: roomId }, include: { players: true } });
}

async function debitStake(tx: Tx, room: Room, userId: string) {
  if (room.stake <= 0) return;
  await applyWalletOp(tx, {
    userId,
    amount: -room.stake,
    type: 'STAKE',
    reason: `Mise — table ${room.code}`,
    idempotencyKey: `stake:${room.id}:${userId}`,
    roomId: room.id
  });
}

export interface CreateRoomInput {
  name: string;
  visibility: RoomVisibility;
  stake: number;
  turnSeconds: number;
  maxPlayers: number;
}

export async function createRoom(userId: string, input: CreateRoomInput, ip?: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const id = await prisma.$transaction(async (tx) => {
        await assertNotSeated(tx, userId);
        const room = await tx.room.create({
          data: { ...input, code: newCode(), hostId: userId }
        });
        await tx.roomPlayer.create({ data: { roomId: room.id, userId, seat: 0, color: SEAT_COLORS[0] } });
        await debitStake(tx, room, userId);
        await audit({ actorId: userId, action: 'room.create', targetType: 'room', targetId: room.id, details: { ...input }, ip }, tx);
        return room.id;
      });
      return getRoomFor(id, userId);
    } catch (e) {
      // Collision (rarissime) sur le code d'invitation : on retente avec un autre code.
      const target = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? String(e.meta?.target ?? '') : '';
      if (!target.includes('code')) throw e;
    }
  }
  throw new AppError(500, 'CODE_GENERATION_FAILED', 'Impossible de générer un code de table');
}

export interface JoinResult {
  room: ReturnType<typeof serializeRoom>;
  startedGameId: string | null;
}

export async function joinRoom(userId: string, roomId: string, ip?: string): Promise<JoinResult> {
  const startedGameId = await prisma.$transaction(async (tx) => {
    const room = await lockRoom(tx, roomId);
    if (!room) throw notFound('Table introuvable');
    if (room.players.some((p) => p.userId === userId)) return null; // déjà assis : idempotent
    await assertNotSeated(tx, userId);
    if (room.status !== 'WAITING') throw conflict('ROOM_NOT_WAITING', 'Cette table n’accepte plus de joueurs');
    if (room.players.length >= room.maxPlayers) throw conflict('ROOM_FULL', 'Cette table est complète');

    const taken = new Set(room.players.map((p) => p.seat));
    const seat = Array.from({ length: room.maxPlayers }, (_, i) => i).find((s) => !taken.has(s))!;
    await tx.roomPlayer.create({ data: { roomId, userId, seat, color: SEAT_COLORS[seat] } });
    await debitStake(tx, room, userId);
    await audit({ actorId: userId, action: 'room.join', targetType: 'room', targetId: roomId, ip }, tx);

    if (room.players.length + 1 < room.maxPlayers) return null;
    return startGame(tx, roomId);
  });
  return { room: await getRoomFor(roomId, userId), startedGameId };
}

/** Table complète : création de la partie et de son état initial dans la même transaction. */
async function startGame(tx: Tx, roomId: string) {
  const players = await tx.roomPlayer.findMany({ where: { roomId }, orderBy: { seat: 'asc' } });
  const state = createGame(turnOrder(players.map((p) => p.color as Color)));
  state.turn = randomInt(players.length); // tirage au sort du premier joueur
  await tx.room.update({ where: { id: roomId }, data: { status: 'PLAYING' } });
  const game = await tx.game.create({
    data: {
      roomId,
      state: JSON.stringify(state),
      stateVersion: state.seq,
      players: { create: players.map((p) => ({ userId: p.userId, color: p.color })) }
    }
  });
  return game.id;
}

export async function joinByCode(userId: string, code: string, ip?: string) {
  const room = await prisma.room.findUnique({ where: { code: code.toUpperCase() }, select: { id: true } });
  if (!room) throw notFound('Aucune table avec ce code');
  return joinRoom(userId, room.id, ip);
}

/** Partie rapide : rejoint la plus ancienne table publique ouverte à cette mise, sinon en crée une. */
export async function quickJoin(userId: string, stake: number, maxPlayers: number, ip?: string): Promise<JoinResult> {
  const candidates = await prisma.room.findMany({
    where: { visibility: 'PUBLIC', status: 'WAITING', stake, maxPlayers, players: { none: { userId } } },
    orderBy: { createdAt: 'asc' },
    take: 5,
    select: { id: true }
  });
  for (const c of candidates) {
    try {
      return await joinRoom(userId, c.id, ip);
    } catch (e) {
      // Table prise entre-temps par un autre joueur : on essaie la suivante.
      if (e instanceof AppError && ['ROOM_FULL', 'ROOM_NOT_WAITING'].includes(e.code)) continue;
      throw e;
    }
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
  const room = await createRoom(userId, { name: `Table de ${user.username}`, visibility: 'PUBLIC', stake, turnSeconds: 30, maxPlayers }, ip);
  return { room, startedGameId: null };
}

/** Quitter une table en attente : place libérée et mise remboursée ; table vide = annulée. */
export async function leaveWaitingRoom(userId: string, roomId: string, ip?: string) {
  await prisma.$transaction(async (tx) => {
    const room = await lockRoom(tx, roomId);
    if (!room) throw notFound('Table introuvable');
    if (!room.players.some((p) => p.userId === userId)) throw forbidden('Vous n’êtes pas à cette table');
    if (room.status !== 'WAITING') throw conflict('ROOM_NOT_WAITING', 'La partie a déjà commencé');
    await tx.roomPlayer.delete({ where: { roomId_userId: { roomId, userId } } });
    if (room.stake > 0) {
      await applyWalletOp(tx, {
        userId,
        amount: room.stake,
        type: 'REFUND',
        reason: `Remboursement — départ de la table ${room.code}`,
        idempotencyKey: `refund:${roomId}:${userId}`,
        roomId
      });
    }
    if (room.players.length === 1) await tx.room.update({ where: { id: roomId }, data: { status: 'CANCELLED' } });
    else if (room.hostId === userId) {
      const other = room.players.find((p) => p.userId !== userId)!;
      await tx.room.update({ where: { id: roomId }, data: { hostId: other.userId } });
    }
    await audit({ actorId: userId, action: 'room.leave', targetType: 'room', targetId: roomId, ip }, tx);
  });
}

export async function getRoomFor(roomId: string, viewerId?: string) {
  const r = await prisma.room.findUnique({ where: { id: roomId }, include: roomInclude });
  if (!r) throw notFound('Table introuvable');
  const isMember = !!viewerId && r.players.some((p) => p.userId === viewerId);
  if (r.visibility === 'PRIVATE' && !isMember) throw notFound('Table introuvable');
  return serializeRoom(r, viewerId);
}

export async function listPublicRooms(filter: { status?: 'WAITING' | 'PLAYING'; q?: string }, viewerId?: string) {
  const rooms = await prisma.room.findMany({
    where: {
      visibility: 'PUBLIC',
      status: filter.status ? filter.status : { in: ['WAITING', 'PLAYING'] },
      ...(filter.q ? { OR: [{ name: { contains: filter.q } }, { code: { contains: filter.q.toUpperCase() } }] } : {})
    },
    orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    include: roomInclude
  });
  return rooms.map((r) => serializeRoom(r, viewerId));
}

export async function currentRoomOf(userId: string) {
  const seat = await prisma.roomPlayer.findFirst({ where: activeSeatWhere(userId), select: { roomId: true } });
  return seat ? getRoomFor(seat.roomId, userId) : null;
}
