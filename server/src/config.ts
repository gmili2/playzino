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
  WEB_DIST: z.string().optional()
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuration invalide :', parsed.error.flatten().fieldErrors);
  throw new Error('Variables d’environnement invalides');
}

export const config = parsed.data;
export const SIGNUP_CREDITS = 1000;
export const DAILY_BONUS = 200;
export const ALLOWED_STAKES = [0, 50, 100, 250, 500, 1000] as const;
export const TURN_SECONDS = [15, 30, 60] as const;
export const MAX_ADMIN_ADJUST = 100_000;
