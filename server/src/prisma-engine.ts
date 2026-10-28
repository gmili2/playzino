import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

/**
 * À importer EN PREMIER (avant Prisma).
 * - Hébergement cPanel (CloudLinux/RHEL) : Prisma détecte mal OpenSSL sous Passenger ; on désigne le moteur RHEL.
 * - Le compte mutualisé limite le nombre de threads : 2 threads Tokio suffisent pour le moteur Prisma.
 * - Charge un éventuel fichier .env placé à côté de l'application (Node.js App de cPanel).
 * Sans effet en local (macOS) ni dans Docker (Debian).
 */
const envFile = [resolve(import.meta.dirname, '../.env'), resolve(import.meta.dirname, '../../.env')].find(existsSync);
if (envFile && process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* fichier illisible : on garde l'environnement existant */
  }
}

if (process.platform === 'linux') {
  process.env.TOKIO_WORKER_THREADS ??= '2';
  if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY && existsSync('/etc/redhat-release')) {
    const ssl = existsSync('/usr/lib64/libssl.so.3') ? '3.0.x' : existsSync('/usr/lib64/libssl.so.1.1') ? '1.1.x' : null;
    if (ssl) {
      try {
        const dir = dirname(createRequire(import.meta.url).resolve('.prisma/client/index.js'));
        const lib = join(dir, `libquery_engine-rhel-openssl-${ssl}.so.node`);
        if (existsSync(lib)) process.env.PRISMA_QUERY_ENGINE_LIBRARY = lib;
      } catch {
        /* client Prisma non généré */
      }
    }
  }
}
