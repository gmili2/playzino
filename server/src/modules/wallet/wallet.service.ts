import { Prisma, type TxType, type WalletTransaction } from '@prisma/client';
import { AppError, conflict } from '../../lib/errors.js';
import { prisma, type Tx } from '../../lib/prisma.js';

export interface WalletOp {
  userId: string;
  /** Montant signé : > 0 crédit, < 0 débit. */
  amount: number;
  type: TxType;
  reason: string;
  /** Identifie l'opération métier : la rejouer ne produit jamais un second mouvement. */
  idempotencyKey: string;
  roomId?: string;
  gameId?: string;
  actorId?: string;
}

export interface WalletOpResult {
  transaction: WalletTransaction;
  balance: number;
  duplicate: boolean;
}

export const insufficientFunds = () => new AppError(409, 'INSUFFICIENT_FUNDS', 'Solde insuffisant');

/**
 * Mouvement de solde à l'intérieur d'une transaction existante.
 * La mise à jour est conditionnelle (balance + amount >= 0) et atomique côté MariaDB :
 * deux débits concurrents ne peuvent pas rendre le solde négatif.
 */
export async function applyWalletOp(tx: Tx, op: WalletOp): Promise<WalletOpResult> {
  if (!Number.isSafeInteger(op.amount) || op.amount === 0) {
    throw new AppError(400, 'BAD_AMOUNT', 'Montant invalide');
  }
  const existing = await tx.walletTransaction.findUnique({
    where: { idempotencyKey: op.idempotencyKey },
    include: { wallet: true }
  });
  if (existing) {
    if (existing.wallet.userId !== op.userId || existing.amount !== op.amount) {
      throw conflict('IDEMPOTENCY_MISMATCH', 'Clé d’opération déjà utilisée pour une autre opération');
    }
    return { transaction: existing, balance: existing.wallet.balance, duplicate: true };
  }

  const where: Prisma.WalletWhereInput = { userId: op.userId };
  if (op.amount < 0) where.balance = { gte: -op.amount };
  const updated = await tx.wallet.updateMany({ where, data: { balance: { increment: op.amount } } });
  if (updated.count === 0) {
    const wallet = await tx.wallet.findUnique({ where: { userId: op.userId } });
    if (!wallet) throw new AppError(404, 'WALLET_NOT_FOUND', 'Portefeuille introuvable');
    throw insufficientFunds();
  }
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: op.userId } });
  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: op.type,
      amount: op.amount,
      balanceAfter: wallet.balance,
      reason: op.reason,
      idempotencyKey: op.idempotencyKey,
      roomId: op.roomId,
      gameId: op.gameId,
      actorId: op.actorId
    }
  });
  return { transaction, balance: wallet.balance, duplicate: false };
}

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Opération autonome : sa propre transaction, sûre face aux doubles soumissions concurrentes. */
export async function walletOp(op: WalletOp): Promise<WalletOpResult> {
  try {
    return await prisma.$transaction((tx) => applyWalletOp(tx, op));
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Une requête concurrente a inscrit la même clé entre-temps : on renvoie son résultat.
    return prisma.$transaction((tx) => applyWalletOp(tx, op));
  }
}

export async function getWallet(userId: string) {
  return prisma.wallet.findUniqueOrThrow({ where: { userId } });
}

export async function listTransactions(userId: string, take = 50, cursor?: string) {
  const wallet = await getWallet(userId);
  const items = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const hasMore = items.length > take;
  return { balance: wallet.balance, items: items.slice(0, take), nextCursor: hasMore ? items[take - 1].id : null };
}
