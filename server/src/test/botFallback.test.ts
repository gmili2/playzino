import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { registered } from './helpers.js';

afterAll(() => prisma.$disconnect());

const balanceOf = async (userId: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;

describe('aucun adversaire : partie contre le robot', () => {
  it('mise remboursée, table annulée, partie d’entraînement lancée avec le même jeu', async () => {
    const a = await registered();
    const q = await a.post('/api/rooms', { name: 'Table test', visibility: 'PUBLIC', stake: 250, maxPlayers: 2, gameType: 'CONNECT4' });
    expect(q.body.room.status).toBe('WAITING');
    expect(await balanceOf(a.user.id)).toBe(750);

    const r = await a.post(`/api/rooms/${q.body.room.id}/play-bot`);
    expect(r.status).toBe(201);
    expect(r.body.room).toMatchObject({ status: 'PLAYING', isPractice: true, gameType: 'CONNECT4', stake: 0 });
    expect(r.body.room.players.some((p: { isBot?: boolean }) => p.isBot)).toBe(true);
    expect(await balanceOf(a.user.id)).toBe(1000);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: q.body.room.id } })).status).toBe('CANCELLED');
  });

  it('refusé si un adversaire a déjà rejoint', async () => {
    const a = await registered();
    const b = await registered();
    const q = await a.post('/api/rooms', { name: 'Table test', visibility: 'PUBLIC', stake: 0, maxPlayers: 4, gameType: 'PARCHEESI' });
    await b.post(`/api/rooms/${q.body.room.id}/join`);
    const r = await a.post(`/api/rooms/${q.body.room.id}/play-bot`);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('OPPONENT_FOUND');
    expect((await prisma.roomPlayer.count({ where: { roomId: q.body.room.id } }))).toBe(2);
  });
});

describe('place oubliée : plus de renvoi vers l’ancienne table', () => {
  it('table Puissance 4 en attente quittée automatiquement (mise remboursée) pour lancer un Parchís', async () => {
    const a = await registered();
    const old = await a.post('/api/rooms', { name: 'Table oubliée', visibility: 'PUBLIC', stake: 100, maxPlayers: 2, gameType: 'CONNECT4' });
    expect(await balanceOf(a.user.id)).toBe(900);
    const r = await a.post('/api/rooms/practice', { bots: 1, gameType: 'PARCHEESI' });
    expect(r.status).toBe(201);
    expect(r.body.room.gameType).toBe('PARCHEESI');
    expect((await prisma.room.findUniqueOrThrow({ where: { id: old.body.room.id } })).status).toBe('CANCELLED');
    expect(await balanceOf(a.user.id)).toBe(1000);
  });

  it('partie contre le robot en cours : annulée quand on en lance une autre', async () => {
    const a = await registered();
    const p1 = await a.post('/api/rooms/practice', { bots: 1, gameType: 'CONNECT4' });
    const p2 = await a.post('/api/rooms/practice', { bots: 1, gameType: 'PARCHEESI' });
    expect(p2.status).toBe(201);
    expect(p2.body.room.gameType).toBe('PARCHEESI');
    expect((await prisma.game.findFirstOrThrow({ where: { roomId: p1.body.room.id } })).status).toBe('ABORTED');
  });

  it('vraie partie en cours : toujours renvoyé vers elle', async () => {
    const a = await registered();
    const b = await registered();
    const t = await a.post('/api/rooms', { name: 'Vraie partie', visibility: 'PUBLIC', stake: 50, maxPlayers: 2, gameType: 'CONNECT4' });
    await b.post(`/api/rooms/${t.body.room.id}/join`);
    const r = await a.post('/api/rooms/practice', { bots: 1 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'ALREADY_IN_ROOM', details: { roomId: t.body.room.id } });
  });
});
