import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { closeSocket, getSocket } from './socket';
import type { Me } from './types';

interface AuthValue {
  user: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: Me | null) => void;
  login: (login: string, password: string) => Promise<void>;
  register: (email: string, username: string, phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const retries = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ user: Me }>('/api/me');
      setUser(r.user);
      retries.current = 0;
      setLoading(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setLoading(false);
        return;
      }
      // Coupure passagère (réseau, redémarrage du serveur) : on réessaie au lieu de déconnecter le joueur.
      if (retries.current < 5) {
        retries.current += 1;
        setTimeout(() => { void refresh(); }, 1500 * retries.current);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Solde à jour partout (en-tête, mises) dès qu'un dépôt ou un retrait est traité par l'admin.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const s = getSocket();
    const onUpdate = () => { void refresh(); };
    s.on('wallet:update', onUpdate);
    return () => { s.off('wallet:update', onUpdate); };
  }, [userId, refresh]);

  const value: AuthValue = {
    user,
    loading,
    refresh,
    setUser,
    async login(login, password) {
      const r = await api.post<{ user: Me }>('/api/auth/login', { login, password });
      closeSocket();
      setUser(r.user);
    },
    async register(email, username, phone, password) {
      const r = await api.post<{ user: Me }>('/api/auth/register', { email, username, phone, password });
      closeSocket();
      setUser(r.user);
    },
    async logout() {
      await api.post('/api/auth/logout');
      closeSocket();
      setUser(null);
    }
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider manquant');
  return v;
}
