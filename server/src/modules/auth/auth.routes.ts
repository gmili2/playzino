import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../../config.js';
import { audit } from '../../lib/audit.js';
import { clearSessionCookie, setSessionCookie, signSession } from '../../lib/session.js';
import { parse } from '../../lib/validate.js';
import { getMe } from '../users/users.service.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { authenticate, registerUser } from './auth.service.js';

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.NODE_ENV === 'test' ? 10_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Trop de tentatives, réessayez plus tard' } });
  }
});

authRouter.post('/register', limiter, async (req, res) => {
  const input = parse(registerSchema, req.body);
  const user = await registerUser(input, req.ip);
  setSessionCookie(res, signSession(user.id, user.tokenVersion));
  res.status(201).json({ user: await getMe(user.id) });
});

authRouter.post('/login', limiter, async (req, res) => {
  const { login, password } = parse(loginSchema, req.body);
  const user = await authenticate(login, password, req.ip);
  setSessionCookie(res, signSession(user.id, user.tokenVersion));
  res.json({ user: await getMe(user.id) });
});

authRouter.post('/logout', async (req, res) => {
  if (req.user) await audit({ actorId: req.user.id, action: 'auth.logout', targetType: 'user', targetId: req.user.id, ip: req.ip });
  clearSessionCookie(res);
  res.status(204).end();
});
