import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { closeSocket } from './socket';
import type { Me } from './types';

interface AuthValue {
  user: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: Me | null) => void;
  login: (login: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ user: Me }>('/api/me');
      setUser(r.user);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
    async register(email, username, password) {
      const r = await api.post<{ user: Me }>('/api/auth/register', { email, username, password });
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
