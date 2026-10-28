import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { gameManager } from '../../realtime/gameManager.js';

/**
 * Les actions de jeu passent normalement par Socket.IO ; ces routes REST
 * exposent les mêmes opérations (mêmes validations serveur) pour les clients sans WebSocket.
 */
export const gamesRouter = Router();
gamesRouter.use(requireAuth);

gamesRouter.get('/:id', async (req, res) => {
  res.json({ game: await gameManager.getSnapshotFor(String(req.params.id), req.user!.id) });
});

gamesRouter.post('/:id/roll', async (req, res) => {
  res.json({ game: await gameManager.roll(String(req.params.id), req.user!.id) });
});

gamesRouter.post('/:id/move', async (req, res) => {
  const { pawn } = parse(z.object({ pawn: z.number().int().min(0).max(3) }), req.body);
  res.json({ game: await gameManager.move(String(req.params.id), req.user!.id, pawn) });
});

gamesRouter.post('/:id/forfeit', async (req, res) => {
  res.json({ game: await gameManager.forfeit(String(req.params.id), req.user!.id) });
});
