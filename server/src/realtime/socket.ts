import type { Server as HttpServer } from 'node:http';
import { parse as parseCookie } from 'cookie';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { resolveSession, SESSION_COOKIE } from '../lib/session.js';
import { RuleError } from '../game/engine.js';
import type { AuthUser } from '../types.js';
import { gameManager } from './gameManager.js';
import { hub } from './hub.js';

type Ack = (res: { ok: true; data?: unknown } | { ok: false; error: { code: string; message: string } }) => void;

const idSchema = z.string().min(1).max(30);
const moveSchema = z.object({ gameId: idSchema, pawn: z.number().int().min(0).max(3) });

function toError(e: unknown) {
  if (e instanceof AppError || e instanceof RuleError) return { code: e.code, message: e.message };
  if (e instanceof z.ZodError) return { code: 'VALIDATION_ERROR', message: 'Données invalides' };
  console.error('[socket]', e);
  return { code: 'INTERNAL', message: 'Erreur interne du serveur' };
}

/** Enveloppe un gestionnaire : validation, accusé de réception et erreurs uniformes. */
function handle(socket: Socket, event: string, fn: (payload: unknown, user: AuthUser) => Promise<unknown>) {
  socket.on(event, async (payload: unknown, ack?: Ack) => {
    const reply: Ack = typeof ack === 'function' ? ack : () => {};
    try {
      reply({ ok: true, data: await fn(payload, socket.data.user as AuthUser) });
    } catch (e) {
      reply({ ok: false, error: toError(e) });
    }
  });
}

export function createSocketServer(http: HttpServer) {
  const io = new Server(http, {
    cors: { origin: config.CORS_ORIGIN.split(','), credentials: true },
    pingInterval: 10000,
    pingTimeout: 8000
  });

  // Authentification par le même cookie httpOnly que l'API REST.
  io.use(async (socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const user = await resolveSession(cookies[SESSION_COOKIE]).catch(() => null);
    if (!user) return next(new Error('UNAUTHORIZED'));
    socket.data.user = user;
    socket.data.games = new Set<string>();
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser;
    hub.connectedUsers.set(user.id, (hub.connectedUsers.get(user.id) ?? 0) + 1);
    socket.join(`user:${user.id}`);

    handle(socket, 'lobby:watch', async () => {
      await socket.join('lobby');
      return { online: hub.onlineCount() };
    });

    handle(socket, 'room:watch', async (p) => {
      const roomId = idSchema.parse(p);
      await socket.join(`room:${roomId}`);
      return null;
    });

    handle(socket, 'game:join', async (p) => {
      const gameId = idSchema.parse(p);
      const snap = await gameManager.getSnapshotFor(gameId, user.id); // vérifie la participation
      await socket.join(`game:${gameId}`);
      const games = socket.data.games as Set<string>;
      if (!games.has(gameId)) {
        games.add(gameId);
        if (hub.addPresence(gameId, user.id)) await gameManager.presenceChanged(gameId, user.id, true);
      }
      return snap.status === 'ACTIVE' ? await gameManager.getSnapshotFor(gameId, user.id) : snap;
    });

    handle(socket, 'game:roll', async (p) => gameManager.roll(idSchema.parse(p), user.id));
    handle(socket, 'game:move', async (p) => {
      const { gameId, pawn } = moveSchema.parse(p);
      return gameManager.move(gameId, user.id, pawn);
    });
    handle(socket, 'game:forfeit', async (p) => gameManager.forfeit(idSchema.parse(p), user.id));

    socket.on('disconnect', () => {
      const n = (hub.connectedUsers.get(user.id) ?? 1) - 1;
      if (n > 0) hub.connectedUsers.set(user.id, n);
      else hub.connectedUsers.delete(user.id);
      for (const gameId of socket.data.games as Set<string>) {
        if (hub.removePresence(gameId, user.id)) {
          gameManager.presenceChanged(gameId, user.id, false).catch((e) => console.error('[presence]', e));
        }
      }
    });
  });

  hub.io = io;
  gameManager.setBroadcaster(hub);
  return io;
}
