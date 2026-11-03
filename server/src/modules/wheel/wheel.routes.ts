import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { paidSpin, wheelState } from './wheel.service.js';

export const wheelRouter = Router();
wheelRouter.use(requireAuth);

wheelRouter.get('/', async (req, res) => {
  res.json(await wheelState(req.user!.id));
});

wheelRouter.post('/paid-spin', async (req, res) => {
  res.status(201).json(await paidSpin(req.user!.id));
});
