import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Prisma, type PaymentStatus } from '@prisma/client';
import { config, MAX_PENDING_DEPOSITS, RECEIPT_MAX_BYTES } from '../../config.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { hub } from '../../realtime/hub.js';
import { applyWalletOp } from '../wallet/wallet.service.js';

export const UPLOAD_DIR = resolve(config.UPLOAD_DIR ?? resolve(import.meta.dirname, '../../../uploads'), 'receipts');

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const alreadyReviewed = () => conflict('ALREADY_REVIEWED', 'Cette demande a déjà été traitée');

/** Le solde a changé hors d'une partie : les onglets ouverts du joueur se rafraîchissent. */
const notifyWallet = (userId: string) => hub.io?.to(`user:${userId}`).emit('wallet:update');

// ---------- Reçus ----------

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.toString('latin1', 0, 5) === '%PDF-' }
];

/** Décode le reçu (base64) et vérifie son type réel par ses premiers octets, pas par son nom. */
export function decodeReceipt(base64: string) {
  const data = Buffer.from(base64.replace(/^data:[^,]*,/, ''), 'base64');
  if (data.length === 0) throw badRequest('BAD_RECEIPT', 'Reçu vide');
  if (data.length > RECEIPT_MAX_BYTES) throw badRequest('RECEIPT_TOO_LARGE', 'Reçu trop volumineux (5 Mo maximum)');
  const sig = SIGNATURES.find((s) => s.test(data));
  if (!sig) throw badRequest('BAD_RECEIPT', 'Format accepté : JPG, PNG, WEBP ou PDF');
  return { data, mime: sig.mime, ext: sig.ext };
}

export async function readReceipt(depositId: string, viewer: { id: string; role: string }) {
  const d = await prisma.depositRequest.findUnique({ where: { id: depositId } });
  if (!d) throw notFound('Dépôt introuvable');
  if (d.userId !== viewer.id && viewer.role !== 'ADMIN') throw forbidden();
  return { data: await readFile(resolve(UPLOAD_DIR, d.receiptFile)), mime: d.receiptMime };
}

// ---------- Dépôts ----------

export async function createDeposit(
  userId: string,
  input: { bankId: string; amount: number; receipt: string; requestId: string },
  ip?: string
) {
  const clientRef = `${userId}:${input.requestId}`;
  const existing = await prisma.depositRequest.findUnique({ where: { clientRef } });
  if (existing) return { deposit: existing, duplicate: true };

  const bank = await prisma.paymentBank.findUnique({ where: { id: input.bankId } });
  if (!bank || !bank.active) throw badRequest('BANK_UNAVAILABLE', 'Banque indisponible');
  const pending = await prisma.depositRequest.count({ where: { userId, status: 'PENDING' } });
  if (pending >= MAX_PENDING_DEPOSITS) throw conflict('TOO_MANY_PENDING', 'Trop de dépôts en attente de validation');

  const receipt = decodeReceipt(input.receipt);
  const file = `${randomUUID()}.${receipt.ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(resolve(UPLOAD_DIR, file), receipt.data, { flag: 'wx' });
  try {
    const deposit = await prisma.$transaction(async (tx) => {
      const d = await tx.depositRequest.create({
        data: { clientRef, userId, bankId: bank.id, amount: input.amount, receiptFile: file, receiptMime: receipt.mime }
      });
      await audit({ actorId: userId, action: 'payment.deposit_request', targetType: 'deposit', targetId: d.id, details: { amount: input.amount, bank: bank.name }, ip }, tx);
      return d;
    });
    return { deposit, duplicate: false };
  } catch (e) {
    await unlink(resolve(UPLOAD_DIR, file)).catch(() => {});
    if (!isUniqueViolation(e)) throw e;
    return { deposit: await prisma.depositRequest.findUniqueOrThrow({ where: { clientRef } }), duplicate: true };
  }
}

/** Validation : la demande passe de PENDING à APPROVED une seule fois, et le solde est crédité dans la même transaction. */
export async function approveDeposit(id: string, adminId: string, adminName: string, amount: number | undefined, ip?: string) {
  const result = await prisma.$transaction(async (tx) => {
    const d = await tx.depositRequest.findUnique({ where: { id }, include: { bank: { select: { name: true } } } });
    if (!d) throw notFound('Dépôt introuvable');
    const credited = amount ?? d.amount;
    const updated = await tx.depositRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', creditedAmount: credited, reviewedById: adminId, reviewedAt: new Date() }
    });
    if (updated.count === 0) throw alreadyReviewed();
    const op = await applyWalletOp(tx, {
      userId: d.userId,
      amount: credited,
      type: 'DEPOSIT',
      reason: `Dépôt par virement (${d.bank.name}) validé par ${adminName}`,
      idempotencyKey: `deposit:${id}`,
      actorId: adminId
    });
    await audit({ actorId: adminId, action: 'admin.deposit_approve', targetType: 'deposit', targetId: id, details: { amount: credited, declared: d.amount, userId: d.userId }, ip }, tx);
    return { userId: d.userId, balance: op.balance };
  });
  notifyWallet(result.userId);
  return result;
}

export async function rejectDeposit(id: string, adminId: string, reason: string, ip?: string) {
  const d = await prisma.$transaction(async (tx) => {
    const updated = await tx.depositRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', note: reason, reviewedById: adminId, reviewedAt: new Date() }
    });
    if (updated.count === 0) {
      if (!(await tx.depositRequest.findUnique({ where: { id } }))) throw notFound('Dépôt introuvable');
      throw alreadyReviewed();
    }
    await audit({ actorId: adminId, action: 'admin.deposit_reject', targetType: 'deposit', targetId: id, details: { reason }, ip }, tx);
    return tx.depositRequest.findUniqueOrThrow({ where: { id } });
  });
  notifyWallet(d.userId);
}

// ---------- Retraits ----------

export async function createWithdrawal(
  userId: string,
  input: { amount: number; bankName: string; accountHolder: string; rib: string; requestId: string },
  ip?: string
) {
  const clientRef = `${userId}:${input.requestId}`;
  const run = () =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.withdrawalRequest.findUnique({ where: { clientRef } });
      if (existing) return { withdrawal: existing, duplicate: true };
      const w = await tx.withdrawalRequest.create({
        data: { clientRef, userId, amount: input.amount, bankName: input.bankName, accountHolder: input.accountHolder, rib: input.rib }
      });
      // Montant bloqué tout de suite : il ne peut plus être misé pendant que l'admin traite la demande.
      await applyWalletOp(tx, {
        userId,
        amount: -input.amount,
        type: 'WITHDRAWAL',
        reason: `Demande de retrait vers ${input.bankName}`,
        idempotencyKey: `withdrawal:${w.id}`
      });
      await audit({ actorId: userId, action: 'payment.withdrawal_request', targetType: 'withdrawal', targetId: w.id, details: { amount: input.amount, bank: input.bankName }, ip }, tx);
      return { withdrawal: w, duplicate: false };
    });
  try {
    return await run();
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    return run();
  }
}

/** L'admin a exécuté le virement vers le RIB du joueur. */
export async function markWithdrawalPaid(id: string, adminId: string, reference: string, ip?: string) {
  const w = await prisma.$transaction(async (tx) => {
    const updated = await tx.withdrawalRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', note: reference, reviewedById: adminId, reviewedAt: new Date() }
    });
    if (updated.count === 0) {
      if (!(await tx.withdrawalRequest.findUnique({ where: { id } }))) throw notFound('Retrait introuvable');
      throw alreadyReviewed();
    }
    await audit({ actorId: adminId, action: 'admin.withdrawal_paid', targetType: 'withdrawal', targetId: id, details: { reason: reference }, ip }, tx);
    return tx.withdrawalRequest.findUniqueOrThrow({ where: { id } });
  });
  notifyWallet(w.userId);
}

/** Refus : le montant bloqué revient sur le solde du joueur. */
export async function rejectWithdrawal(id: string, adminId: string, reason: string, ip?: string) {
  const w = await prisma.$transaction(async (tx) => {
    const updated = await tx.withdrawalRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', note: reason, reviewedById: adminId, reviewedAt: new Date() }
    });
    if (updated.count === 0) {
      if (!(await tx.withdrawalRequest.findUnique({ where: { id } }))) throw notFound('Retrait introuvable');
      throw alreadyReviewed();
    }
    const row = await tx.withdrawalRequest.findUniqueOrThrow({ where: { id } });
    await applyWalletOp(tx, {
      userId: row.userId,
      amount: row.amount,
      type: 'WITHDRAWAL_REFUND',
      reason: `Retrait refusé : ${reason}`,
      idempotencyKey: `withdrawal-refund:${id}`,
      actorId: adminId
    });
    await audit({ actorId: adminId, action: 'admin.withdrawal_reject', targetType: 'withdrawal', targetId: id, details: { reason, amount: row.amount }, ip }, tx);
    return row;
  });
  notifyWallet(w.userId);
}

// ---------- Listes ----------

const depositView = (d: Prisma.DepositRequestGetPayload<{ include: { bank: { select: { name: true } }; user: { select: { username: true } }; reviewedBy: { select: { username: true } } } }>) => ({
  id: d.id,
  username: d.user.username,
  userId: d.userId,
  bank: d.bank.name,
  amount: d.amount,
  creditedAmount: d.creditedAmount,
  status: d.status,
  note: d.note,
  receiptMime: d.receiptMime,
  reviewedBy: d.reviewedBy?.username ?? null,
  reviewedAt: d.reviewedAt,
  createdAt: d.createdAt
});

const withdrawalView = (w: Prisma.WithdrawalRequestGetPayload<{ include: { user: { select: { username: true } }; reviewedBy: { select: { username: true } } } }>) => ({
  id: w.id,
  username: w.user.username,
  userId: w.userId,
  amount: w.amount,
  bankName: w.bankName,
  accountHolder: w.accountHolder,
  rib: w.rib,
  status: w.status,
  note: w.note,
  reviewedBy: w.reviewedBy?.username ?? null,
  reviewedAt: w.reviewedAt,
  createdAt: w.createdAt
});

const depositInclude = { bank: { select: { name: true } }, user: { select: { username: true } }, reviewedBy: { select: { username: true } } } as const;
const withdrawalInclude = { user: { select: { username: true } }, reviewedBy: { select: { username: true } } } as const;

export async function listDeposits(where: { userId?: string; status?: PaymentStatus }, take = 50) {
  const items = await prisma.depositRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take, include: depositInclude });
  return items.map(depositView);
}

export async function listWithdrawals(where: { userId?: string; status?: PaymentStatus }, take = 50) {
  const items = await prisma.withdrawalRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take, include: withdrawalInclude });
  return items.map(withdrawalView);
}
