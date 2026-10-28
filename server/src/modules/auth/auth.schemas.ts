import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, '3 caractères minimum')
  .max(16, '16 caractères maximum')
  .regex(/^[A-Za-z0-9._-]+$/, 'Lettres latines, chiffres, « . », « - » ou « _ » uniquement');

export const emailSchema = z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(191);
export const passwordSchema = z.string().min(8, '8 caractères minimum').max(128, '128 caractères maximum');

export const registerSchema = z.object({ email: emailSchema, username: usernameSchema, password: passwordSchema });
export const loginSchema = z.object({ login: z.string().trim().min(1).max(191), password: z.string().min(1).max(128) });
