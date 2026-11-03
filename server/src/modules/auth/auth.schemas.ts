import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, '3 caractères minimum')
  .max(16, '16 caractères maximum')
  .regex(/^[A-Za-z0-9._-]+$/, 'Lettres latines, chiffres, « . », « - » ou « _ » uniquement');

export const emailSchema = z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(191);
export const passwordSchema = z.string().min(8, '8 caractères minimum').max(128, '128 caractères maximum');

/**
 * Téléphone marocain (mobile) : 06, 07 ou 08 suivi de 8 chiffres, ou +212 / 00212 / 212 suivi de 6, 7 ou 8.
 * Espaces, points, tirets et parenthèses acceptés ; enregistré au format national « 06XXXXXXXX ».
 */
export function normalizeMaPhone(raw: string) {
  let d = raw.trim().replace(/[\s.\-()]/g, '');
  if (d.startsWith('+212')) d = '0' + d.slice(4);
  else if (d.startsWith('00212')) d = '0' + d.slice(5);
  else if (d.startsWith('212') && d.length === 12) d = '0' + d.slice(3);
  return d;
}
export const phoneSchema = z
  .string()
  .max(20)
  .transform(normalizeMaPhone)
  .refine((v) => /^0[678]\d{8}$/.test(v), 'Numéro marocain attendu : 06, 07 ou 08 suivi de 8 chiffres (ou +212 6…)');

export const registerSchema = z.object({ email: emailSchema, username: usernameSchema, phone: phoneSchema, password: passwordSchema });
export const loginSchema = z.object({ login: z.string().trim().min(1).max(191), password: z.string().min(1).max(128) });
