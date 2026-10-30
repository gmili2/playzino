import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';

process.env.BOT_DELAY_MS = '15';

const { prisma } = await import('../lib/prisma.js');
const { gameManager } = await import('../realtime/gameManager.js');
const { connectSocket, emit, registered, startServer } = await import('./helpers.js');
const { drawSequence } = await import('../game/connect4.fixtures.js');

type Snapshot = {
  gameId: string;
  gameType: string;
  status: string;
  turnColor: string | null;
  legalMoves: { column: number }[];
  players: { userId: string; color: string; isBot?: boolean }[];
  state: { phase: string; colors: string[]; winner: string | null; draw: boolean; board: (string | null)[] };
  winnerId: string | null;
  payouts: Record<string, number>;
};

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

const balance = async (userId: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;

async function sock(cookie: string[]) {
  const s = await connectSocket(server.url, cookie);
  sockets.push(s);
  return s;
}

/** Deux joueurs assis à une table Puissance 4 privée avec mise ; renvoie les sockets dans l'ordre rouge, jaune. */
async function pvp(stake: number) {
  const a = await registered(server.url);
  const b = await registered(server.url);
  const created = await a.post('/api/rooms', { name: 'Puissance 4', gameType: 'CONNECT4', visibility: 'PRIVATE', stake, turnSeconds: 60, maxPlayers: 4 });
  expect(created.status).toBe(201);
  expect(created.body.room).toMatchObject({ gameType: 'CONNECT4', maxPlayers: 2 }); // ramené à 2 joueurs
  const joined = await b.post('/api/rooms/join-code', { code: created.body.room.code });
  const gameId = joined.body.room.gameId as string;
  expect(joined.body.room.status).toBe('PLAYING');
  const sa = await sock(a.cookie);
  const sb = await sock(b.cookie);
  const snap = (await emit<Snapshot>(sa, 'game:join', gameId)).data!;
  await emit(sb, 'game:join', gameId);
  expect(snap.gameType).toBe('CONNECT4');
  expect(snap.state.colors).toEqual(['red', 'yellow']);
  const byColor = (c: string) => (snap.players.find((p) => p.color === c)!.userId === a.user.id ? { u: a, s: sa } : { u: b, s: sb });
  return { gameId, snap, red: byColor('red'), yellow: byColor('yellow') };
}

describe('Puissance 4 en ligne', () => {
  it('à deux avec mise : coups validés par le serveur, alignement gagnant payé', async () => {
    const { gameId, snap, red, yellow } = await pvp(100);
    expect(await balance(red.u.user.id)).toBe(900);
    const first = snap.turnColor === 'red' ? red : yellow;
    const second = first === red ? yellow : red;
    expect((await emit(second.s, 'game:drop', { gameId, column: 0 })).error?.code).toBe('NOT_YOUR_TURN');
    expect((await emit(first.s, 'game:roll', gameId)).error?.code).toBe('BAD_ACTION');
    expect((await emit(first.s, 'game:drop', { gameId, column: 9 })).error?.code).toBe('VALIDATION_ERROR');

    let last: Snapshot | undefined;
    for (let i = 0; i < 4; i++) {
      last = (await emit<Snapshot>(first.s, 'game:drop', { gameId, column: 0 })).data!;
      if (i < 3) await emit(second.s, 'game:drop', { gameId, column: 1 });
    }
    expect(last!.status).toBe('FINISHED');
    expect(last!.winnerId).toBe(first.u.user.id);
    expect(await balance(first.u.user.id)).toBe(1100);
    expect(await balance(second.u.user.id)).toBe(900);
    expect((await emit(first.s, 'game:drop', { gameId, column: 3 })).error?.code).toBe('GAME_OVER');
    const stats = (await first.u.get('/api/me')).body.user.stats;
    expect(stats).toMatchObject({ played: 1, wins: 1 });
  });

  it('match nul : chacun récupère sa mise, résultat DRAW', async () => {
    const { gameId, snap, red, yellow } = await pvp(50);
    // La grille de nul reste sans alignement si l'on inverse les couleurs : peu importe qui commence.
    const first = snap.turnColor === 'red' ? red : yellow;
    const second = first === red ? yellow : red;
    let last: Snapshot | undefined;
    for (const [n, column] of drawSequence().entries()) {
      last = (await emit<Snapshot>((n % 2 === 0 ? first : second).s, 'game:drop', { gameId, column })).data!;
    }
    expect(last!.status).toBe('FINISHED');
    expect(last!.winnerId).toBeNull();
    expect(last!.state.draw).toBe(true);
    expect(await balance(red.u.user.id)).toBe(1000);
    expect(await balance(yellow.u.user.id)).toBe(1000);
    const seats = await prisma.gamePlayer.findMany({ where: { gameId } });
    expect(seats.map((p) => p.result)).toEqual(['DRAW', 'DRAW']);
    expect((await red.u.get('/api/me')).body.user.stats).toMatchObject({ played: 1, wins: 0, draws: 1 });
  });

  it('contre le robot : un seul robot, il joue seul jusqu’à la fin', async () => {
    const a = await registered(server.url);
    const r = await a.post('/api/rooms/practice', { bots: 3, gameType: 'CONNECT4' });
    expect(r.status).toBe(201);
    expect(r.body.room).toMatchObject({ gameType: 'CONNECT4', maxPlayers: 2, isPractice: true });
    const s = await sock(a.cookie);
    const gameId = r.body.room.gameId as string;
    let snap = (await emit<Snapshot>(s, 'game:join', gameId)).data!;
    const me = snap.players.find((p) => p.userId === a.user.id)!.color;
    const next = () => new Promise<Snapshot>((res) => s.once('game:state', res));
    for (let i = 0; i < 100 && snap.status === 'ACTIVE'; i++) {
      if (snap.turnColor === me) {
        const res = await emit<Snapshot>(s, 'game:drop', { gameId, column: snap.legalMoves[0].column });
        expect(res.ok).toBe(true);
        snap = res.data!;
      } else snap = await next();
    }
    expect(snap.status).toBe('FINISHED');
    const botMoves = await prisma.gameMove.count({ where: { gameId, type: 'BOT' } });
    expect(botMoves).toBeGreaterThan(2);
    expect(await balance(a.user.id)).toBe(1000);
  });

  it('partie rapide : ne mélange pas Puissance 4 et Parchís', async () => {
    const [a, b, c] = await Promise.all([registered(server.url), registered(server.url), registered(server.url)]);
    const ra = await a.post('/api/rooms/quick', { gameType: 'CONNECT4', stake: 250 });
    expect(ra.body.room).toMatchObject({ gameType: 'CONNECT4', maxPlayers: 2 });
    // Même mise, autre jeu : jamais la table Puissance 4.
    const rb = await b.post('/api/rooms/quick', { stake: 250 });
    expect(rb.body.room.gameType).toBe('PARCHEESI');
    expect(rb.body.room.id).not.toBe(ra.body.room.id);
    const rc = await c.post('/api/rooms/quick', { gameType: 'CONNECT4', stake: 250 });
    expect(rc.body.room.gameType).toBe('CONNECT4');
    for (const r of [ra, rb, rc]) if (r.body.room.gameId) await gameManager.forfeit(r.body.room.gameId, r.body.room.players[0].userId);
  });
});
