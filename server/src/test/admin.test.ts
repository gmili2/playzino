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

  it('l’admin choisit bas, moyen, haut ou expert : enregistré, appliqué aux robots et journalisé', async () => {
    const admin = await registered();
    await makeAdmin(admin.user.id);
    expect((await admin.patch('/api/admin/settings/bot-level', { level: 'GOD' })).status).toBe(400);
    for (const level of ['HIGH', 'EXPERT', 'LOW', 'MEDIUM'] as const) {
      const r = await admin.patch('/api/admin/settings/bot-level', { level });
      expect(r.status).toBe(200);
      expect((await admin.get('/api/admin/settings/bot-level')).body.level).toBe(level);
      expect(await getBotLevel()).toBe(level);
    }
    expect((await prisma.setting.findUniqueOrThrow({ where: { key: 'botLevel' } })).value).toBe('MEDIUM');
    const logs = await prisma.auditLog.findMany({ where: { action: 'admin.bot_level', actorId: admin.user.id } });
    expect(logs).toHaveLength(4);
  });
});

describe('contact du support', () => {
  it('réglé par l’admin (numéro marocain, e-mail), lu par tous les joueurs, journalisé', async () => {
    const player = await registered();
    expect((await player.put('/api/admin/settings/support', { phone: '0612345678', email: '' })).status).toBe(403);
    const admin = await registered();
    await makeAdmin(admin.user.id);
    expect((await admin.put('/api/admin/settings/support', { phone: '12345', email: '' })).status).toBe(400);
    expect((await admin.put('/api/admin/settings/support', { phone: '', email: 'pas-un-email' })).status).toBe(400);
    const r = await admin.put('/api/admin/settings/support', { phone: '06 14 36 63 00', email: 'support@playzino.ma' });
    expect(r.body).toEqual({ phone: '0614366300', email: 'support@playzino.ma' });
    expect((await player.get('/api/support')).body).toEqual({ phone: '0614366300', email: 'support@playzino.ma' });
    expect(await prisma.auditLog.count({ where: { action: 'admin.support', actorId: admin.user.id } })).toBe(1);
    // Champs vides : le bouton « الدعم » disparaît côté joueur.
    await admin.put('/api/admin/settings/support', { phone: '', email: '' });
    expect((await player.get('/api/support')).body).toEqual({ phone: '', email: '' });
  });
});
