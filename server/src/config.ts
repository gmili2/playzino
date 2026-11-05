import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().startsWith('mysql://'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit contenir au moins 32 caractères'),
  CORS_ORIGIN: z.string().default('http://localhost:5180'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Délai accordé à un joueur déconnecté avant défaite par abandon. */
  RECONNECT_GRACE_SECONDS: z.coerce.number().int().positive().default(60),
  /** Temps de déconnexion cumulé autorisé par joueur et par partie : au-delà, défaite (ou annulation). */
  OFFLINE_BUDGET_SECONDS: z.coerce.number().int().positive().default(120),
  WEB_DIST: z.string().optional(),
  /** Reçus de virement envoyés par les joueurs (hors du dossier déployé, jamais servis en statique). */
  UPLOAD_DIR: z.string().optional()
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuration invalide :', parsed.error.flatten().fieldErrors);
  throw new Error('Variables d’environnement invalides');
}

export const config = parsed.data;
// Solde de départ nul : les pièces viennent de la roue quotidienne (modules/wheel) et de l'administration.
export const SIGNUP_CREDITS = 0;
export const ALLOWED_STAKES = [0, 5, 10, 15, 20, 30, 40, 50, 100] as const;
export const TURN_SECONDS = [15, 30, 60] as const;
export const MAX_ADMIN_ADJUST = 100_000;
// Dépôts et retraits par virement (1 DH = 1 pièce), validés à la main par l'administration.
export const DEPOSIT_MIN = 50;
export const DEPOSIT_MAX = 50_000;
export const WITHDRAWAL_MIN = 100;
export const WITHDRAWAL_MAX = 50_000;
export const MAX_PENDING_DEPOSITS = 3;
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
