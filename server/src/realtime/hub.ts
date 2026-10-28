import type { Server } from 'socket.io';
import type { Broadcaster } from './gameManager.js';

/** Point central de diffusion temps réel ; sans serveur Socket.IO (tests REST) tout est sans effet. */
class Hub implements Broadcaster {
  io: Server | null = null;
  /** gameId → userId → nombre de sockets connectés à cette partie. */
  presence = new Map<string, Map<string, number>>();
  /** userId → nombre de sockets ouverts (tous écrans confondus). */
  connectedUsers = new Map<string, number>();

  emitGame(gameId: string, event: string, payload: unknown) {
    this.io?.to(`game:${gameId}`).emit(event, payload);
  }

  emitRoom(roomId: string, event: string, payload: unknown) {
    this.io?.to(`room:${roomId}`).emit(event, payload);
  }

  emitLobby() {
    this.io?.to('lobby').emit('lobby:update');
  }

  roomChanged(roomId: string, room: unknown) {
    this.emitRoom(roomId, 'room:update', room);
  }

  lobbyChanged() {
    this.emitLobby();
  }

  isOnline(gameId: string, userId: string) {
    return (this.presence.get(gameId)?.get(userId) ?? 0) > 0;
  }

  /** Renvoie true si c'est le premier socket de cet utilisateur sur la partie. */
  addPresence(gameId: string, userId: string) {
    const m = this.presence.get(gameId) ?? new Map<string, number>();
    this.presence.set(gameId, m);
    const n = (m.get(userId) ?? 0) + 1;
    m.set(userId, n);
    return n === 1;
  }

  /** Renvoie true si c'était le dernier socket de cet utilisateur sur la partie. */
  removePresence(gameId: string, userId: string) {
    const m = this.presence.get(gameId);
    if (!m) return false;
    const n = (m.get(userId) ?? 0) - 1;
    if (n > 0) {
      m.set(userId, n);
      return false;
    }
    m.delete(userId);
    if (m.size === 0) this.presence.delete(gameId);
    return true;
  }

  onlineCount() {
    return this.connectedUsers.size;
  }
}

export const hub = new Hub();
