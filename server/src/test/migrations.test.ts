import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';

afterAll(() => prisma.$disconnect());

// La base de test a été recréée en rejouant toutes les migrations (globalSetup).
describe('migrations MariaDB', () => {
  it('toutes les tables utilisent InnoDB', async () => {
    const rows = await prisma.$queryRaw<{ TABLE_NAME: string; ENGINE: string }[]>`
      SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
    const names = rows.map((r) => r.TABLE_NAME);
    expect(names).toEqual(expect.arrayContaining([
      'User', 'Profile', 'Wallet', 'WalletTransaction', 'Room', 'RoomPlayer', 'Game', 'GamePlayer', 'GameMove', 'AuditLog'
    ]));
    expect(rows.every((r) => r.ENGINE === 'InnoDB')).toBe(true);
  });

  it('les clés étrangères sont en place', async () => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()`;
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(15);
  });

  it('les contraintes CHECK et uniques sont en place', async () => {
    const checks = await prisma.$queryRaw<{ CONSTRAINT_NAME: string }[]>`
      SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()`;
    expect(checks.map((c) => c.CONSTRAINT_NAME)).toEqual(expect.arrayContaining(['Wallet_balance_non_negative', 'Room_stake_non_negative']));
    const uniques = await prisma.$queryRaw<{ INDEX_NAME: string }[]>`
      SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0`;
    expect(uniques.map((u) => u.INDEX_NAME)).toEqual(expect.arrayContaining([
      'User_email_key', 'User_username_key', 'Wallet_userId_key', 'WalletTransaction_idempotencyKey_key', 'Room_code_key', 'RoomPlayer_roomId_userId_key'
    ]));
  });

  it('aucune migration en attente', async () => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NULL`;
    expect(Number(rows[0].n)).toBe(0);
  });
});
