import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { hub } from '../../realtime/hub.js';

export const statsRouter = Router();

statsRouter.get('/', async (req, res) => {
  const { period } = parse(z.object({ period: z.enum(['week', 'month', 'all']).default('week') }), req.query);
  const since = period === 'all' ? undefined : new Date(Date.now() - (period === 'week' ? 7 : 30) * 24 * 3600 * 1000);

  const top = await prisma.gamePlayer.groupBy({
    by: ['userId'],
    where: { result: 'WIN', game: { status: 'FINISHED', ...(since ? { endedAt: { gte: since } } : {}) } },
    _count: { _all: true },
    _sum: { payout: true },
    orderBy: { _count: { userId: 'desc' } },
    take: 10
  });
  const users = await prisma.user.findMany({
    where: { id: { in: top.map((t) => t.userId) } },
    select: { id: true, username: true, profile: { select: { avatarColor: true } } }
  });
  const leaderboard = top.map((t, i) => {
    const u = users.find((x) => x.id === t.userId);
    return { rank: i + 1, userId: t.userId, username: u?.username ?? '?', avatarColor: u?.profile?.avatarColor ?? '#2F6BFF', wins: t._count._all, winnings: t._sum.payout ?? 0 };
  });

  const recent = await prisma.game.findMany({
    where: { status: 'FINISHED', winnerId: { not: null } },
    orderBy: { endedAt: 'desc' },
    take: 5,
    include: {
      room: { select: { name: true } },
      winner: { select: { username: true, profile: { select: { avatarColor: true } } } },
      players: { where: { result: 'WIN' }, select: { payout: true } }
    }
  });

  res.json({
    online: hub.onlineCount(),
    leaderboard,
    recentWins: recent.map((g) => ({
      gameId: g.id,
      username: g.winner!.username,
      avatarColor: g.winner!.profile?.avatarColor ?? '#2F6BFF',
      room: g.room.name,
      payout: g.players[0]?.payout ?? 0,
      endedAt: g.endedAt
    }))
  });
});
