import { parentPort } from 'node:worker_threads';
import { c4BotColumn, type C4State } from './connect4.js';
import type { BotLevel } from './engine.js';

/** Thread de calcul du robot Puissance 4 : la recherche (≈ 0,25 s en EXPERT) ne bloque plus le serveur. */
parentPort!.on('message', (m: { id: number; state: C4State; level: BotLevel }) => {
  try {
    parentPort!.postMessage({ id: m.id, column: c4BotColumn(m.state, m.level) });
  } catch (e) {
    parentPort!.postMessage({ id: m.id, error: e instanceof Error ? e.message : String(e) });
  }
});
