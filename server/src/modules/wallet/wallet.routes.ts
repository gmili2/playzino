import { Router } from 'express';
import { z } from 'zod';
import { DAILY_BONUS } from '../../config.js';
import { parse } from '../../lib/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { listTransactions, walletOp } from './wallet.service.js';

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get('/', async (req, res) => {
  const q = parse(z.object({ take: z.coerce.number().int().min(1).max(100).default(30), cursor: z.string().max(30).optional() }), req.query);
  res.json(await listTransactions(req.user!.id, q.take, q.cursor));
});

/** Bonus quotidien : la clé inclut la date UTC, il ne peut être perçu qu'une fois par jour. */
walletRouter.post('/daily-bonus', async (req, res) => {
  const day = new Date().toISOString().slice(0, 10);
  const r = await walletOp({
    userId: req.user!.id,
    amount: DAILY_BONUS,
    type: 'DAILY_BONUS',
    reason: `Récompense quotidienne ${day}`,
    idempotencyKey: `daily:${req.user!.id}:${day}`
  });
  res.status(r.duplicate ? 409 : 201).json(
    r.duplicate
      ? { error: { code: 'ALREADY_CLAIMED', message: 'Récompense déjà perçue aujourd’hui' }, balance: r.balance }
      : { balance: r.balance, transaction: r.transaction }
  );
});
