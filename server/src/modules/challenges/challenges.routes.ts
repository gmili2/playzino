import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { gameTypeSchema, stakeSchema } from '../rooms/rooms.routes.js';
import { acceptChallenge, cancelChallenge, declineChallenge, onlinePlayers, sendChallenge } from './challenges.service.js';

/** Joueurs en ligne et défis directs entre deux joueurs. */
export const challengesRouter = Router();
challengesRouter.use(requireAuth);

challengesRouter.get('/online', async (req, res) => {
  res.json({ players: await onlinePlayers(req.user!.id) });
});

challengesRouter.post('/', async (req, res) => {
  const body = parse(z.object({ toUserId: z.string().min(1).max(30), stake: stakeSchema.default(0), gameType: gameTypeSchema }), req.body ?? {});
  res.status(201).json(await sendChallenge(req.user!.id, body));
});

challengesRouter.post('/:id/accept', async (req, res) => {
  res.json(await acceptChallenge(req.user!.id, String(req.params.id), req.ip));
});

challengesRouter.post('/:id/decline', async (req, res) => {
  declineChallenge(req.user!.id, String(req.params.id));
  res.status(204).end();
});

challengesRouter.post('/:id/cancel', async (req, res) => {
  cancelChallenge(req.user!.id, String(req.params.id));
  res.status(204).end();
});
