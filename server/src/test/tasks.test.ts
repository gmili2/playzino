import { randomInt } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { registered } from './helpers.js';

afterAll(() => prisma.$disconnect());

/** Partie terminée à deux, enregistrée directement en base. */
async function finishedGame(userId: string, opponentId: string, opts: { stake: number; isPractice?: boolean; status?: 'FINISHED' | 'ABORTED' }) {
  const code = 'T' + String(randomInt(10_000_000)).padStart(7, '0');
  const room = await prisma.room.create({
    data: { code, name: 'Mission', visibility: 'PRIVATE', status: 'FINISHED', stake: opts.stake, isPractice: opts.isPractice ?? false, hostId: userId }
  });
  await prisma.game.create({
    data: {
      roomId: room.id, status: opts.status ?? 'FINISHED', state: '{}', endedAt: new Date(),
      players: { create: [{ userId, color: 'blue', result: 'WIN' }, { userId: opponentId, color: 'green', result: 'LOSS' }] }
    }
  });
}

const balance = async (userId: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;

describe('mission du jour : 10 parties avec mise', () => {
  it('progression, récompense une seule fois par jour ; entraînement, parties gratuites et annulées exclues', async () => {
    const a = await registered(undefined, 100);
    const b = await registered();
    let s = (await a.get('/api/tasks')).body;
    expect(s).toMatchObject({ played: 0, goal: 10, reward: 10, claimed: false });

    await finishedGame(a.user.id, b.user.id, { stake: 0 });
    await finishedGame(a.user.id, b.user.id, { stake: 0, isPractice: true });
    await finishedGame(a.user.id, b.user.id, { stake: 20, status: 'ABORTED' });
    for (let i = 0; i < 9; i++) await finishedGame(a.user.id, b.user.id, { stake: 5 });
    s = (await a.get('/api/tasks')).body;
    expect(s.played).toBe(9);
    expect((await a.post('/api/tasks/claim')).body.error.code).toBe('TASK_NOT_DONE');

    await finishedGame(a.user.id, b.user.id, { stake: 100 });
    const r = await a.post('/api/tasks/claim');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ played: 10, claimed: true, balance: 110 });
    expect(await balance(a.user.id)).toBe(110);
    expect((await a.post('/api/tasks/claim')).body.error.code).toBe('TASK_CLAIMED');
    expect(await balance(a.user.id)).toBe(110);
    expect(await prisma.walletTransaction.count({ where: { type: 'TASK_REWARD', wallet: { userId: a.user.id } } })).toBe(1);
  });
});
