import { conflict } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { applyWalletOp } from '../wallet/wallet.service.js';
import { wheelDay } from '../wheel/wheel.service.js';

/**
 * Mission du jour : jouer 10 parties avec mise (hors entraînement et parties contre les robots) pour gagner 10 pièces.
 * Une fois par jour (minuit au Maroc), ce qui limite l'intérêt de jouer contre son propre second compte.
 * Seules les parties jouées jusqu'au bout comptent : un abandon immédiat entre deux comptes ne fait pas avancer la mission.
 */
export const TASK_GAMES = Number(process.env.TASK_GAMES ?? 10);
export const TASK_REWARD = Number(process.env.TASK_REWARD ?? 10);

const taskKey = (userId: string, day: string) => `task:games:${userId}:${day}`;

async function gamesToday(userId: string, since: Date) {
  return prisma.gamePlayer.count({
    where: { userId, game: { status: 'FINISHED', endReason: 'COMPLETED', endedAt: { gte: since }, room: { isPractice: false, stake: { gt: 0 } } } }
  });
}

export async function taskState(userId: string) {
  const { day, nextSpinAt } = wheelDay();
  // Début du jour marocain = minuit suivant − 24 h (le Maroc ne change pas d'heure en pleine journée).
  const since = new Date(nextSpinAt.getTime() - 86_400_000);
  const [played, claimed] = await Promise.all([
    gamesToday(userId, since),
    prisma.walletTransaction.findUnique({ where: { idempotencyKey: taskKey(userId, day) }, select: { id: true } })
  ]);
  return { day, played: Math.min(played, TASK_GAMES), goal: TASK_GAMES, reward: TASK_REWARD, claimed: !!claimed, resetsAt: nextSpinAt };
}

export async function claimTask(userId: string, ip?: string) {
  const state = await taskState(userId);
  if (state.claimed) throw conflict('TASK_CLAIMED', 'Récompense déjà reçue aujourd’hui');
  if (state.played < state.goal) throw conflict('TASK_NOT_DONE', `Jouez encore ${state.goal - state.played} partie(s) avec mise`);
  const r = await prisma.$transaction(async (tx) => {
    const op = await applyWalletOp(tx, {
      userId, amount: TASK_REWARD, type: 'TASK_REWARD', reason: `Mission du jour : ${TASK_GAMES} parties avec mise`, idempotencyKey: taskKey(userId, state.day)
    });
    if (!op.duplicate) await audit({ actorId: userId, action: 'task.claim', targetType: 'user', targetId: userId, details: { amount: TASK_REWARD }, ip }, tx);
    return op;
  });
  return { ...state, claimed: true, balance: r.balance };
}
