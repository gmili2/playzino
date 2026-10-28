import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadTestEnv } from './loadEnv.js';

/**
 * Applique les migrations en attente sur la base de test (non destructif).
 * Sur une base de test vide, toutes les migrations sont rejouées depuis zéro.
 * Les tests créent des utilisateurs uniques : aucune remise à zéro n'est nécessaire.
 */
export default function setup() {
  if (process.env.SKIP_DB_SETUP) return;
  loadTestEnv();
  execSync('npx prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '../..'),
    env: process.env,
    stdio: 'pipe'
  });
}
