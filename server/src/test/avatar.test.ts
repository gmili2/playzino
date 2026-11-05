import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AVATAR_DIR } from '../lib/avatars.js';
import { prisma } from '../lib/prisma.js';
import { client, makeAdmin, registered } from './helpers.js';

afterAll(() => prisma.$disconnect());

// Plus petit PNG valide (1 × 1 pixel).
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const fileOf = (url: string) => resolve(AVATAR_DIR, url.split('/').pop()!);

describe('photo de profil', () => {
  it('le joueur choisit sa photo : enregistrée, publique, remplacée puis supprimée (fichiers nettoyés)', async () => {
    const a = await registered();
    const put = await a.agent.put('/api/me/avatar').set({ 'X-Requested-With': 'parcheesi' }).send({ image: PNG });
    expect(put.status).toBe(200);
    const url = put.body.user.profile.avatarUrl as string;
    expect(url).toMatch(/^\/api\/avatars\/[0-9a-f-]{36}\.png$/);
    expect(existsSync(fileOf(url))).toBe(true);

    // Visible sans être connecté (salon, parties), avec le bon type.
    const img = await client().agent.get(url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect((await a.get('/api/me')).body.user.profile.avatarUrl).toBe(url);

    // Nouvelle photo : l'ancien fichier disparaît.
    const again = await a.agent.put('/api/me/avatar').set({ 'X-Requested-With': 'parcheesi' }).send({ image: PNG });
    const url2 = again.body.user.profile.avatarUrl as string;
    expect(url2).not.toBe(url);
    expect(existsSync(fileOf(url))).toBe(false);

    const del = await a.agent.delete('/api/me/avatar').set({ 'X-Requested-With': 'parcheesi' });
    expect(del.body.user.profile.avatarUrl).toBeNull();
    expect(existsSync(fileOf(url2))).toBe(false);
    expect((await client().agent.get(url2)).status).toBe(404);
  });

  it('refuse ce qui n’est pas une image (type vérifié par le contenu) et les noms de fichier forgés', async () => {
    const a = await registered();
    const fake = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
    const r = await a.agent.put('/api/me/avatar').set({ 'X-Requested-With': 'parcheesi' }).send({ image: fake });
    expect(r.status).toBe(400);
    expect((await client().agent.get('/api/avatars/..%2F..%2F.env')).status).toBe(404);
    expect((await client().agent.put('/api/me/avatar').set({ 'X-Requested-With': 'parcheesi' }).send({ image: PNG })).status).toBe(401);
  });

  it('l’admin retire une photo inappropriée ; un joueur ne peut pas le faire', async () => {
    const a = await registered();
    await a.agent.put('/api/me/avatar').set({ 'X-Requested-With': 'parcheesi' }).send({ image: PNG });
    const other = await registered();
    expect((await other.agent.delete(`/api/admin/users/${a.user.id}/avatar`).set({ 'X-Requested-With': 'parcheesi' })).status).toBe(403);
    const admin = await registered();
    await makeAdmin(admin.user.id);
    expect((await admin.agent.delete(`/api/admin/users/${a.user.id}/avatar`).set({ 'X-Requested-With': 'parcheesi' })).status).toBe(204);
    expect((await a.get('/api/me')).body.user.profile.avatarUrl).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'admin.avatar_remove', targetId: a.user.id } })).toBe(1);
  });
});
