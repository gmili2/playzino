import { randomUUID } from 'node:crypto';
import type { GameType } from '@prisma/client';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { hub } from '../../realtime/hub.js';
import { insufficientFunds } from '../wallet/wallet.service.js';
import { createRoom, joinRoom, leaveWaitingRoom } from '../rooms/rooms.service.js';
import { afterJoin, releaseIdleSeat } from '../rooms/rooms.routes.js';

/** Durée de validité d'un défi sans réponse. */
export const CHALLENGE_TTL_MS = Number(process.env.CHALLENGE_TTL_MS ?? 30_000);

const levelOf = (xp: number) => Math.floor(xp / 1000) + 1;

/** Joueurs connectés visibles (hors robots, comptes suspendus et joueurs qui masquent leur présence). */
export async function onlinePlayers(viewerId: string) {
  const ids = [...hub.connectedUsers.keys()].filter((id) => id !== viewerId);
  if (!ids.length) return [];
  const [users, seated] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids }, isBot: false, status: 'ACTIVE', profile: { hideOnline: false } },
      select: { id: true, username: true, profile: { select: { avatarColor: true, xp: true, invitesEnabled: true } } },
      take: 200
    }),
    prisma.roomPlayer.findMany({ where: { userId: { in: ids }, room: { status: 'PLAYING' } }, select: { userId: true } })
  ]);
  const playing = new Set(seated.map((s) => s.userId));
  return users
    .map((u) => ({
      id: u.id,
      username: u.username,
      avatarColor: u.profile?.avatarColor ?? '#2F6BFF',
      level: levelOf(u.profile?.xp ?? 0),
      status: playing.has(u.id) ? ('playing' as const) : ('available' as const),
      acceptsChallenges: u.profile?.invitesEnabled ?? true
    }))
    .sort((a, b) => (a.status === b.status ? a.username.localeCompare(b.username) : a.status === 'available' ? -1 : 1));
}

interface Challenge {
  id: string;
  fromId: string;
  toId: string;
  stake: number;
  gameType: GameType;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

/** Défis en attente de réponse (en mémoire : un défi ne survit pas à un redémarrage, il expire de toute façon vite). */
const challenges = new Map<string, Challenge>();

function drop(c: Challenge) {
  clearTimeout(c.timer);
  challenges.delete(c.id);
}

async function inGame(userId: string) {
  return !!(await prisma.roomPlayer.findFirst({ where: { userId, room: { status: 'PLAYING' } }, select: { roomId: true } }));
}

export async function sendChallenge(fromId: string, input: { toUserId: string; stake: number; gameType: GameType }) {
  if (input.toUserId === fromId) throw new AppError(400, 'BAD_CHALLENGE', 'Vous ne pouvez pas vous défier vous-même');
  const target = await prisma.user.findUnique({
    where: { id: input.toUserId },
    select: { isBot: true, status: true, profile: { select: { invitesEnabled: true, hideOnline: true } } }
  });
  if (!target || target.isBot || target.status !== 'ACTIVE' || target.profile?.hideOnline || !hub.connectedUsers.has(input.toUserId)) {
    throw conflict('PLAYER_OFFLINE', 'Ce joueur n’est plus en ligne');
  }
  if (target.profile && !target.profile.invitesEnabled) throw conflict('INVITES_DISABLED', 'Ce joueur n’accepte pas les défis');
  if (await inGame(fromId)) throw conflict('ALREADY_IN_GAME', 'Terminez d’abord votre partie en cours');
  if (await inGame(input.toUserId)) throw conflict('PLAYER_BUSY', 'Ce joueur est en pleine partie');
  const wallet = await prisma.wallet.findUnique({ where: { userId: fromId }, select: { balance: true } });
  if ((wallet?.balance ?? 0) < input.stake) throw insufficientFunds();

  // Un seul défi sortant à la fois : un nouveau défi remplace le précédent.
  for (const c of challenges.values()) {
    if (c.fromId === fromId) {
      drop(c);
      hub.emitUser(c.toId, 'challenge:cancelled', { id: c.id });
    }
  }

  const from = await prisma.user.findUniqueOrThrow({ where: { id: fromId }, select: { username: true, profile: { select: { avatarColor: true, xp: true } } } });
  const id = randomUUID();
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const c: Challenge = {
    id, fromId, toId: input.toUserId, stake: input.stake, gameType: input.gameType, expiresAt,
    timer: setTimeout(() => {
      challenges.delete(id);
      hub.emitUser(c.fromId, 'challenge:expired', { id });
      hub.emitUser(c.toId, 'challenge:expired', { id });
    }, CHALLENGE_TTL_MS)
  };
  challenges.set(id, c);
  hub.emitUser(c.toId, 'challenge:new', {
    id, stake: c.stake, gameType: c.gameType, expiresAt, ttlMs: CHALLENGE_TTL_MS,
    from: { id: fromId, username: from.username, avatarColor: from.profile?.avatarColor ?? '#2F6BFF', level: levelOf(from.profile?.xp ?? 0) }
  });
  return { id, expiresAt, ttlMs: CHALLENGE_TTL_MS };
}

function pending(id: string) {
  const c = challenges.get(id);
  if (!c) throw notFound('Ce défi n’est plus valable');
  return c;
}

/** Le joueur défié accepte : table privée à deux avec la mise choisie, la partie démarre aussitôt. */
export async function acceptChallenge(userId: string, id: string, ip?: string) {
  const c = pending(id);
  if (c.toId !== userId) throw notFound('Ce défi n’est plus valable');
  drop(c); // retiré avant tout : un double clic ne crée jamais deux tables
  const fail = (e: unknown) => {
    hub.emitUser(c.fromId, 'challenge:failed', { id, code: e instanceof AppError ? e.code : 'INTERNAL' });
    throw e;
  };
  await Promise.all([releaseIdleSeat(c.fromId, ip), releaseIdleSeat(userId, ip)]).catch(fail);
  const challenger = await prisma.user.findUniqueOrThrow({ where: { id: c.fromId }, select: { username: true } });
  const room = await createRoom(c.fromId, {
    name: `تحدي ${challenger.username}`.slice(0, 40), visibility: 'PRIVATE', stake: c.stake, turnSeconds: 30, maxPlayers: 2, gameType: c.gameType
  }, ip).catch(fail);
  try {
    const r = await afterJoin(await joinRoom(userId, room.id, ip));
    hub.emitUser(c.fromId, 'challenge:accepted', { id, roomId: room.id });
    return r;
  } catch (e) {
    // Le joueur défié ne peut pas suivre (solde, autre table) : la table du lanceur est fermée et sa mise rendue.
    await leaveWaitingRoom(c.fromId, room.id, ip).catch(() => undefined);
    hub.roomChanged(room.id, null);
    return fail(e);
  }
}

export function declineChallenge(userId: string, id: string) {
  const c = pending(id);
  if (c.toId !== userId) throw notFound('Ce défi n’est plus valable');
  drop(c);
  hub.emitUser(c.fromId, 'challenge:declined', { id });
}

export function cancelChallenge(userId: string, id: string) {
  const c = pending(id);
  if (c.fromId !== userId) throw notFound('Ce défi n’est plus valable');
  drop(c);
  hub.emitUser(c.toId, 'challenge:cancelled', { id });
}
