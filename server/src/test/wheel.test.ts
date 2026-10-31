import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { DEFAULT_WHEEL, pickSegment, wheelDay } from '../modules/wheel/wheel.service.js';
import { makeAdmin, registered } from './helpers.js';

afterAll(() => prisma.$disconnect());

const balanceOf = async (userId: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;

describe('roue de la fortune', () => {
  it('un seul tour par jour, gain crédité et visible dans l’état', async () => {
    const a = await registered(undefined, 0);
    const s0 = await a.get('/api/wheel');
    expect(s0.status).toBe(200);
    expect(s0.body.spunToday).toBe(false);
    expect(s0.body.segments.length).toBeGreaterThanOrEqual(4);

    const r1 = await a.post('/api/wheel/spin');
    expect(r1.status).toBe(201);
    expect(r1.body.amount).toBe(s0.body.segments[r1.body.index]);
    expect(r1.body.balance).toBe(r1.body.amount);
    expect(await balanceOf(a.user.id)).toBe(r1.body.amount);

    const r2 = await a.post('/api/wheel/spin');
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe('ALREADY_SPUN');
    expect(await balanceOf(a.user.id)).toBe(r1.body.amount);

    const s1 = await a.get('/api/wheel');
    expect(s1.body).toMatchObject({ spunToday: true, todayAmount: r1.body.amount });
    expect(new Date(s1.body.nextSpinAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('tours simultanés : un seul est crédité', async () => {
    const a = await registered(undefined, 0);
    const res = await Promise.all(Array.from({ length: 6 }, () => a.post('/api/wheel/spin')));
    expect(res.filter((r) => r.status === 201)).toHaveLength(1);
    expect(res.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await prisma.walletTransaction.count({ where: { wallet: { userId: a.user.id } } })).toBe(1);
  });

  it('tirage pondéré : une case de poids 0 ne sort jamais', () => {
    const segs = [{ amount: 1, weight: 0 }, { amount: 2, weight: 1 }, { amount: 3, weight: 0 }, { amount: 4, weight: 1 }];
    for (let i = 0; i < 200; i++) expect([1, 3]).toContain(pickSegment(segs));
  });

  it('jour du Maroc et prochain minuit', () => {
    // 23 h 30 UTC le 31 octobre = 00 h 30 le 1er novembre au Maroc (UTC+1).
    const { day, nextSpinAt } = wheelDay(new Date('2026-10-31T23:30:00Z'));
    expect(day).toBe('2026-11-01');
    expect(nextSpinAt.toISOString()).toBe('2026-11-01T23:00:00.000Z');
  });

  it('admin : lecture et modification de la roue, journalisées ; refus des roues invalides', async () => {
    const admin = await registered();
    await makeAdmin(admin.user.id);
    const player = await registered();
    expect((await player.get('/api/admin/settings/wheel')).status).toBe(403);

    const r0 = await admin.get('/api/admin/settings/wheel');
    expect(r0.status).toBe(200);
    expect(r0.body.segments).toHaveLength(r0.body.segments.length);

    const segments = [{ amount: 5, weight: 1 }, { amount: 6, weight: 1 }, { amount: 7, weight: 1 }, { amount: 8, weight: 1 }];
    try {
      expect((await admin.patch('/api/admin/settings/wheel', { segments })).status).toBe(404);
      const put = await admin.agent.put('/api/admin/settings/wheel').set({ 'X-Requested-With': 'parcheesi' }).send({ segments });
      expect(put.status).toBe(200);
      expect((await player.get('/api/wheel')).body.segments).toEqual([5, 6, 7, 8]);
      const bad = await admin.agent.put('/api/admin/settings/wheel').set({ 'X-Requested-With': 'parcheesi' }).send({ segments: segments.map((s) => ({ ...s, weight: 0 })) });
      expect(bad.status).toBe(400);
      expect(await prisma.auditLog.count({ where: { actorId: admin.user.id, action: 'admin.wheel' } })).toBe(1);
    } finally {
      await admin.agent.put('/api/admin/settings/wheel').set({ 'X-Requested-With': 'parcheesi' }).send({ segments: DEFAULT_WHEEL });
    }
  });
});
