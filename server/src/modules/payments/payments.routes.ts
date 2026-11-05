import { Router } from 'express';
import { z } from 'zod';
import { DEPOSIT_MAX, DEPOSIT_MIN, MAX_PENDING_DEPOSITS, WITHDRAWAL_MAX, WITHDRAWAL_MIN } from '../../config.js';
import { parse } from '../../lib/validate.js';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import {
  approveDeposit,
  createDeposit,
  createWithdrawal,
  listDeposits,
  listWithdrawals,
  markWithdrawalPaid,
  readReceipt,
  rejectDeposit,
  rejectWithdrawal
} from './payments.service.js';
import { listPaymentMethods, METHOD_NAMES, PAYMENT_METHODS } from './methods.js';

/** Chiffres arabes (٠-٩, ۰-۹ des claviers de téléphone) → chiffres latins. */
export const asciiDigits = (v: string) =>
  v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/** RIB marocain saisi avec ou sans espaces : on ne garde que les 24 chiffres. */
export const ribSchema = z
  .string()
  .transform((v) => asciiDigits(v).replace(/[\s-]/g, ''))
  .refine((v) => /^\d{24}$/.test(v), 'Le RIB doit contenir 24 chiffres');

/** Compte de retrait selon le moyen : RIB de 24 chiffres, ou numéro mobile marocain (Cash Plus) ramené à 06…/07…. */
const withdrawalAccount = (bankName: string, raw: string) => {
  const kind = PAYMENT_METHODS.find((m) => m.name === bankName)?.kind ?? 'rib';
  const v = asciiDigits(raw).replace(/[\s.-]/g, '');
  if (kind === 'phone') {
    const phone = v.replace(/^(\+212|00212|212)/, '0');
    return /^0[5-7]\d{8}$/.test(phone) ? phone : null;
  }
  return /^\d{24}$/.test(v) ? v : null;
};
const nameSchema = (max: number) => z.string().trim().min(2).max(max);
const reasonSchema = z.string().trim().min(5, 'Justification obligatoire (5 caractères minimum)').max(500);
const statusQuery = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() });

// ---------- Joueur : /api/payments ----------

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

paymentsRouter.get('/', async (req, res) => {
  const userId = req.user!.id;
  const [banks, deposits, withdrawals] = await Promise.all([
    listPaymentMethods(),
    listDeposits({ userId }, 20),
    listWithdrawals({ userId }, 20)
  ]);
  res.json({
    banks,
    deposits,
    withdrawals,
    limits: { depositMin: DEPOSIT_MIN, depositMax: DEPOSIT_MAX, withdrawalMin: WITHDRAWAL_MIN, withdrawalMax: WITHDRAWAL_MAX, maxPendingDeposits: MAX_PENDING_DEPOSITS }
  });
});

paymentsRouter.post('/deposits', async (req, res) => {
  const body = parse(
    z.object({
      bankId: z.string().max(30),
      amount: z.number().int().min(DEPOSIT_MIN).max(DEPOSIT_MAX),
      // Reçu encodé en base64 (le type réel est vérifié côté serveur).
      receipt: z.string().min(1).max(8_000_000),
      requestId: z.string().uuid()
    }),
    req.body
  );
  const r = await createDeposit(req.user!.id, body, req.ip);
  res.status(r.duplicate ? 200 : 201).json({ deposit: { id: r.deposit.id, status: r.deposit.status, amount: r.deposit.amount }, duplicate: r.duplicate });
});

paymentsRouter.get('/deposits/:id/receipt', async (req, res) => {
  const r = await readReceipt(String(req.params.id), req.user!);
  res.set('Content-Type', r.mime);
  res.set('Content-Disposition', 'inline');
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(r.data);
});

paymentsRouter.post('/withdrawals', async (req, res) => {
  const body = parse(
    z.object({
      amount: z.number().int().min(WITHDRAWAL_MIN).max(WITHDRAWAL_MAX),
      bankName: z.enum(METHOD_NAMES),
      accountHolder: nameSchema(100),
      rib: z.string().max(40),
      requestId: z.string().uuid()
    }).transform((b, ctx) => {
      const rib = withdrawalAccount(b.bankName, b.rib);
      if (!rib) {
        const phone = PAYMENT_METHODS.find((m) => m.name === b.bankName)?.kind === 'phone';
        ctx.addIssue({ code: 'custom', path: ['rib'], message: phone ? 'Numéro de téléphone marocain invalide' : 'Le RIB doit contenir 24 chiffres' });
        return z.NEVER;
      }
      return { ...b, rib };
    }),
    req.body
  );
  const r = await createWithdrawal(req.user!.id, body, req.ip);
  res.status(r.duplicate ? 200 : 201).json({ withdrawal: { id: r.withdrawal.id, status: r.withdrawal.status, amount: r.withdrawal.amount }, duplicate: r.duplicate });
});

// ---------- Administration : /api/admin/payments ----------

export const paymentsAdminRouter = Router();
paymentsAdminRouter.use(requireAdmin);

// Lecture seule : les moyens de paiement sont fixés dans le code (methods.ts).
paymentsAdminRouter.get('/banks', (_req, res) => {
  res.json({ items: listPaymentMethods() });
});

paymentsAdminRouter.get('/deposits', async (req, res) => {
  const q = parse(statusQuery, req.query);
  res.json({ items: await listDeposits(q.status ? { status: q.status } : {}, 100) });
});

paymentsAdminRouter.post('/deposits/:id/approve', async (req, res) => {
  // Montant facultatif : l'admin crédite ce qui figure réellement sur le reçu.
  const { amount } = parse(z.object({ amount: z.number().int().min(1).max(DEPOSIT_MAX).optional() }), req.body);
  res.json(await approveDeposit(String(req.params.id), req.user!.id, req.user!.username, amount, req.ip));
});

paymentsAdminRouter.post('/deposits/:id/reject', async (req, res) => {
  const { reason } = parse(z.object({ reason: reasonSchema }), req.body);
  await rejectDeposit(String(req.params.id), req.user!.id, reason, req.ip);
  res.status(204).end();
});

paymentsAdminRouter.get('/withdrawals', async (req, res) => {
  const q = parse(statusQuery, req.query);
  res.json({ items: await listWithdrawals(q.status ? { status: q.status } : {}, 100) });
});

paymentsAdminRouter.post('/withdrawals/:id/paid', async (req, res) => {
  const { reference } = parse(z.object({ reference: reasonSchema }), req.body);
  await markWithdrawalPaid(String(req.params.id), req.user!.id, reference, req.ip);
  res.status(204).end();
});

paymentsAdminRouter.post('/withdrawals/:id/reject', async (req, res) => {
  const { reason } = parse(z.object({ reason: reasonSchema }), req.body);
  await rejectWithdrawal(String(req.params.id), req.user!.id, reason, req.ip);
  res.status(204).end();
});
