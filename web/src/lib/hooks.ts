import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, errorText } from './api';
import { useAuth } from './auth';
import { getSocket } from './socket';
import type { Room } from './types';

/** Liste des tables publiques, rafraîchie en temps réel (Socket.IO) ou par sondage pour les visiteurs. */
export function useLobby(filter: { status?: string; q?: string } = {}) {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ items: Room[] }>('/api/rooms' + (qs ? '?' + qs : ''));
      setRooms(r.items);
    } catch {
      setRooms((prev) => prev ?? []);
    }
  }, [qs]);

  useEffect(() => {
    load();
    if (!user) {
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    }
    const s = getSocket();
    const watch = () => s.emit('lobby:watch', null, (res: { ok: boolean; data?: { online: number } }) => res.ok && setOnline(res.data!.online));
    s.on('lobby:update', load);
    s.on('connect', watch);
    if (s.connected) watch();
    return () => {
      s.off('lobby:update', load);
      s.off('connect', watch);
    };
  }, [load, user]);

  return { rooms, online, reload: load };
}

/** Actions de table communes : redirection vers la salle, gestion de « déjà à une table ». */
export function useRoomActions() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<{ room: Room }>) => {
    if (!user) {
      nav('/login?next=' + encodeURIComponent(location.pathname));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await fn();
      await refresh();
      nav('/room/' + r.room.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ALREADY_IN_ROOM' && (e.details as unknown as { roomId?: string })?.roomId) {
        nav('/room/' + (e.details as unknown as { roomId: string }).roomId);
        return;
      }
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    error,
    setError,
    quick: (stake = 0, maxPlayers = 2) => run(() => api.post('/api/rooms/quick', { stake, maxPlayers })),
    join: (id: string) => run(() => api.post(`/api/rooms/${id}/join`)),
    practice: (bots = 1) => run(() => api.post('/api/rooms/practice', { bots })),
    joinCode: (code: string) => run(() => api.post('/api/rooms/join-code', { code: code.trim().toUpperCase() })),
    create: (body: { name: string; visibility: 'PUBLIC' | 'PRIVATE'; stake: number; turnSeconds: number; maxPlayers: number }) => run(() => api.post('/api/rooms', body))
  };
}
