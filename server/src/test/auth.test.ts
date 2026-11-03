import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { client, phone, registered, uniq } from './helpers.js';

afterAll(() => prisma.$disconnect());

describe('authentification', () => {
  it('inscription : 201, cookie httpOnly, solde à 0 et mot de passe haché', async () => {
    const c = client();
    const name = 'u' + uniq();
    const tel = phone();
    const res = await c.post('/api/auth/register', { email: `${name}@Test.local`, username: name, phone: `+212 ${tel.slice(1, 4)}-${tel.slice(4)}`, password: 'motdepasse-123' });
    expect(res.status).toBe(201);
    expect(res.body.user.balance).toBe(0);
    expect(res.body.user.role).toBe('USER');
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/pc_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    const db = await prisma.user.findUniqueOrThrow({ where: { username: name } });
    expect(db.email).toBe(`${name}@test.local`);
    expect(db.phone).toBe(tel); // +212 converti au format 06…
    expect(res.body.user.phone).toBe(tel);
    expect(db.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(db.passwordHash).not.toContain('motdepasse');
    const txs = await prisma.walletTransaction.findMany({ where: { wallet: { userId: db.id } } });
    expect(txs).toHaveLength(0);
  });

  it('refuse les doublons d’e-mail, de nom et de téléphone', async () => {
    const a = await registered();
    const c = client();
    const r1 = await c.post('/api/auth/register', { email: `${a.user.username}@test.local`, username: 'x' + uniq(), phone: phone(), password: 'motdepasse-123' });
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe('EMAIL_TAKEN');
    const r2 = await c.post('/api/auth/register', { email: `${uniq()}@test.local`, username: a.user.username, phone: phone(), password: 'motdepasse-123' });
    expect(r2.body.error.code).toBe('USERNAME_TAKEN');
    const used = (await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).phone!;
    const r3 = await c.post('/api/auth/register', { email: `${uniq()}@test.local`, username: 'x' + uniq(), phone: used, password: 'motdepasse-123' });
    expect(r3.body.error.code).toBe('PHONE_TAKEN');
  });

  it('téléphone obligatoire, mobile marocain ; ajout ou changement depuis le profil', async () => {
    const base = { email: `${uniq()}@test.local`, username: 'x' + uniq(), password: 'motdepasse-123' };
    for (const bad of [undefined, '0512345678', '0612345', '+33612345678']) {
      const r = await client().post('/api/auth/register', { ...base, phone: bad });
      expect(r.status).toBe(400);
      expect(Object.keys(r.body.error.details)).toContain('phone');
    }
    const a = await registered();
    const tel = phone();
    const r = await a.patch('/api/me', { phone: tel.replace(/(\d{2})(?=\d)/g, '$1 ') });
    expect(r.status).toBe(200);
    expect(r.body.user.phone).toBe(tel);
    const b = await registered();
    expect((await b.patch('/api/me', { phone: tel })).body.error.code).toBe('PHONE_TAKEN');
  });

  it('valide les champs', async () => {
    const r = await client().post('/api/auth/register', { email: 'pas-un-email', username: 'a', password: '123' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(r.body.error.details)).toEqual(expect.arrayContaining(['email', 'username', 'password']));
  });

  it('connexion par e-mail ou nom, refus avec un mauvais mot de passe', async () => {
    const a = await registered();
    const ok1 = await client().post('/api/auth/login', { login: a.user.username, password: 'motdepasse-123' });
    expect(ok1.status).toBe(200);
    const ok2 = await client().post('/api/auth/login', { login: `${a.user.username}@TEST.local`, password: 'motdepasse-123' });
    expect(ok2.status).toBe(200);
    const bad = await client().post('/api/auth/login', { login: a.user.username, password: 'mauvais-mdp' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('routes protégées : 401 sans session, déconnexion efficace', async () => {
    expect((await client().get('/api/me')).status).toBe(401);
    const a = await registered();
    expect((await a.get('/api/me')).status).toBe(200);
    expect((await a.post('/api/auth/logout')).status).toBe(204);
    expect((await a.get('/api/me')).status).toBe(401);
  });

  it('exige l’en-tête anti-CSRF sur les requêtes qui modifient l’état', async () => {
    const a = await registered();
    const r = await a.agent.patch('/api/me').send({ bio: 'x' });
    expect(r.status).toBe(403);
  });

  it('profil modifiable ; le rôle ne peut pas être modifié par l’utilisateur', async () => {
    const a = await registered();
    const r = await a.patch('/api/me', { bio: 'Joueur du dimanche', soundEnabled: false });
    expect(r.status).toBe(200);
    expect(r.body.user.profile).toMatchObject({ bio: 'Joueur du dimanche', soundEnabled: false });
    const esc = await a.patch('/api/me', { role: 'ADMIN' });
    expect(esc.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).role).toBe('USER');
  });

  it('changement de mot de passe : invalide les autres sessions', async () => {
    const a = await registered();
    const other = client();
    await other.post('/api/auth/login', { login: a.user.username, password: 'motdepasse-123' });
    expect((await other.get('/api/me')).status).toBe(200);
    const r = await a.post('/api/me/password', { currentPassword: 'motdepasse-123', newPassword: 'nouveau-mdp-456' });
    expect(r.status).toBe(204);
    expect((await a.get('/api/me')).status).toBe(200);
    expect((await other.get('/api/me')).status).toBe(401);
  });

  it('l’administration est refusée aux utilisateurs normaux', async () => {
    const a = await registered();
    const r = await a.get('/api/admin/users');
    expect(r.status).toBe(403);
  });
});
