import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { createSocketServer } from '../realtime/socket.js';

export const app = createApp();

/** Client HTTP qui conserve le cookie de session, comme un navigateur. */
export function client(target: Parameters<typeof request.agent>[0] = app) {
  const agent = request.agent(target);
  const h = { 'X-Requested-With': 'parcheesi' };
  return {
    agent,
    get: (url: string) => agent.get(url).set(h),
    post: (url: string, body?: object) => agent.post(url).set(h).send(body ?? {}),
    patch: (url: string, body?: object) => agent.patch(url).set(h).send(body ?? {})
  };
}

export const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10);

export async function registered(target?: Parameters<typeof request.agent>[0]) {
  const c = client(target);
  const name = 'u' + uniq();
  const res = await c.post('/api/auth/register', { email: `${name}@test.local`, username: name, password: 'motdepasse-123' });
  if (res.status !== 201) throw new Error(`register ${res.status} ${JSON.stringify(res.body)}`);
  return { ...c, user: res.body.user as { id: string; username: string; balance: number }, cookie: res.headers['set-cookie'] as unknown as string[] };
}

export async function makeAdmin(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
}

/** Serveur HTTP + Socket.IO réel sur un port libre. */
export async function startServer() {
  const http: Server = createServer(app);
  const io = createSocketServer(http);
  await new Promise<void>((r) => http.listen(0, r));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  return {
    url,
    close: async () => {
      io.close();
      await new Promise<void>((r) => http.close(() => r()));
    }
  };
}

export function connectSocket(url: string, cookie: string[]): Promise<Socket> {
  const s = ioClient(url, {
    extraHeaders: { cookie: cookie.map((c) => c.split(';')[0]).join('; ') },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });
  return new Promise((resolve, reject) => {
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

export function emit<T = any>(s: Socket, event: string, payload?: unknown): Promise<{ ok: boolean; data?: T; error?: { code: string } }> {
  return new Promise((resolve) => s.emit(event, payload, resolve));
}
