import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { listTransactions } from './wallet.service.js';

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get('/', async (req, res) => {
  const q = parse(z.object({ take: z.coerce.number().int().min(1).max(100).default(30), cursor: z.string().max(30).optional() }), req.query);
  res.json(await listTransactions(req.user!.id, q.take, q.cursor));
});
