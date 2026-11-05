import { Worker } from 'node:worker_threads';
import { c4BotColumn, type C4State } from './connect4.js';
import type { BotLevel } from './engine.js';

/*
 * Colonne du robot Puissance 4 calculée hors du fil principal (worker_threads) au niveau EXPERT, le seul qui
 * cherche longtemps. Sous vitest (sources .ts, worker non compilé) ou si le thread échoue : calcul direct.
 */
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (c: number | null) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  const url = new URL('./c4.worker.js', import.meta.url);
  if (!import.meta.url.endsWith('.js')) return null;
  worker = new Worker(url);
  worker.on('message', (m: { id: number; column?: number | null; error?: string }) => {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error));
    else p.resolve(m.column ?? null);
  });
  const fail = (e: Error) => {
    for (const p of pending.values()) p.reject(e);
    pending.clear();
    worker = null; // recréé au prochain coup
  };
  worker.on('error', fail);
  worker.on('exit', (code) => { if (code !== 0) fail(new Error(`worker c4 arrêté (${code})`)); else worker = null; });
  // Après les écouteurs (qui réactivent le port) : le thread n'empêche pas l'arrêt du processus.
  worker.unref();
  return worker;
}

export async function c4BotColumnAsync(state: C4State, level: BotLevel): Promise<number | null> {
  if (level !== 'EXPERT') return c4BotColumn(state, level);
  const w = getWorker();
  if (!w) return c4BotColumn(state, level);
  try {
    return await new Promise<number | null>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, state, level });
    });
  } catch (e) {
    console.error('[c4 worker]', e);
    return c4BotColumn(state, level);
  }
}
