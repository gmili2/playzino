import { prisma } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { registerUser } from '../modules/auth/auth.service.js';

/**
 * Crée (ou promeut) le compte administrateur défini par ADMIN_EMAIL / ADMIN_USERNAME / ADMIN_PASSWORD.
 * Sans effet si ces variables sont absentes. Le compte reçoit ses crédits de bienvenue comme tout le monde.
 */
export async function ensureAdminFromEnv() {
  const { ADMIN_EMAIL: email, ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = process.env;
  if (!email || !username || !password) return null;
  let user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    if (password.length < 8) throw new Error('ADMIN_PASSWORD : 8 caractères minimum');
    user = await registerUser({ email: email.toLowerCase(), username, password });
    console.log(`Compte administrateur créé : ${email}`);
  }
  if (user.role !== 'ADMIN') {
    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    await audit({ action: 'admin.promote_from_env', targetType: 'user', targetId: user.id });
  }
  return user.id;
}
