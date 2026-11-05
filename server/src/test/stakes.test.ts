import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { registered } from './helpers.js';

afterAll(() => prisma.$disconnect());

const balance = async (userId: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;

describe('mises des tables', () => {
  it('quitter puis revenir à la même table : la mise est de nouveau débitée (pas de place gratuite)', async () => {
    const host = await registered();
    const b = await registered();
    const startB = await balance(b.user.id);
    const created = await host.post('/api/rooms', { name: 'Table à 4', visibility: 'PRIVATE', stake: 10, turnSeconds: 60, maxPlayers: 4 });
    expect(created.status).toBe(201);
    const room = created.body.room;

    expect((await b.post('/api/rooms/join-code', { code: room.code })).status).toBe(200);
    expect(await balance(b.user.id)).toBe(startB - 10);
    expect((await b.post(`/api/rooms/${room.id}/leave`)).status).toBe(204);
    expect(await balance(b.user.id)).toBe(startB);

    expect((await b.post('/api/rooms/join-code', { code: room.code })).status).toBe(200);
    expect(await balance(b.user.id)).toBe(startB - 10);
    expect((await b.post(`/api/rooms/${room.id}/leave`)).status).toBe(204);
    expect(await balance(b.user.id)).toBe(startB);
  });

  it('deux tables demandées en même temps : une seule place, une seule mise', async () => {
    const a = await registered();
    const start = await balance(a.user.id);
    const make = () => a.post('/api/rooms', { name: 'Course', visibility: 'PRIVATE', stake: 10, turnSeconds: 60 });
    const [r1, r2] = await Promise.all([make(), make()]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(await balance(a.user.id)).toBe(start - 10);
  });
});

describe('retraits Cash Plus', () => {
  it('vers un numéro de téléphone marocain (chiffres arabes acceptés), pas de RIB', async () => {
    const a = await registered();
    const ok = await a.post('/api/payments/withdrawals', { amount: 100, bankName: 'Cash Plus', accountHolder: 'Karim Test', rib: '٠٦١٢ ٣٤٥٦ ٧٨', requestId: randomUUID() });
    expect(ok.status).toBe(201);
    expect((await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: ok.body.withdrawal.id } })).rib).toBe('0612345678');
    const intl = await a.post('/api/payments/withdrawals', { amount: 100, bankName: 'Cash Plus', accountHolder: 'Karim Test', rib: '+212 7 12 34 56 78', requestId: randomUUID() });
    expect(intl.status).toBe(201);
    const bad = await a.post('/api/payments/withdrawals', { amount: 100, bankName: 'Cash Plus', accountHolder: 'Karim Test', rib: '007780000012345678901234', requestId: randomUUID() });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.rib).toBeTruthy();
  });
});
