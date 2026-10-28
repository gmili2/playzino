import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Charge ../.env et bascule sur la base de test : les tests ne touchent jamais la base de dev. */
export function loadTestEnv() {
  if (process.env.PARCHEESI_TEST_ENV === '1') return;
  const envPath = resolve(import.meta.dirname, '../../../.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL manquant (voir .env.example)');
  if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL doit différer de DATABASE_URL');
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.PARCHEESI_TEST_ENV = '1';
  process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret-123';
  process.env.CORS_ORIGIN ||= 'http://localhost:5180';
}
