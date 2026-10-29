import bcrypt from 'bcryptjs';
import { audit } from '../../lib/audit.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../auth/auth.service.js';

export async function userStats(userId: string) {
  const grouped = await prisma.gamePlayer.groupBy({
    by: ['result'],
    where: { userId, game: { status: 'FINISHED', room: { isPractice: false } } },
    _count: { _all: true }
  });
  const wins = grouped.find((g) => g.result === 'WIN')?._count._all ?? 0;
  const losses = grouped.find((g) => g.result === 'LOSS')?._count._all ?? 0;
  const played = wins + losses;
  return { played, wins, losses, winRate: played ? Math.round((wins / played) * 1000) / 10 : 0 };
}

/** Niveau dérivé de l'XP : 1 000 XP par niveau. */
export const levelFromXp = (xp: number) => ({ level: Math.floor(xp / 1000) + 1, xpInLevel: xp % 1000, xpForLevel: 1000 });

export async function getMe(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true, wallet: true } });
  if (!u || !u.profile || !u.wallet) throw notFound('Utilisateur introuvable');
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
    balance: u.wallet.balance,
    profile: {
      avatarColor: u.profile.avatarColor,
      bio: u.profile.bio,
      xp: u.profile.xp,
      ...levelFromXp(u.profile.xp),
      soundEnabled: u.profile.soundEnabled,
      invitesEnabled: u.profile.invitesEnabled,
      hideOnline: u.profile.hideOnline
    },
    stats: await userStats(u.id)
  };
}

export interface ProfileUpdate {
  username?: string;
  email?: string;
  bio?: string | null;
  avatarColor?: string;
  soundEnabled?: boolean;
  invitesEnabled?: boolean;
  hideOnline?: boolean;
}

export async function updateProfile(userId: string, data: ProfileUpdate, ip?: string) {
  const { username, email, ...profile } = data;
  if (username || email) {
    const clash = await prisma.user.findFirst({
      where: { id: { not: userId }, OR: [...(email ? [{ email }] : []), ...(username ? [{ username }] : [])] },
      select: { email: true }
    });
    if (clash) {
      throw clash.email === email
        ? conflict('EMAIL_TAKEN', 'Cette adresse e-mail est déjà utilisée')
        : conflict('USERNAME_TAKEN', 'Ce nom d’utilisateur est déjà pris');
    }
  }
  await prisma.$transaction(async (tx) => {
    if (username || email) await tx.user.update({ where: { id: userId }, data: { username, email } });
    if (Object.keys(profile).length) await tx.profile.update({ where: { userId }, data: profile });
    await audit({ actorId: userId, action: 'user.update_profile', targetType: 'user', targetId: userId, details: { fields: Object.keys(data) }, ip }, tx);
  });
  return getMe(userId);
}

export async function changePassword(userId: string, current: string, next: string, ip?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(current, user.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'Mot de passe actuel incorrect');
  }
  // tokenVersion++ invalide toutes les autres sessions.
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next), tokenVersion: { increment: 1 } }
  });
  await audit({ actorId: userId, action: 'user.change_password', targetType: 'user', targetId: userId, ip });
  return updated;
}

export async function gameHistory(userId: string, take = 20) {
  const seats = await prisma.gamePlayer.findMany({
    where: { userId, game: { status: { in: ['FINISHED', 'ABORTED'] } } },
    orderBy: { game: { startedAt: 'desc' } },
    take,
    include: {
      game: {
        include: {
          room: { select: { name: true, code: true, stake: true, isPractice: true } },
          players: { include: { user: { select: { username: true } } } }
        }
      }
    }
  });
  return seats.map((s) => ({
    gameId: s.gameId,
    room: s.game.room,
    color: s.color,
    result: s.result,
    payout: s.payout,
    status: s.game.status,
    endReason: s.game.endReason,
    startedAt: s.game.startedAt,
    endedAt: s.game.endedAt,
    opponents: s.game.players.filter((p) => p.userId !== userId).map((p) => p.user.username)
  }));
}
