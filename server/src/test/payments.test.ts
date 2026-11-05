import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { syncPaymentMethods } from '../modules/payments/methods.js';
import { makeAdmin, registered } from './helpers.js';

afterAll(() => prisma.$disconnect());

const balanceOf = async (userId: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;
// Plus petit PNG valide (1 × 1 pixel).
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let admin: Awaited<ReturnType<typeof registered>>;
// Moyen de paiement fixé dans le code et complet (titulaire + RIB).
const bankId = 'wafacash';

beforeAll(async () => {
  admin = await registered();
  await makeAdmin(admin.user.id);
  // Un ancien moyen (retiré du code depuis) encore actif en base : la synchronisation doit le désactiver.
  await prisma.paymentBank.upsert({ where: { id: 'saham' }, create: { id: 'saham', name: 'Saham Bank', accountHolder: 'Alaedin', rib: '022640000304002870728921', active: true }, update: { active: true } });
  await syncPaymentMethods();
});

const deposit = (c: Awaited<ReturnType<typeof registered>>, amount = 200, receipt = PNG, requestId = randomUUID()) =>
  c.post('/api/payments/deposits', { bankId, amount, receipt, requestId });

describe('dépôts par virement', () => {
  it('le joueur voit les moyens de paiement ; le RIB seulement pour ceux qui sont complets', async () => {
    const a = await registered(undefined, 0);
    const r = await a.get('/api/payments');
    expect(r.status).toBe(200);
    expect(r.body.banks.find((b: { id: string }) => b.id === bankId)).toMatchObject({ name: 'Wafacash', accountHolder: 'احمد', rib: '820780261705426339117470', available: true });
    expect(r.body.banks.find((b: { id: string }) => b.id === 'cashplus')).toMatchObject({ kind: 'phone', available: true, rib: '0632586771' });
    // Seuls Wafacash et Cash Plus sont proposés.
    expect(r.body.banks.map((b: { id: string }) => b.id)).toEqual(['wafacash', 'cashplus']);
  });

  it('dépôt en attente : rien n’est crédité avant la validation de l’admin', async () => {
    const a = await registered(undefined, 0);
    const r = await deposit(a);
    expect(r.status).toBe(201);
    expect(r.body.deposit.status).toBe('PENDING');
    expect(await balanceOf(a.user.id)).toBe(0);
    const receipt = await a.get(`/api/payments/deposits/${r.body.deposit.id}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.headers['content-type']).toBe('image/png');
  });

  it('refuse un fichier qui n’est ni une image ni un PDF', async () => {
    const a = await registered(undefined, 0);
    const r = await deposit(a, 200, Buffer.from('<script>alert(1)</script>').toString('base64'));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('BAD_RECEIPT');
  });

  it('un double envoi ne crée qu’une demande', async () => {
    const a = await registered(undefined, 0);
    const requestId = randomUUID();
    const [r1, r2] = await Promise.all([deposit(a, 200, PNG, requestId), deposit(a, 200, PNG, requestId)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect(await prisma.depositRequest.count({ where: { userId: a.user.id } })).toBe(1);
  });

  it('le reçu d’un joueur n’est visible ni par un autre joueur', async () => {
    const a = await registered(undefined, 0);
    const b = await registered(undefined, 0);
    const r = await deposit(a);
    expect((await b.get(`/api/payments/deposits/${r.body.deposit.id}/receipt`)).status).toBe(403);
    expect((await admin.get(`/api/payments/deposits/${r.body.deposit.id}/receipt`)).status).toBe(200);
  });

  it('validation : crédit unique, montant corrigé par l’admin', async () => {
    const a = await registered(undefined, 0);
    const { body } = await deposit(a, 300);
    const id = body.deposit.id;
    const [v1, v2] = await Promise.all([
      admin.post(`/api/admin/payments/deposits/${id}/approve`, { amount: 250 }),
      admin.post(`/api/admin/payments/deposits/${id}/approve`, { amount: 250 })
    ]);
    expect([v1.status, v2.status].sort()).toEqual([200, 409]);
    expect(await balanceOf(a.user.id)).toBe(250);
    const tx = await prisma.walletTransaction.findFirstOrThrow({ where: { type: 'DEPOSIT', wallet: { userId: a.user.id } } });
    expect(tx).toMatchObject({ amount: 250, actorId: admin.user.id });
    expect((await admin.post(`/api/admin/payments/deposits/${id}/reject`, { reason: 'Reçu illisible' })).status).toBe(409);
  });

  it('refus : aucun crédit, motif visible par le joueur', async () => {
    const a = await registered(undefined, 0);
    const { body } = await deposit(a);
    expect((await admin.post(`/api/admin/payments/deposits/${body.deposit.id}/reject`, { reason: 'Virement non reçu' })).status).toBe(204);
    expect(await balanceOf(a.user.id)).toBe(0);
    const r = await a.get('/api/payments');
    expect(r.body.deposits[0]).toMatchObject({ status: 'REJECTED', note: 'Virement non reçu' });
  });

  it('un joueur ne peut pas valider un dépôt', async () => {
    const a = await registered(undefined, 0);
    const { body } = await deposit(a);
    expect((await a.post(`/api/admin/payments/deposits/${body.deposit.id}/approve`)).status).toBe(403);
  });

  it('moyen retiré (Saham Bank) : désactivé en base, plus de dépôt possible', async () => {
    expect((await prisma.paymentBank.findUniqueOrThrow({ where: { id: 'saham' } })).active).toBe(false);
    const a = await registered(undefined, 0);
    const r = await a.post('/api/payments/deposits', { bankId: 'saham', amount: 200, receipt: PNG, requestId: randomUUID() });
    expect(r.body.error.code).toBe('BANK_UNAVAILABLE');
  });

  it('l’admin ne peut ni ajouter ni modifier un moyen de paiement', async () => {
    expect((await admin.post('/api/admin/payments/banks', { name: 'BMCE', accountHolder: 'X', rib: '011780000012345678901234' })).status).toBe(404);
    expect((await admin.patch(`/api/admin/payments/banks/${bankId}`, { rib: '011780000012345678901234' })).status).toBe(404);
    expect((await prisma.paymentBank.findUniqueOrThrow({ where: { id: bankId } })).rib).toBe('820780261705426339117470');
  });
});

describe('retraits', () => {
  const withdraw = (c: Awaited<ReturnType<typeof registered>>, amount: number, requestId = randomUUID()) =>
    c.post('/api/payments/withdrawals', { amount, bankName: 'Cash Plus', accountHolder: 'Karim Test', rib: '007780000012345678901234', requestId });

  it('le montant est bloqué dès la demande, puis le virement est marqué exécuté', async () => {
    const a = await registered();
    const r = await withdraw(a, 400);
    expect(r.status).toBe(201);
    expect(await balanceOf(a.user.id)).toBe(600);
    expect((await admin.post(`/api/admin/payments/withdrawals/${r.body.withdrawal.id}/paid`, { reference: 'Virement n° 4521' })).status).toBe(204);
    expect(await balanceOf(a.user.id)).toBe(600);
    const list = await admin.get('/api/admin/payments/withdrawals?status=APPROVED');
    expect(list.body.items.find((w: { id: string }) => w.id === r.body.withdrawal.id)).toMatchObject({ rib: '007780000012345678901234', note: 'Virement n° 4521' });
  });

  it('refus : le montant revient sur le solde, une seule fois', async () => {
    const a = await registered();
    const r = await withdraw(a, 500);
    const url = `/api/admin/payments/withdrawals/${r.body.withdrawal.id}/reject`;
    const [x, y] = await Promise.all([admin.post(url, { reason: 'RIB invalide' }), admin.post(url, { reason: 'RIB invalide' })]);
    expect([x.status, y.status].sort()).toEqual([204, 409]);
    expect(await balanceOf(a.user.id)).toBe(1000);
  });

  it('solde insuffisant ou RIB mal formé : refusé', async () => {
    const a = await registered(undefined, 150);
    expect((await withdraw(a, 200)).body.error.code).toBe('INSUFFICIENT_FUNDS');
    const bad = await a.post('/api/payments/withdrawals', { amount: 100, bankName: 'Wafacash', accountHolder: 'Karim', rib: '1234', requestId: randomUUID() });
    expect(bad.status).toBe(400);
    const unknown = await a.post('/api/payments/withdrawals', { amount: 100, bankName: 'Banque inconnue', accountHolder: 'Karim', rib: '007780000012345678901234', requestId: randomUUID() });
    expect(unknown.status).toBe(400);
    expect(await prisma.withdrawalRequest.count({ where: { userId: a.user.id } })).toBe(0);
    expect(await balanceOf(a.user.id)).toBe(150);
  });

  it('un double clic ne bloque le montant qu’une fois', async () => {
    const a = await registered();
    const requestId = randomUUID();
    await Promise.all([withdraw(a, 300, requestId), withdraw(a, 300, requestId)]);
    expect(await balanceOf(a.user.id)).toBe(700);
    expect(await prisma.withdrawalRequest.count({ where: { userId: a.user.id } })).toBe(1);
  });
});
