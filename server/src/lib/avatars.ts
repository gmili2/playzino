import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from '../config.js';
import { audit } from './audit.js';
import { badRequest, notFound } from './errors.js';
import { prisma } from './prisma.js';

/** Photos de profil : à côté des reçus, dans le dossier uploads (gardé d'un déploiement à l'autre). */
export const AVATAR_DIR = resolve(config.UPLOAD_DIR ?? resolve(import.meta.dirname, '../../uploads'), 'avatars');
/** Le navigateur envoie une image déjà réduite (256 × 256) : quelques dizaines de ko suffisent largement. */
export const AVATAR_MAX_BYTES = 600_000;
export const AVATAR_FILE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

const TYPES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' }
];
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Adresse publique de la photo (nom de fichier aléatoire, changé à chaque envoi : mise en cache sans risque). */
export const avatarUrl = (file: string | null | undefined) => (file ? `/api/avatars/${file}` : null);

/** Enregistre la nouvelle photo (type vérifié par ses premiers octets) et supprime l'ancienne. */
export async function setAvatar(userId: string, base64: string, ip?: string) {
  const data = Buffer.from(base64.replace(/^data:[^,]*,/, ''), 'base64');
  if (data.length === 0) throw badRequest('BAD_IMAGE', 'Image vide');
  if (data.length > AVATAR_MAX_BYTES) throw badRequest('IMAGE_TOO_LARGE', 'Image trop volumineuse');
  const type = TYPES.find((t) => t.test(data));
  if (!type) throw badRequest('BAD_IMAGE', 'Format accepté : JPG, PNG ou WEBP');
  const file = `${randomUUID()}.${type.ext}`;
  await mkdir(AVATAR_DIR, { recursive: true });
  await writeFile(resolve(AVATAR_DIR, file), data, { flag: 'wx' });
  const before = await prisma.profile.findUniqueOrThrow({ where: { userId }, select: { avatarFile: true } });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.profile.update({ where: { userId }, data: { avatarFile: file } });
      await audit({ actorId: userId, action: 'user.avatar', targetType: 'user', targetId: userId, ip }, tx);
    });
  } catch (e) {
    await unlink(resolve(AVATAR_DIR, file)).catch(() => {});
    throw e;
  }
  if (before.avatarFile) await unlink(resolve(AVATAR_DIR, before.avatarFile)).catch(() => {});
  return avatarUrl(file);
}

/** Retire la photo (par le joueur, ou par l'admin pour une image inappropriée). */
export async function removeAvatar(userId: string, actorId: string, ip?: string) {
  const p = await prisma.profile.findUnique({ where: { userId }, select: { avatarFile: true } });
  if (!p) throw notFound('Utilisateur introuvable');
  if (!p.avatarFile) return;
  await prisma.$transaction(async (tx) => {
    await tx.profile.update({ where: { userId }, data: { avatarFile: null } });
    await audit({ actorId, action: actorId === userId ? 'user.avatar_remove' : 'admin.avatar_remove', targetType: 'user', targetId: userId, ip }, tx);
  });
  await unlink(resolve(AVATAR_DIR, p.avatarFile)).catch(() => {});
}

export async function readAvatar(file: string) {
  if (!AVATAR_FILE.test(file)) throw notFound('Image introuvable');
  try {
    return { data: await readFile(resolve(AVATAR_DIR, file)), mime: MIME[file.split('.').pop()!] };
  } catch {
    throw notFound('Image introuvable');
  }
}
