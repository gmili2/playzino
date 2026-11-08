import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { gameManager } from '../realtime/gameManager.js';
import { registered, TEST_CREDITS } from './helpers.js';

afterAll(() => prisma.$disconnect());

const balance = async (userId: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;
const TEAM_OF: Record<string, number> = { blue: 0, green: 0, yellow: 1, red: 1 };

describe('mode 2 contre 2', () => {
  it('partie rapide en équipes : 4 joueurs, deux équipes face à face, chaque gagnant reçoit deux mises', async () => {
    const stake = 15;
    const players = [await registered(), await registered(), await registered(), await registered()];
    let room: { id: string; status: string; teams: boolean; gameId: string | null } | null = null;
    for (const p of players) {
      const r = await p.post('/api/rooms/quick', { stake, teams: true });
      expect(r.status).toBe(200);
      room = r.body.room;
      expect(room!.teams).toBe(true);
    }
    expect(room!.status).toBe('PLAYING');
    // Même table pour les quatre, à 4 places, sans mélange avec les parties ordinaires.
    const seats = await prisma.roomPlayer.findMany({ where: { roomId: room!.id } });
    expect(seats.map((s) => s.userId).sort()).toEqual(players.map((p) => p.user.id).sort());

    const game = await prisma.game.findUniqueOrThrow({ where: { id: room!.gameId! }, include: { players: true } });
    const state = JSON.parse(game.state) as { teams?: string[][] };
    expect(state.teams).toEqual([['blue', 'green'], ['yellow', 'red']]);
    const colorOf = (id: string) => game.players.find((p) => p.userId === id)!.color;

    // Les deux joueurs de l'équipe 1 abandonnent : l'équipe 0 gagne.
    const losers = players.filter((p) => TEAM_OF[colorOf(p.user.id)] === 1);
    const winners = players.filter((p) => TEAM_OF[colorOf(p.user.id)] === 0);
    expect(losers).toHaveLength(2);
    await gameManager.forfeit(game.id, losers[0].user.id);
    expect((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe('ACTIVE');
    await gameManager.forfeit(game.id, losers[1].user.id);

    const done = await prisma.game.findUniqueOrThrow({ where: { id: game.id }, include: { players: true } });
    expect(done.status).toBe('FINISHED');
    for (const w of winners) {
      expect(done.players.find((p) => p.userId === w.user.id)).toMatchObject({ result: 'WIN', payout: 2 * stake });
      expect(await balance(w.user.id)).toBe(TEST_CREDITS - stake + 2 * stake);
    }
    for (const l of losers) {
      expect(done.players.find((p) => p.userId === l.user.id)).toMatchObject({ result: 'LOSS', payout: 0 });
      expect(await balance(l.user.id)).toBe(TEST_CREDITS - stake);
    }
    // Rejouer la fin ne paie pas deux fois.
    expect(await prisma.walletTransaction.count({ where: { gameId: game.id, type: 'WIN' } })).toBe(2);
  });

  it('table privée en équipes : chacun choisit sa place, donc son équipe ; une place prise est refusée', async () => {
    const host = await registered();
    const friend = await registered();
    const created = await host.post('/api/rooms', { name: 'Équipes entre amis', visibility: 'PRIVATE', stake: 0, teams: true, maxPlayers: 2, gameType: 'CONNECT4' });
    expect(created.status).toBe(201);
    const room = created.body.room;
    // Le mode équipe impose le Parchís à 4.
    expect(room).toMatchObject({ teams: true, maxPlayers: 4, gameType: 'PARCHEESI' });
    expect((await friend.post(`/api/rooms/join-code`, { code: room.code })).status).toBeLessThan(300);

    // L'ami (place 1, équipe de l'hôte) passe dans l'autre équipe (place 2).
    const moved = await friend.post(`/api/rooms/${room.id}/seat`, { seat: 2 });
    expect(moved.status).toBe(200);
    expect(moved.body.room.players.find((p: { userId: string }) => p.userId === friend.user.id)).toMatchObject({ seat: 2, color: 'yellow' });
    expect((await host.post(`/api/rooms/${room.id}/seat`, { seat: 2 })).body.error?.code).toBe('SEAT_TAKEN');

    // Hors table d'équipes : changer de place est refusé.
    const other = await registered();
    const solo = await other.post('/api/rooms', { name: 'Solo', visibility: 'PRIVATE', stake: 0, maxPlayers: 2 });
    expect((await other.post(`/api/rooms/${solo.body.room.id}/seat`, { seat: 1 })).body.error?.code).toBe('NOT_TEAMS');
  });
});
