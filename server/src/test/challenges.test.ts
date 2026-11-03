import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';

process.env.CHALLENGE_TTL_MS = '600';

const { prisma } = await import('../lib/prisma.js');
const { gameManager } = await import('../realtime/gameManager.js');
const { connectSocket, registered, startServer } = await import('./helpers.js');

let server: Awaited<ReturnType<typeof startServer>>;
const sockets: Socket[] = [];

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  gameManager.shutdown();
  await server.close();
  await prisma.$disconnect();
});

/** Joueur connecté (socket ouvert = « en ligne »). */
async function online(credits = 1000) {
  const u = await registered(server.url, credits);
  const s = await connectSocket(server.url, u.cookie);
  sockets.push(s);
  return { ...u, s };
}

const next = (s: Socket, event: string) => new Promise<any>((resolve) => s.once(event, resolve));
const balance = async (userId: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;

describe('joueurs en ligne et défis', () => {
  it('liste des joueurs en ligne : sans moi, sans les absents ni ceux qui se cachent', async () => {
    const a = await online();
    const b = await online();
    const hidden = await online();
    await prisma.profile.update({ where: { userId: hidden.user.id }, data: { hideOnline: true } });
    const offline = await registered(server.url);
    const r = await a.get('/api/challenges/online');
    expect(r.status).toBe(200);
    const ids = r.body.players.map((p: { id: string }) => p.id);
    expect(ids).toContain(b.user.id);
    expect(ids).not.toContain(a.user.id);
    expect(ids).not.toContain(hidden.user.id);
    expect(ids).not.toContain(offline.user.id);
    expect(r.body.players.find((p: { id: string }) => p.id === b.user.id)).toMatchObject({ username: b.user.username, status: 'available' });
  });

  it('défi accepté : table privée à deux, mises débitées, partie lancée pour les deux', async () => {
    const a = await online();
    const b = await online();
    const incoming = next(b.s, 'challenge:new');
    const sent = await a.post('/api/challenges', { toUserId: b.user.id, stake: 100, gameType: 'PARCHEESI' });
    expect(sent.status).toBe(201);
    const ch = await incoming;
    expect(ch).toMatchObject({ id: sent.body.id, stake: 100, gameType: 'PARCHEESI', from: { id: a.user.id, username: a.user.username } });

    const accepted = next(a.s, 'challenge:accepted');
    const r = await b.post(`/api/challenges/${ch.id}/accept`);
    expect(r.status).toBe(200);
    expect(r.body.room).toMatchObject({ status: 'PLAYING', stake: 100, visibility: 'PRIVATE' });
    expect((await accepted).roomId).toBe(r.body.room.id);
    expect(await balance(a.user.id)).toBe(900);
    expect(await balance(b.user.id)).toBe(900);
    // Accepter deux fois ne crée rien de plus.
    expect((await b.post(`/api/challenges/${ch.id}/accept`)).status).toBe(404);
    // Pendant la partie, les deux apparaissent « en partie » et ne peuvent pas être défiés.
    const c = await online();
    expect((await c.get('/api/challenges/online')).body.players.find((p: { id: string }) => p.id === a.user.id)?.status).toBe('playing');
    expect((await c.post('/api/challenges', { toUserId: a.user.id, stake: 0 })).body.error.code).toBe('PLAYER_BUSY');
  });

  it('refus, annulation et expiration préviennent l’autre joueur', async () => {
    const a = await online();
    const b = await online();
    let sent = await a.post('/api/challenges', { toUserId: b.user.id, stake: 0 });
    const declined = next(a.s, 'challenge:declined');
    expect((await b.post(`/api/challenges/${sent.body.id}/decline`)).status).toBe(204);
    expect((await declined).id).toBe(sent.body.id);

    sent = await a.post('/api/challenges', { toUserId: b.user.id, stake: 0 });
    const cancelled = next(b.s, 'challenge:cancelled');
    expect((await b.post(`/api/challenges/${sent.body.id}/cancel`)).status).toBe(404); // seul le lanceur annule
    expect((await a.post(`/api/challenges/${sent.body.id}/cancel`)).status).toBe(204);
    expect((await cancelled).id).toBe(sent.body.id);

    const expiredA = next(a.s, 'challenge:expired');
    const expiredB = next(b.s, 'challenge:expired');
    sent = await a.post('/api/challenges', { toUserId: b.user.id, stake: 0 });
    expect((await expiredA).id).toBe(sent.body.id);
    expect((await expiredB).id).toBe(sent.body.id);
    expect((await b.post(`/api/challenges/${sent.body.id}/accept`)).status).toBe(404);
  });

  it('refusé : joueur hors ligne, soi-même, solde insuffisant, défis désactivés, mise non autorisée', async () => {
    const a = await online(0);
    const b = await online();
    const off = await registered(server.url);
    expect((await a.post('/api/challenges', { toUserId: off.user.id, stake: 0 })).body.error.code).toBe('PLAYER_OFFLINE');
    expect((await a.post('/api/challenges', { toUserId: a.user.id, stake: 0 })).body.error.code).toBe('BAD_CHALLENGE');
    expect((await a.post('/api/challenges', { toUserId: b.user.id, stake: 50 })).body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect((await a.post('/api/challenges', { toUserId: b.user.id, stake: 70 })).body.error.code).toBe('VALIDATION_ERROR');
    await prisma.profile.update({ where: { userId: b.user.id }, data: { invitesEnabled: false } });
    expect((await a.post('/api/challenges', { toUserId: b.user.id, stake: 0 })).body.error.code).toBe('INVITES_DISABLED');
  });

  it('le joueur défié n’a pas de quoi suivre la mise : rien n’est débité au lanceur', async () => {
    const a = await online();
    const b = await online(0);
    const sent = await a.post('/api/challenges', { toUserId: b.user.id, stake: 100 });
    const failed = next(a.s, 'challenge:failed');
    const r = await b.post(`/api/challenges/${sent.body.id}/accept`);
    expect(r.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect((await failed).code).toBe('INSUFFICIENT_FUNDS');
    expect(await balance(a.user.id)).toBe(1000);
    expect((await a.get('/api/rooms/current')).body.room).toBeNull();
  });
});
