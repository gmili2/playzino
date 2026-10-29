import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';

// Délai de reconnexion court pour tester l'abandon par déconnexion (lu au chargement de la config).
process.env.RECONNECT_GRACE_SECONDS = '2';

const { prisma } = await import('../lib/prisma.js');
const { gameManager } = await import('../realtime/gameManager.js');
const { connectSocket, emit, registered, startServer } = await import('./helpers.js');

type Snapshot = {
  gameId: string;
  status: string;
  turnColor: string | null;
  legalMoves: { pawn: number }[];
  players: { userId: string; color: string; online: boolean; eliminated?: boolean }[];
  state: { phase: string; pawns: Record<string, number[]>; colors: string[] };
  paused: boolean;
  winnerId: string | null;
  endReason: string | null;
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

/** Deux joueurs inscrits via HTTP, assis à une table privée avec mise. */
async function seatedPair(stake: number) {
  const a = await registered(server.url);
  const b = await registered(server.url);
  const created = await a.post('/api/rooms', { name: 'Table de test', visibility: 'PRIVATE', stake, turnSeconds: 60 });
  expect(created.status).toBe(201);
  const room = created.body.room;
  expect(room.code).toMatch(/^PRC-[A-Z2-9]{4}$/);
  expect(room.status).toBe('WAITING');
  return { a, b, room };
}

async function sock(cookie: string[]) {
  const s = await connectSocket(server.url, cookie);
  sockets.push(s);
  return s;
}

describe('multijoueur temps réel', () => {
  it('rejeter un socket sans session', async () => {
    const { io } = await import('socket.io-client');
    const s = io(server.url, { transports: ['websocket'], forceNew: true, reconnection: false });
    const err = await new Promise<Error>((r) => s.on('connect_error', r));
    expect(err.message).toBe('UNAUTHORIZED');
    s.close();
  });

  it('partie complète à deux : mises, tours validés par le serveur, vainqueur payé', async () => {
    const { a, b, room } = await seatedPair(100);
    expect(await balance(a.user.id)).toBe(900);

    // La table privée n'apparaît pas dans la liste publique et son code est caché aux autres.
    const list = await b.get('/api/rooms');
    expect(list.body.items.some((r: { id: string }) => r.id === room.id)).toBe(false);
    expect((await b.get(`/api/rooms/${room.id}`)).status).toBe(404);

    const sa = await sock(a.cookie);
    const sb = await sock(b.cookie);
    await emit(sa, 'room:watch', room.id);
    const started = new Promise<{ gameId: string; status: string }>((r) => sa.on('room:update', r));

    const joined = await b.post('/api/rooms/join-code', { code: room.code });
    expect(joined.status).toBe(200);
    expect(joined.body.room.status).toBe('PLAYING');
    const gameId: string = joined.body.room.gameId;
    expect((await started).gameId).toBe(gameId);
    expect(await balance(b.user.id)).toBe(900);

    // Un tiers ne peut ni rejoindre la table pleine ni lire la partie.
    const c = await registered(server.url);
    expect((await c.post('/api/rooms/join-code', { code: room.code })).status).toBe(409);
    const sc = await sock(c.cookie);
    expect((await emit(sc, 'game:join', gameId)).error?.code).toBe('FORBIDDEN');

    const ja = await emit<Snapshot>(sa, 'game:join', gameId);
    const jb = await emit<Snapshot>(sb, 'game:join', gameId);
    expect(ja.ok && jb.ok).toBe(true);
    let snap = jb.data!;
    expect(snap.paused).toBe(false);
    expect(snap.players.every((p) => p.online)).toBe(true);

    const byColor: Record<string, Socket> = {};
    for (const p of snap.players) byColor[p.color] = p.userId === a.user.id ? sa : sb;

    // L'adversaire est notifié de chaque coup.
    let broadcasts = 0;
    sa.on('game:state', () => broadcasts++);

    // Jouer hors de son tour est refusé.
    const idle = snap.turnColor === 'blue' ? byColor.yellow : byColor.blue;
    expect((await emit(idle, 'game:roll', gameId)).error?.code).toBe('NOT_YOUR_TURN');

    let actions = 0;
    while (snap.status === 'ACTIVE' && actions < 5000) {
      const s = byColor[snap.turnColor!];
      if (snap.state.phase === 'roll') {
        const r = await emit<Snapshot>(s, 'game:roll', gameId);
        expect(r.ok).toBe(true);
        snap = r.data!;
      } else {
        // Un pion illégal est refusé avant de jouer un coup légal.
        const legal = new Set(snap.legalMoves.map((m) => m.pawn));
        const illegal = [0, 1, 2, 3].find((p) => !legal.has(p));
        if (illegal !== undefined && actions % 25 === 0) {
          expect((await emit(s, 'game:move', { gameId, pawn: illegal })).error?.code).toBe('ILLEGAL_MOVE');
        }
        const r = await emit<Snapshot>(s, 'game:move', { gameId, pawn: snap.legalMoves[0].pawn });
        expect(r.ok).toBe(true);
        snap = r.data!;
      }
      actions++;
    }

    expect(snap.status).toBe('FINISHED');
    expect(snap.endReason).toBe('COMPLETED');
    const winnerColor = snap.players.find((p) => p.userId === snap.winnerId)!.color;
    expect(snap.state.pawns[winnerColor].every((p) => p === 63)).toBe(true);
    expect(broadcasts).toBeGreaterThan(10);

    // Base de données : partie, coups, résultats et gains cohérents.
    const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId }, include: { players: true, room: true } });
    expect(game.status).toBe('FINISHED');
    expect(game.room.status).toBe('FINISHED');
    expect(await prisma.gameMove.count({ where: { gameId } })).toBe(actions);
    const loserId = snap.winnerId === a.user.id ? b.user.id : a.user.id;
    expect(await balance(snap.winnerId!)).toBe(1100);
    expect(await balance(loserId)).toBe(900);
    expect(game.players.find((p) => p.userId === snap.winnerId)).toMatchObject({ result: 'WIN', payout: 200 });
    expect(await prisma.walletTransaction.count({ where: { idempotencyKey: `win:${gameId}` } })).toBe(1);

    // Historique visible côté joueur.
    const hist = await a.get('/api/me/games');
    expect(hist.body.items[0]).toMatchObject({ gameId, status: 'FINISHED' });
    const me = await a.get('/api/me');
    expect(me.body.user.stats.played).toBe(1);

    // Aucune action après la fin.
    expect((await emit(sa, 'game:roll', gameId)).error?.code).toBe('GAME_OVER');
  });

  it('salle d’attente : quitter rembourse la mise et annule la table', async () => {
    const { a, room } = await seatedPair(250);
    expect(await balance(a.user.id)).toBe(750);
    expect((await a.post(`/api/rooms/${room.id}/leave`)).status).toBe(204);
    expect(await balance(a.user.id)).toBe(1000);
    const r = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(r.status).toBe('CANCELLED');
    // Le remboursement n'est jamais versé deux fois.
    expect((await a.post(`/api/rooms/${room.id}/leave`)).status).toBe(403);
    expect(await balance(a.user.id)).toBe(1000);
  });

  it('mise supérieure au solde refusée, solde intact', async () => {
    const a = await registered(server.url);
    await prisma.wallet.update({ where: { userId: a.user.id }, data: { balance: 40 } });
    const r = await a.post('/api/rooms', { name: 'Trop cher', visibility: 'PUBLIC', stake: 50, turnSeconds: 30 });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await balance(a.user.id)).toBe(40);
    expect(await prisma.room.count({ where: { hostId: a.user.id } })).toBe(0);
  });

  it('deux arrivées simultanées : un seul joueur obtient la dernière place', async () => {
    const { b, room } = await seatedPair(0);
    const c = await registered(server.url);
    const [r1, r2] = await Promise.all([b.post(`/api/rooms/${room.id}/join`), c.post(`/api/rooms/${room.id}/join`)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(await prisma.roomPlayer.count({ where: { roomId: room.id } })).toBe(2);
    expect(await prisma.game.count({ where: { roomId: room.id } })).toBe(1);
  });

  it('partie rapide publique : le second joueur rejoint la table du premier', async () => {
    const a = await registered(server.url);
    const b = await registered(server.url);
    const r1 = await a.post('/api/rooms/quick', { stake: 1000 });
    expect(r1.body.room.status).toBe('WAITING');
    const r2 = await b.post('/api/rooms/quick', { stake: 1000 });
    expect(r2.body.room.id).toBe(r1.body.room.id);
    expect(r2.body.room.status).toBe('PLAYING');
    await gameManager.forfeit(r2.body.room.gameId, a.user.id);
  });

  it('reconnexion : pause pendant la coupure, reprise au retour', async () => {
    const { a, b, room } = await seatedPair(0);
    const joined = await b.post('/api/rooms/join-code', { code: room.code });
    const gameId = joined.body.room.gameId;
    const sa = await sock(a.cookie);
    let sb = await sock(b.cookie);
    await emit(sa, 'game:join', gameId);
    await emit(sb, 'game:join', gameId);

    const paused = new Promise<Snapshot>((r) => sa.on('game:state', (s: Snapshot) => s.paused && r(s)));
    sb.close();
    const p = await paused;
    expect(p.players.find((x) => x.userId === b.user.id)!.online).toBe(false);
    expect((await emit(sa, 'game:roll', gameId)).error?.code).toMatch(/GAME_PAUSED|NOT_YOUR_TURN/);

    sb = await sock(b.cookie);
    const back = await emit<Snapshot>(sb, 'game:join', gameId);
    expect(back.data!.paused).toBe(false);
    expect(back.data!.status).toBe('ACTIVE');
    await gameManager.forfeit(gameId, a.user.id);
  });

  it('abandon par déconnexion : l’adversaire gagne après le délai de grâce', async () => {
    const { a, b, room } = await seatedPair(50);
    const joined = await b.post('/api/rooms/join-code', { code: room.code });
    const gameId = joined.body.room.gameId;
    const sa = await sock(a.cookie);
    const sb = await sock(b.cookie);
    await emit(sa, 'game:join', gameId);
    await emit(sb, 'game:join', gameId);

    const over = new Promise<Snapshot>((r) => sa.on('game:state', (s: Snapshot) => s.status === 'FINISHED' && r(s)));
    sb.close();
    const end = await over;
    expect(end.winnerId).toBe(a.user.id);
    expect(end.endReason).toBe('DISCONNECT');
    expect(await balance(a.user.id)).toBe(1050);
    expect(await balance(b.user.id)).toBe(950);
  });

  it('abandon volontaire : forfait et gain pour l’adversaire', async () => {
    const { a, b, room } = await seatedPair(100);
    const joined = await b.post('/api/rooms/join-code', { code: room.code });
    const gameId = joined.body.room.gameId;
    const sa = await sock(a.cookie);
    await emit(sa, 'game:join', gameId);
    const r = await emit<Snapshot>(sa, 'game:forfeit', gameId);
    expect(r.data!.status).toBe('FINISHED');
    expect(r.data!.winnerId).toBe(b.user.id);
    expect(await balance(b.user.id)).toBe(1100);
  });

  it('reprise après redémarrage : l’état est relu depuis MariaDB', async () => {
    const { a, b, room } = await seatedPair(0);
    const joined = await b.post('/api/rooms/join-code', { code: room.code });
    const gameId = joined.body.room.gameId;
    const before = await gameManager.getSnapshotFor(gameId, a.user.id);
    gameManager.shutdown(); // simule un redémarrage : la mémoire est vidée
    const after = await gameManager.getSnapshotFor(gameId, a.user.id);
    expect(after.state).toEqual(before.state);
    expect(after.status).toBe('ACTIVE');
    await gameManager.forfeit(gameId, a.user.id);
  });
});

describe('tables de 3 et 4 joueurs', () => {
  async function seatedGroup(n: number, stake: number) {
    const users = [];
    for (let i = 0; i < n; i++) users.push(await registered(server.url));
    const created = await users[0].post('/api/rooms', { name: `Table à ${n}`, visibility: 'PRIVATE', stake, turnSeconds: 60, maxPlayers: n });
    expect(created.status).toBe(201);
    expect(created.body.room.maxPlayers).toBe(n);
    let last;
    for (let i = 1; i < n; i++) {
      last = await users[i].post('/api/rooms/join-code', { code: created.body.room.code });
      expect(last.status).toBe(200);
      expect(last.body.room.status).toBe(i === n - 1 ? 'PLAYING' : 'WAITING');
    }
    const sockets = await Promise.all(users.map((u) => sock(u.cookie)));
    const gameId: string = last!.body.room.gameId;
    let snap: Snapshot | undefined;
    for (const s of sockets) {
      const r = await emit<Snapshot>(s, 'game:join', gameId);
      expect(r.ok).toBe(true);
      snap = r.data;
    }
    return { users, sockets, gameId, snap: snap! };
  }

  it('refuse plus de 4 joueurs', async () => {
    const a = await registered(server.url);
    const r = await a.post('/api/rooms', { name: 'Trop grande', visibility: 'PUBLIC', stake: 0, turnSeconds: 30, maxPlayers: 5 });
    expect(r.status).toBe(400);
  });

  it('partie complète à 4 : ordre rouge → jaune → vert → bleu, pot de 4 mises au vainqueur', async () => {
    const { users, sockets, gameId, snap: first } = await seatedGroup(4, 50);
    let snap = first;
    expect(snap.state.colors).toEqual(['red', 'yellow', 'green', 'blue']);
    expect(snap.paused).toBe(false);
    const byColor: Record<string, Socket> = {};
    snap.players.forEach((p) => (byColor[p.color] = sockets[users.findIndex((u) => u.user.id === p.userId)]));

    const turns: string[] = [];
    let actions = 0;
    while (snap.status === 'ACTIVE' && actions < 20000) {
      const s = byColor[snap.turnColor!];
      if (snap.state.phase === 'roll') {
        if (turns[turns.length - 1] !== snap.turnColor) turns.push(snap.turnColor!);
        snap = (await emit<Snapshot>(s, 'game:roll', gameId)).data!;
      } else {
        snap = (await emit<Snapshot>(s, 'game:move', { gameId, pawn: snap.legalMoves[0].pawn })).data!;
      }
      actions++;
    }
    expect(snap.status).toBe('FINISHED');
    expect(snap.endReason).toBe('COMPLETED');
    // Les 4 premiers changements de main suivent le sens de la piste à partir du joueur tiré au sort.
    const order = ['red', 'yellow', 'green', 'blue'];
    const start = order.indexOf(turns[0]);
    expect(turns.slice(0, 4)).toEqual([0, 1, 2, 3].map((k) => order[(start + k) % 4]));

    for (const u of users) {
      expect(await balance(u.user.id)).toBe(u.user.id === snap.winnerId ? 1150 : 950);
    }
    const results = await prisma.gamePlayer.findMany({ where: { gameId } });
    expect(results.filter((r) => r.result === 'WIN')).toHaveLength(1);
    expect(results.filter((r) => r.result === 'LOSS')).toHaveLength(3);
  });

  it('à 3 joueurs : un abandon élimine seulement ce joueur, la partie continue', async () => {
    const { users, sockets, gameId } = await seatedGroup(3, 100);
    const [a, b, c] = users;

    const r1 = await emit<Snapshot>(sockets[0], 'game:forfeit', gameId);
    expect(r1.data!.status).toBe('ACTIVE');
    expect(r1.data!.players.find((p) => p.userId === a.user.id)).toMatchObject({ eliminated: true });
    expect(r1.data!.turnColor).not.toBe(r1.data!.players.find((p) => p.userId === a.user.id)!.color);

    // Le joueur éliminé est libéré : il peut créer une autre table tout de suite.
    const other = await a.post('/api/rooms', { name: 'Nouvelle table', visibility: 'PUBLIC', stake: 0, turnSeconds: 30 });
    expect(other.status).toBe(201);
    await a.post(`/api/rooms/${other.body.room.id}/leave`);

    // Il ne peut plus jouer dans la partie dont il est sorti.
    expect((await emit(sockets[0], 'game:roll', gameId)).ok).toBe(false);

    // Second abandon : le dernier joueur restant gagne les 3 mises.
    const r2 = await emit<Snapshot>(sockets[1], 'game:forfeit', gameId);
    expect(r2.data!.status).toBe('FINISHED');
    expect(r2.data!.winnerId).toBe(c.user.id);
    expect(r2.data!.endReason).toBe('FORFEIT');
    expect(await balance(c.user.id)).toBe(1200);
    expect(await balance(a.user.id)).toBe(900);
    expect(await balance(b.user.id)).toBe(900);
  });

  it('à 3 joueurs : une déconnexion prolongée élimine le joueur absent', async () => {
    const { users, sockets, gameId } = await seatedGroup(3, 0);
    const resumed = new Promise<Snapshot>((r) =>
      sockets[0].on('game:state', (s: Snapshot) => s.players.some((p) => p.eliminated) && r(s))
    );
    sockets[2].close();
    const s = await resumed;
    expect(s.status).toBe('ACTIVE');
    expect(s.paused).toBe(false);
    expect(s.players.find((p) => p.userId === users[2].user.id)).toMatchObject({ eliminated: true });
    await gameManager.forfeit(gameId, users[0].user.id);
  });

  it('partie rapide à 4 : ne mélange pas les tables de tailles différentes', async () => {
    const a = await registered(server.url);
    const b = await registered(server.url);
    const r1 = await a.post('/api/rooms/quick', { stake: 500, maxPlayers: 4 });
    const r2 = await b.post('/api/rooms/quick', { stake: 500, maxPlayers: 3 });
    expect(r2.body.room.id).not.toBe(r1.body.room.id);
    const c = await registered(server.url);
    const r3 = await c.post('/api/rooms/quick', { stake: 500, maxPlayers: 4 });
    expect(r3.body.room.id).toBe(r1.body.room.id);
    expect(r3.body.room.status).toBe('WAITING');
  });
});
