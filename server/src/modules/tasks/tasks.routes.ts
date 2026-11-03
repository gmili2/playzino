import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { claimTask, taskState } from './tasks.service.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get('/', async (req, res) => {
  res.json(await taskState(req.user!.id));
});

tasksRouter.post('/claim', async (req, res) => {
  res.json(await claimTask(req.user!.id, req.ip));
});
