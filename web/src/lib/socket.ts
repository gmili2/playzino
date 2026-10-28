import { io, type Socket } from 'socket.io-client';

type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

let socket: Socket | null = null;

/** Connexion unique, authentifiée par le cookie de session (même origine). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function closeSocket() {
  socket?.close();
  socket = null;
}

export function emitAck<T>(event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    getSocket()
      .timeout(10000)
      .emit(event, payload, (err: Error | null, res: Ack<T>) => {
        if (err) return reject({ code: 'TIMEOUT', message: 'انتهت مهلة الخادم' });
        if (res.ok) resolve(res.data);
        else reject(res.error);
      });
  });
}
