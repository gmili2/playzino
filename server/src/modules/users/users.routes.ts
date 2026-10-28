import { Router } from 'express';
import { z } from 'zod';
import { setSessionCookie, signSession } from '../../lib/session.js';
import { parse } from '../../lib/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { emailSchema, passwordSchema, usernameSchema } from '../auth/auth.schemas.js';
import { changePassword, gameHistory, getMe, updateProfile } from './users.service.js';

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get('/', async (req, res) => {
  res.json({ user: await getMe(req.user!.id) });
});

const updateSchema = z
  .object({
    username: usernameSchema.optional(),
    email: emailSchema.optional(),
    bio: z.string().trim().max(280).nullable().optional(),
    avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    soundEnabled: z.boolean().optional(),
    invitesEnabled: z.boolean().optional(),
    hideOnline: z.boolean().optional()
  })
  .strict();

meRouter.patch('/', async (req, res) => {
  res.json({ user: await updateProfile(req.user!.id, parse(updateSchema, req.body), req.ip) });
});

meRouter.post('/password', async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }), req.body);
  const user = await changePassword(req.user!.id, body.currentPassword, body.newPassword, req.ip);
  setSessionCookie(res, signSession(user.id, user.tokenVersion));
  res.status(204).end();
});

meRouter.get('/games', async (req, res) => {
  const { take } = parse(z.object({ take: z.coerce.number().int().min(1).max(100).default(20) }), req.query);
  res.json({ items: await gameHistory(req.user!.id, take) });
});
