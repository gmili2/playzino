import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { getBotLevel } from '../lib/settings.js';
import { makeAdmin, registered } from './helpers.js';

afterAll(() => prisma.$disconnect());

describe('niveau des robots', () => {
  it('réservé aux administrateurs', async () => {
    const a = await registered();
    expect((await a.get('/api/admin/settings/bot-level')).status).toBe(403);
    expect((await a.patch('/api/admin/settings/bot-level', { level: 'LOW' })).status).toBe(403);
  });

  it('l’admin choisit bas, moyen ou haut : enregistré, appliqué aux robots et journalisé', async () => {
    const admin = await registered();
    await makeAdmin(admin.user.id);
    expect((await admin.patch('/api/admin/settings/bot-level', { level: 'EXPERT' })).status).toBe(400);
    for (const level of ['HIGH', 'LOW', 'MEDIUM'] as const) {
      const r = await admin.patch('/api/admin/settings/bot-level', { level });
      expect(r.status).toBe(200);
      expect((await admin.get('/api/admin/settings/bot-level')).body.level).toBe(level);
      expect(await getBotLevel()).toBe(level);
    }
    expect((await prisma.setting.findUniqueOrThrow({ where: { key: 'botLevel' } })).value).toBe('MEDIUM');
    const logs = await prisma.auditLog.findMany({ where: { action: 'admin.bot_level', actorId: admin.user.id } });
    expect(logs).toHaveLength(3);
  });
});
