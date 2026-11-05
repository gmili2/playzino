import { Router } from 'express';
import { getSupport } from '../../lib/settings.js';

/** Contact du support affiché aux joueurs (bouton « الدعم ») : public, réglé dans l'administration. */
export const supportRouter = Router();

supportRouter.get('/', async (_req, res) => {
  res.json(await getSupport());
});
