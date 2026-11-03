import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { audit } from '../../lib/audit.js';
import { AppError, conflict } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { applyWalletOp } from '../wallet/wallet.service.js';

/** Case de la roue : gain en pièces (0 = case perdante) et poids (probabilité relative). */
export interface WheelSegment {
  amount: number;
  weight: number;
}

const WHEEL_KEY = 'wheel';
export const WHEEL_MIN_SEGMENTS = 4;
export const WHEEL_MAX_SEGMENTS = 12;
export const WHEEL_MAX_AMOUNT = 100_000;
const TIME_ZONE = 'Africa/Casablanca';

// Gains alternés autour de la roue ; les gros lots sont rares.
export const DEFAULT_WHEEL: WheelSegment[] = [
  { amount: 0, weight: 20 },
  { amount: 10, weight: 24 },
  { amount: 50, weight: 12 },
  { amount: 20, weight: 20 },
  { amount: 100, weight: 8 },
  { amount: 25, weight: 16 },
  { amount: 200, weight: 5 },
  { amount: 15, weight: 13 },
  { amount: 500, weight: 2 }
];

/** Stockage compact dans Setting.value (255 caractères) : « 10:24,50:12,… ». */
const encode = (segs: WheelSegment[]) => segs.map((s) => `${s.amount}:${s.weight}`).join(',');
function decode(value: string | undefined): WheelSegment[] | null {
  if (!value) return null;
  const segs = value.split(',').map((p) => {
    const [amount, weight] = p.split(':').map(Number);
    return { amount, weight };
  });
  return validWheel(segs) ? segs : null;
}

export function validWheel(segs: WheelSegment[]) {
  return (
    segs.length >= WHEEL_MIN_SEGMENTS &&
    segs.length <= WHEEL_MAX_SEGMENTS &&
    segs.every((s) => Number.isInteger(s.amount) && s.amount >= 0 && s.amount <= WHEEL_MAX_AMOUNT && Number.isInteger(s.weight) && s.weight >= 0 && s.weight <= 1000) &&
    segs.some((s) => s.weight > 0)
  );
}

let cache: WheelSegment[] | null = null;

export async function getWheel(): Promise<WheelSegment[]> {
  if (cache) return cache;
  const row = await prisma.setting.findUnique({ where: { key: WHEEL_KEY } });
  cache = decode(row?.value) ?? DEFAULT_WHEEL;
  return cache;
}

export async function setWheel(segs: WheelSegment[], actorId: string, ip?: string) {
  if (!validWheel(segs)) throw new AppError(400, 'BAD_WHEEL', 'Roue invalide');
  const previous = encode(await getWheel());
  const value = encode(segs);
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key: WHEEL_KEY }, create: { key: WHEEL_KEY, value }, update: { value } });
    await audit({ actorId, action: 'admin.wheel', targetType: 'setting', targetId: WHEEL_KEY, details: { from: previous, to: value }, ip }, tx);
  });
  cache = segs;
}

// ---------- Tours payants ----------

/** Prix du n-ième tour payant du jour : base + n × hausse (n = 0 pour le premier). Plafond de tours par jour. */
export interface PaidWheel {
  basePrice: number;
  step: number;
  maxSpins: number;
}

const PAID_KEY = 'wheelPaid';
export const PAID_MAX_PRICE = 100_000;
export const PAID_MAX_SPINS = 100;
export const DEFAULT_PAID: PaidWheel = { basePrice: 50, step: 25, maxSpins: 10 };

export function validPaid(p: PaidWheel) {
  return (
    Number.isInteger(p.basePrice) && p.basePrice >= 1 && p.basePrice <= PAID_MAX_PRICE &&
    Number.isInteger(p.step) && p.step >= 0 && p.step <= PAID_MAX_PRICE &&
    Number.isInteger(p.maxSpins) && p.maxSpins >= 0 && p.maxSpins <= PAID_MAX_SPINS
  );
}

let paidCache: PaidWheel | null = null;

export async function getPaidWheel(): Promise<PaidWheel> {
  if (paidCache) return paidCache;
  const row = await prisma.setting.findUnique({ where: { key: PAID_KEY } });
  const [basePrice, step, maxSpins] = (row?.value ?? '').split(':').map(Number);
  const parsed = { basePrice, step, maxSpins };
  paidCache = row && validPaid(parsed) ? parsed : DEFAULT_PAID;
  return paidCache;
}

export async function setPaidWheel(p: PaidWheel, actorId: string, ip?: string) {
  if (!validPaid(p)) throw new AppError(400, 'BAD_WHEEL', 'Réglages invalides');
  const previous = await getPaidWheel();
  const value = `${p.basePrice}:${p.step}:${p.maxSpins}`;
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key: PAID_KEY }, create: { key: PAID_KEY, value }, update: { value } });
    await audit({ actorId, action: 'admin.wheel_paid', targetType: 'setting', targetId: PAID_KEY, details: { from: previous, to: p }, ip }, tx);
  });
  paidCache = p;
}

export const paidPrice = (p: PaidWheel, n: number) => p.basePrice + p.step * n;

/** Date du jour au Maroc (AAAA-MM-JJ) et instant du prochain minuit marocain. */
export function wheelDay(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const [y, m, d] = [Number(parts.year), Number(parts.month), Number(parts.day)];
  const localAsUtc = Date.UTC(y, m - 1, d, Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, nextSpinAt: new Date(Date.UTC(y, m - 1, d + 1) - offset) };
}

const paidPrefix = (userId: string, day: string) => `wheel-paid:${userId}:${day}:`;
const paidSpinsToday = (tx: Prisma.TransactionClient | typeof prisma, userId: string, day: string) =>
  tx.walletTransaction.count({ where: { type: 'WHEEL_SPIN', idempotencyKey: { startsWith: paidPrefix(userId, day) } } });

/** Tirage pondéré avec un générateur cryptographique (le client ne choisit jamais la case). */
export function pickSegment(segs: WheelSegment[]) {
  const total = segs.reduce((s, x) => s + x.weight, 0);
  let r = randomInt(total);
  for (let i = 0; i < segs.length; i++) {
    r -= segs[i].weight;
    if (r < 0) return i;
  }
  return segs.length - 1;
}

/** La roue ne se joue qu'en tours payants (le tour gratuit quotidien a été supprimé). */
export async function wheelState(userId: string) {
  const [segs, paid] = await Promise.all([getWheel(), getPaidWheel()]);
  const { day } = wheelDay();
  const paidSpins = await paidSpinsToday(prisma, userId, day);
  return {
    paid: {
      enabled: paid.maxSpins > 0,
      spinsToday: paidSpins,
      maxSpins: paid.maxSpins,
      price: paidSpins < paid.maxSpins ? paidPrice(paid, paidSpins) : null,
      step: paid.step
    },
    segments: segs.map((s) => s.amount)
  };
}

/**
 * Tour payant : le prix (qui augmente à chaque tour du jour) est débité, puis le gain crédité, dans une seule transaction.
 * Le numéro du tour fait partie des clés : deux clics simultanés ne peuvent pas jouer deux fois le même tour.
 */
export async function paidSpin(userId: string) {
  const [segs, paid] = await Promise.all([getWheel(), getPaidWheel()]);
  const { day } = wheelDay();
  if (paid.maxSpins === 0) throw conflict('PAID_WHEEL_OFF', 'Tours payants désactivés');
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const n = await paidSpinsToday(tx, userId, day);
        if (n >= paid.maxSpins) throw conflict('PAID_LIMIT', 'Nombre maximal de tours payants atteint aujourd’hui');
        const price = paidPrice(paid, n);
        const index = pickSegment(segs);
        const amount = segs[index].amount;
        await applyWalletOp(tx, { userId, amount: -price, type: 'WHEEL_SPIN', reason: `Tour payant n° ${n + 1} (${day})`, idempotencyKey: paidPrefix(userId, day) + n });
        const r = await applyWalletOp(tx, { userId, amount, type: 'WHEEL_PRIZE', reason: `Gain du tour payant n° ${n + 1}`, idempotencyKey: `wheel-prize:${userId}:${day}:${n}`, allowZero: true });
        const next = n + 1 < paid.maxSpins ? paidPrice(paid, n + 1) : null;
        return { index, amount, price, balance: r.balance, spinsToday: n + 1, nextPrice: next };
      });
    } catch (e) {
      // Tour concurrent qui a pris le même numéro : on recompte et on rejoue.
      const clash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
      if (!clash || attempt >= 4) throw e;
    }
  }
}

/** Tours et pièces distribuées depuis minuit (heure du Maroc). */
export async function wheelStats() {
  const { day } = wheelDay();
  const where = { type: 'DAILY_BONUS' as const, AND: [{ idempotencyKey: { startsWith: 'wheel:' } }, { idempotencyKey: { endsWith: ':' + day } }] };
  const [agg, recent] = await Promise.all([
    prisma.walletTransaction.aggregate({ where, _count: true, _sum: { amount: true } }),
    prisma.walletTransaction.findMany({
      where: { type: 'DAILY_BONUS', idempotencyKey: { startsWith: 'wheel:' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { wallet: { select: { user: { select: { username: true } } } } }
    })
  ]);
  const paidWhere = (type: 'WHEEL_SPIN' | 'WHEEL_PRIZE') => ({ type, idempotencyKey: { contains: `:${day}:` } });
  const [stakes, prizes] = await Promise.all([
    prisma.walletTransaction.aggregate({ where: paidWhere('WHEEL_SPIN'), _count: true, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: paidWhere('WHEEL_PRIZE'), _sum: { amount: true } })
  ]);
  return {
    spinsToday: agg._count,
    coinsToday: agg._sum.amount ?? 0,
    paidSpinsToday: stakes._count,
    paidCollectedToday: -(stakes._sum.amount ?? 0),
    paidPrizesToday: prizes._sum.amount ?? 0,
    recent: recent.map((t) => ({ id: t.id, username: t.wallet.user.username, amount: t.amount, createdAt: t.createdAt }))
  };
}
