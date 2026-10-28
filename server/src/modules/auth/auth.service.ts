import bcrypt from 'bcryptjs';
import { SIGNUP_CREDITS } from '../../config.js';
import { audit } from '../../lib/audit.js';
import { AppError, conflict } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { applyWalletOp } from '../wallet/wallet.service.js';

const BCRYPT_ROUNDS = 12;
const AVATAR_COLORS = ['#2F6BFF', '#E5484D', '#1FB57A', '#F5C21B', '#8B5CF6', '#22D3EE'];
// Hachage factice : la comparaison prend le même temps que l'utilisateur existe ou non.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', BCRYPT_ROUNDS);

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, BCRYPT_ROUNDS);
}

export async function registerUser(input: { email: string; username: string; password: string }, ip?: string) {
  const taken = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
    select: { email: true, username: true }
  });
  if (taken) {
    throw taken.email === input.email
      ? conflict('EMAIL_TAKEN', 'Cette adresse e-mail est déjà utilisée')
      : conflict('USERNAME_TAKEN', 'Ce nom d’utilisateur est déjà pris');
  }
  const passwordHash = await hashPassword(input.password);
  // Compte, profil, portefeuille et crédit de bienvenue : tout ou rien.
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        username: input.username,
        passwordHash,
        profile: { create: { avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] } },
        wallet: { create: { balance: 0 } }
      }
    });
    await applyWalletOp(tx, {
      userId: user.id,
      amount: SIGNUP_CREDITS,
      type: 'SIGNUP_BONUS',
      reason: 'Crédits de bienvenue',
      idempotencyKey: `signup:${user.id}`
    });
    await audit({ actorId: user.id, action: 'auth.register', targetType: 'user', targetId: user.id, ip }, tx);
    return user;
  });
}

export async function authenticate(login: string, password: string, ip?: string) {
  const key = login.trim();
  const user = await prisma.user.findFirst({
    where: key.includes('@') ? { email: key.toLowerCase() } : { username: key }
  });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await audit({ actorId: user?.id, action: 'auth.login_failed', targetType: 'user', targetId: user?.id, ip });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Identifiants incorrects');
  }
  if (user.status === 'SUSPENDED') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', user.suspendedReason ? `Compte suspendu : ${user.suspendedReason}` : 'Compte suspendu');
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ actorId: user.id, action: 'auth.login', targetType: 'user', targetId: user.id, ip });
  return user;
}
