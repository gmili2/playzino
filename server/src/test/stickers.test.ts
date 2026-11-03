import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';

const { prisma } = await import('../lib/prisma.js');
const { gameManager } = await import('../realtime/gameManager.js');
const { connectSocket, emit, registered, startServer } = await import('./helpers.js');

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

async function sock(cookie: string[]) {
  const s = await connectSocket(server.url, cookie);
  sockets.push(s);
  return s;
}

const next = (s: Socket, event: string) => new Promise<any>((resolve) => s.once(event, resolve));

describe('Stickers de partie', () => {
  it('diffusés aux joueurs de la partie, liste fermée, anti-spam, interdits aux autres', async () => {
    const a = await registered(server.url);
    const b = await registered(server.url);
    const outsider = await registered(server.url);
    const created = await a.post('/api/rooms', { name: 'Stickers', visibility: 'PRIVATE', stake: 0, turnSeconds: 60, maxPlayers: 2 });
    const joined = await b.post('/api/rooms/join-code', { code: created.body.room.code });
    const gameId = joined.body.room.gameId as string;
    const sa = await sock(a.cookie);
    const sb = await sock(b.cookie);
    const so = await sock(outsider.cookie);
    await emit(sa, 'game:join', gameId);
    await emit(sb, 'game:join', gameId);

    const gotB = next(sb, 'game:sticker');
    const gotA = next(sa, 'game:sticker');
    expect((await emit(sa, 'game:sticker', { gameId, sticker: 'bravo' })).ok).toBe(true);
    expect(await gotB).toMatchObject({ userId: a.user.id, sticker: 'bravo' });
    expect(await gotA).toMatchObject({ userId: a.user.id, sticker: 'bravo' });

    expect((await emit(sa, 'game:sticker', { gameId, sticker: 'fire' })).error?.code).toBe('TOO_FAST');
    expect((await emit(sb, 'game:sticker', { gameId, sticker: 'insulte' })).error?.code).toBe('VALIDATION_ERROR');
    expect((await emit(so, 'game:sticker', { gameId, sticker: 'laugh' })).error?.code).toBe('FORBIDDEN');
    expect((await emit(sb, 'game:sticker', { gameId, sticker: 'laugh' })).ok).toBe(true);
  });
});
