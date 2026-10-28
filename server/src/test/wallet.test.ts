import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { walletOp } from '../modules/wallet/wallet.service.js';
import { makeAdmin, registered } from './helpers.js';

afterAll(() => prisma.$disconnect());

const balanceOf = async (userId: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;

describe('portefeuille', () => {
  it('historique : solde et transactions de l’utilisateur uniquement', async () => {
    const a = await registered();
    await registered();
    const r = await a.get('/api/wallet');
    expect(r.status).toBe(200);
    expect(r.body.balance).toBe(1000);
    expect(r.body.items).toHaveLength(1);
  });

  it('refuse tout débit qui rendrait le solde négatif', async () => {
    const a = await registered();
    await expect(
      walletOp({ userId: a.user.id, amount: -1001, type: 'STAKE', reason: 'test', idempotencyKey: 'neg:' + randomUUID() })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(await balanceOf(a.user.id)).toBe(1000);
  });

  it('la base refuse elle-même un solde négatif (contrainte CHECK)', async () => {
    const a = await registered();
    await expect(prisma.wallet.update({ where: { userId: a.user.id }, data: { balance: -5 } })).rejects.toThrow();
  });

  it('une même opération rejouée n’est appliquée qu’une fois (idempotence)', async () => {
    const a = await registered();
    const key = 'dup:' + randomUUID();
    const op = { userId: a.user.id, amount: 50, type: 'ADMIN_CREDIT' as const, reason: 'test', idempotencyKey: key };
    const results = await Promise.all([walletOp(op), walletOp(op), walletOp(op), walletOp(op)]);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await balanceOf(a.user.id)).toBe(1050);
    expect(await prisma.walletTransaction.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('débits concurrents : jamais en dessous de zéro', async () => {
    const a = await registered();
    // 10 débits simultanés de 300 sur un solde de 1 000 : 3 au plus réussissent.
    const ops = Array.from({ length: 10 }, (_, i) =>
      walletOp({ userId: a.user.id, amount: -300, type: 'STAKE', reason: 'conc', idempotencyKey: `conc:${a.user.id}:${i}` })
        .then(() => 'ok')
        .catch((e) => e.code)
    );
    const res = await Promise.all(ops);
    expect(res.filter((r) => r === 'ok')).toHaveLength(3);
    expect(res.filter((r) => r === 'INSUFFICIENT_FUNDS')).toHaveLength(7);
    expect(await balanceOf(a.user.id)).toBe(100);
    const txs = await prisma.walletTransaction.findMany({ where: { wallet: { userId: a.user.id } }, orderBy: { createdAt: 'asc' } });
    expect(txs.reduce((s, t) => s + t.amount, 0)).toBe(100);
  });

  it('bonus quotidien : une seule fois par jour', async () => {
    const a = await registered();
    const r1 = await a.post('/api/wallet/daily-bonus');
    expect(r1.status).toBe(201);
    expect(r1.body.balance).toBe(1200);
    const r2 = await a.post('/api/wallet/daily-bonus');
    expect(r2.status).toBe(409);
    expect(await balanceOf(a.user.id)).toBe(1200);
  });

  it('ajustement admin : justification obligatoire, journalisé, idempotent', async () => {
    const admin = await registered();
    await makeAdmin(admin.user.id);
    const target = await registered();
    const url = `/api/admin/users/${target.user.id}/credits`;

    expect((await admin.post(url, { amount: 500, reason: '', requestId: randomUUID() })).status).toBe(400);

    const requestId = randomUUID();
    const r1 = await admin.post(url, { amount: 500, reason: 'Compensation bug', requestId });
    expect(r1.status).toBe(201);
    expect(r1.body.balance).toBe(1500);
    const r2 = await admin.post(url, { amount: 500, reason: 'Compensation bug', requestId });
    expect(r2.body.duplicate).toBe(true);
    expect(await balanceOf(target.user.id)).toBe(1500);

    const tooMuch = await admin.post(url, { amount: -5000, reason: 'Retrait abusif', requestId: randomUUID() });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error.code).toBe('INSUFFICIENT_FUNDS');

    const logs = await prisma.auditLog.findMany({ where: { action: 'admin.credit_adjust', targetId: target.user.id } });
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0].details!)).toMatchObject({ amount: 500, reason: 'Compensation bug' });
    const tx = await prisma.walletTransaction.findFirstOrThrow({ where: { type: 'ADMIN_CREDIT', wallet: { userId: target.user.id } } });
    expect(tx.actorId).toBe(admin.user.id);
  });

  it('suspension par un admin : session coupée et connexion refusée', async () => {
    const admin = await registered();
    await makeAdmin(admin.user.id);
    const target = await registered();
    const r = await admin.post(`/api/admin/users/${target.user.id}/suspend`, { reason: 'Triche avérée' });
    expect(r.status).toBe(204);
    expect((await target.get('/api/me')).status).toBe(401);
    const login = await target.post('/api/auth/login', { login: target.user.username, password: 'motdepasse-123' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});
