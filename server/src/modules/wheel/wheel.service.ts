import { randomInt } from 'node:crypto';
import { audit } from '../../lib/audit.js';
import { AppError, conflict } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { walletOp } from '../wallet/wallet.service.js';

/** Case de la roue : gain en pièces et poids (probabilité relative). */
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
    segs.every((s) => Number.isInteger(s.amount) && s.amount >= 1 && s.amount <= WHEEL_MAX_AMOUNT && Number.isInteger(s.weight) && s.weight >= 0 && s.weight <= 1000) &&
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

const spinKey = (userId: string, day: string) => `wheel:${userId}:${day}`;

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

export async function wheelState(userId: string) {
  const segs = await getWheel();
  const { day, nextSpinAt } = wheelDay();
  const today = await prisma.walletTransaction.findUnique({ where: { idempotencyKey: spinKey(userId, day) } });
  return {
    segments: segs.map((s) => s.amount),
    spunToday: !!today,
    // Case affichée sous l'aiguille après le tour du jour.
    todayIndex: today ? Math.max(0, segs.findIndex((s) => s.amount === today.amount)) : null,
    todayAmount: today?.amount ?? null,
    nextSpinAt
  };
}

/** Un tour par joueur et par jour (heure du Maroc) : la clé d'idempotence l'impose en base. */
export async function spin(userId: string) {
  const segs = await getWheel();
  const { day, nextSpinAt } = wheelDay();
  const key = spinKey(userId, day);
  const already = () => conflict('ALREADY_SPUN', 'Tour du jour déjà joué');
  if (await prisma.walletTransaction.findUnique({ where: { idempotencyKey: key } })) throw already();
  const index = pickSegment(segs);
  try {
    const r = await walletOp({ userId, amount: segs[index].amount, type: 'DAILY_BONUS', reason: `Roue de la fortune ${day}`, idempotencyKey: key });
    if (r.duplicate) throw already();
    return { index, amount: segs[index].amount, balance: r.balance, nextSpinAt };
  } catch (e) {
    // Deux tours simultanés : le second tombe sur la clé déjà prise avec un autre gain.
    if (e instanceof AppError && e.code === 'IDEMPOTENCY_MISMATCH') throw already();
    throw e;
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
  return {
    spinsToday: agg._count,
    coinsToday: agg._sum.amount ?? 0,
    recent: recent.map((t) => ({ id: t.id, username: t.wallet.user.username, amount: t.amount, createdAt: t.createdAt }))
  };
}
