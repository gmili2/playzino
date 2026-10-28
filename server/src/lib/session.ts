import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from './prisma.js';
import type { AuthUser } from '../types.js';

export const SESSION_COOKIE = 'pc_session';
const MAX_AGE_SECONDS = 7 * 24 * 3600;

interface Payload {
  sub: string;
  v: number;
}

export function signSession(userId: string, tokenVersion: number) {
  return jwt.sign({ sub: userId, v: tokenVersion } satisfies Payload, config.JWT_SECRET, {
    expiresIn: MAX_AGE_SECONDS,
    algorithm: 'HS256'
  });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    maxAge: MAX_AGE_SECONDS * 1000,
    path: '/'
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, path: '/' });
}

/**
 * Vérifie le jeton ET l'état courant en base : un compte suspendu ou un jeton
 * révoqué (tokenVersion incrémenté) est refusé immédiatement.
 */
export async function resolveSession(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  let payload: Payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as unknown as Payload;
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== payload.v) return null;
  return { id: user.id, username: user.username, email: user.email, role: user.role };
}
