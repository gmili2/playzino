import { Router } from 'express';
import { z } from 'zod';
import { ALLOWED_STAKES, TURN_SECONDS } from '../../config.js';
import { parse } from '../../lib/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { gameManager } from '../../realtime/gameManager.js';
import { hub } from '../../realtime/hub.js';
import {
  createPracticeRoom, createRoom, currentRoomOf, getRoomFor, joinByCode, joinRoom, leaveWaitingRoom, listPublicRooms, quickJoin,
  type JoinResult
} from './rooms.service.js';

export const roomsRouter = Router();

const stakeSchema = z.coerce.number().int().refine((v) => (ALLOWED_STAKES as readonly number[]).includes(v), {
  message: `Mise autorisée : ${ALLOWED_STAKES.join(', ')}`
});

roomsRouter.get('/', async (req, res) => {
  const q = parse(z.object({ status: z.enum(['WAITING', 'PLAYING']).optional(), q: z.string().trim().max(40).optional() }), req.query);
  res.json({ items: await listPublicRooms(q, req.user?.id) });
});

roomsRouter.get('/current', requireAuth, async (req, res) => {
  res.json({ room: await currentRoomOf(req.user!.id) });
});

roomsRouter.get('/:id', requireAuth, async (req, res) => {
  res.json({ room: await getRoomFor(String(req.params.id), req.user!.id) });
});

const playersSchema = z.coerce.number().int().min(2, '2 à 4 joueurs').max(4, '2 à 4 joueurs').default(2);

const createSchema = z.object({
  name: z.string().trim().min(3, '3 caractères minimum').max(40),
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
  stake: stakeSchema.default(0),
  turnSeconds: z.coerce.number().int().refine((v) => (TURN_SECONDS as readonly number[]).includes(v)).default(30),
  maxPlayers: playersSchema
});

roomsRouter.post('/', requireAuth, async (req, res) => {
  const room = await createRoom(req.user!.id, parse(createSchema, req.body), req.ip);
  hub.lobbyChanged();
  res.status(201).json({ room });
});

/** Après un join : si la table est complète, la partie démarre et les joueurs sont prévenus. */
async function afterJoin(r: JoinResult) {
  if (r.startedGameId) {
    await gameManager.load(r.startedGameId);
    hub.roomChanged(r.room.id, { ...r.room, status: 'PLAYING', gameId: r.startedGameId });
  } else {
    hub.roomChanged(r.room.id, r.room);
  }
  hub.lobbyChanged();
  return { room: r.startedGameId ? { ...r.room, status: 'PLAYING', gameId: r.startedGameId } : r.room };
}

roomsRouter.post('/practice', requireAuth, async (req, res) => {
  const body = parse(
    z.object({
      bots: z.coerce.number().int().min(1, '1 à 3 robots').max(3, '1 à 3 robots').default(1),
      turnSeconds: z.coerce.number().int().refine((v) => (TURN_SECONDS as readonly number[]).includes(v)).default(30)
    }),
    req.body ?? {}
  );
  res.status(201).json(await afterJoin(await createPracticeRoom(req.user!.id, body.bots, body.turnSeconds, req.ip)));
});

roomsRouter.post('/quick', requireAuth, async (req, res) => {
  const { stake, maxPlayers } = parse(z.object({ stake: stakeSchema.default(0), maxPlayers: playersSchema }), req.body ?? {});
  res.json(await afterJoin(await quickJoin(req.user!.id, stake, maxPlayers, req.ip)));
});

roomsRouter.post('/join-code', requireAuth, async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().regex(/^PRC-[A-Za-z0-9]{4}$/, 'Format attendu : PRC-XXXX') }), req.body);
  res.json(await afterJoin(await joinByCode(req.user!.id, code, req.ip)));
});

roomsRouter.post('/:id/join', requireAuth, async (req, res) => {
  res.json(await afterJoin(await joinRoom(req.user!.id, String(req.params.id), req.ip)));
});

roomsRouter.post('/:id/leave', requireAuth, async (req, res) => {
  const id = String(req.params.id);
  await leaveWaitingRoom(req.user!.id, id, req.ip);
  hub.roomChanged(id, null);
  hub.lobbyChanged();
  res.status(204).end();
});
