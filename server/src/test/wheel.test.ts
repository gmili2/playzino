import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { DEFAULT_PAID, DEFAULT_WHEEL, pickSegment, wheelDay } from '../modules/wheel/wheel.service.js';
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

describe('tours payants', () => {
  const put = (c: Awaited<ReturnType<typeof registered>>, url: string, body: object) =>
    c.agent.put(url).set({ 'X-Requested-With': 'parcheesi' }).send(body);

  it('le prix augmente à chaque tour, mise débitée et gain crédité, plafond quotidien', async () => {
    const admin = await registered();
    await makeAdmin(admin.user.id);
    expect((await put(admin, '/api/admin/settings/wheel-paid', { basePrice: 10, step: 5, maxSpins: 3 })).status).toBe(200);
    try {
      const a = await registered(undefined, 1000);
      const s0 = await a.get('/api/wheel');
      expect(s0.body.paid).toMatchObject({ enabled: true, spinsToday: 0, maxSpins: 3, price: 10 });

      let balance = 1000;
      for (const price of [10, 15, 20]) {
        const r = await a.post('/api/wheel/paid-spin');
        expect(r.status).toBe(201);
        expect(r.body.price).toBe(price);
        expect(r.body.amount).toBe(s0.body.segments[r.body.index]);
        balance += r.body.amount - price;
        expect(r.body.balance).toBe(balance);
      }
      expect(await balanceOf(a.user.id)).toBe(balance);
      const over = await a.post('/api/wheel/paid-spin');
      expect(over.status).toBe(409);
      expect(over.body.error.code).toBe('PAID_LIMIT');
      expect((await a.get('/api/wheel')).body.paid).toMatchObject({ spinsToday: 3, price: null });
      // Le tour gratuit du jour reste disponible.
      expect((await a.post('/api/wheel/spin')).status).toBe(201);
    } finally {
      await put(admin, '/api/admin/settings/wheel-paid', DEFAULT_PAID);
    }
  });

  it('solde insuffisant : ni mise ni gain', async () => {
    const a = await registered(undefined, 0);
    const r = await a.post('/api/wheel/paid-spin');
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await prisma.walletTransaction.count({ where: { wallet: { userId: a.user.id } } })).toBe(0);
  });

  it('clics simultanés : chaque tour a son propre prix, jamais deux fois le même', async () => {
    const a = await registered(undefined, 5000);
    const res = await Promise.all(Array.from({ length: 4 }, () => a.post('/api/wheel/paid-spin')));
    const prices = res.filter((r) => r.status === 201).map((r) => r.body.price).sort((x, y) => x - y);
    expect(prices).toEqual(prices.map((_, i) => DEFAULT_PAID.basePrice + DEFAULT_PAID.step * i));
    const stakes = await prisma.walletTransaction.findMany({ where: { type: 'WHEEL_SPIN', wallet: { userId: a.user.id } } });
    expect(stakes).toHaveLength(prices.length);
  });

  it('réglages réservés à l’admin et validés', async () => {
    const player = await registered();
    expect((await put(player, '/api/admin/settings/wheel-paid', DEFAULT_PAID)).status).toBe(403);
    const admin = await registered();
    await makeAdmin(admin.user.id);
    expect((await put(admin, '/api/admin/settings/wheel-paid', { basePrice: 0, step: 5, maxSpins: 3 })).status).toBe(400);
  });
});
