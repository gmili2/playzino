/**
 * Moteur de règles Parcheesi — fonctions pures, sans E/S.
 * Variante documentée dans RULES.md (Parchís espagnol à un dé, plateau 68 cases).
 *
 * Position d'un pion (relative à sa couleur) :
 *   -1        dans le nid (maison de départ)
 *   0..55     sur la piste commune (0 = case de sortie)
 *   56..62    dans le couloir final (privé)
 *   63        arrivé au centre
 */

export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export const TRACK_LENGTH = 68;
export const LAST_TRACK = 55;
export const GOAL = 63;
export const NEST = -1;
export const PAWNS_PER_PLAYER = 4;

/** Case absolue de sortie de chaque couleur (identique au plateau du design). */
export const START: Record<Color, number> = { red: 4, yellow: 21, green: 38, blue: 55 };
/** Cases sûres (absolues) : pas de capture. Inclut les 4 cases de sortie. */
export const SAFE = [4, 11, 16, 21, 28, 33, 38, 45, 50, 55, 62, 67];

export const CAPTURE_BONUS = 20;
export const HOME_BONUS = 10;

export type Phase = 'roll' | 'move' | 'bonus' | 'finished';

export interface GameState {
  colors: Color[];
  turn: number;
  phase: Phase;
  /** Dernière valeur du dé (1..6), null avant le premier lancer du tour. */
  die: number | null;
  /** Nombre de cases à jouer dans la phase move/bonus (6 vaut 7 si aucun pion au nid). */
  moveValue: number | null;
  sixesInRow: number;
  pawns: Record<string, number[]>;
  /** Ordre d'arrivée sur une case, pour départager la capture à la sortie. */
  stamps: Record<string, number[]>;
  stampCounter: number;
  lastMoved: { color: Color; pawn: number } | null;
  bonusQueue: number[];
  winner: Color | null;
  /** Numéro d'action, incrémenté à chaque lancer/déplacement accepté. */
  seq: number;
}

export interface Move {
  pawn: number;
  from: number;
  to: number;
  capture?: { color: Color; pawn: number };
}

export type GameEvent =
  | { type: 'roll'; color: Color; value: number; moveValue: number }
  | { type: 'exit'; color: Color; pawn: number }
  | { type: 'move'; color: Color; pawn: number; from: number; to: number; bonus?: boolean }
  | { type: 'capture'; color: Color; victim: Color; pawn: number }
  | { type: 'home'; color: Color; pawn: number }
  | { type: 'bonus'; color: Color; amount: number }
  | { type: 'bonus_lost'; color: Color; amount: number }
  | { type: 'three_sixes'; color: Color; pawn: number | null }
  | { type: 'no_move'; color: Color; value: number }
  | { type: 'extra_turn'; color: Color }
  | { type: 'turn'; color: Color }
  | { type: 'win'; color: Color };

export class RuleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export function createGame(colors: Color[]): GameState {
  if (colors.length < 2 || colors.length > 4 || new Set(colors).size !== colors.length) {
    throw new RuleError('BAD_COLORS', 'Entre 2 et 4 couleurs distinctes');
  }
  const pawns: Record<string, number[]> = {};
  const stamps: Record<string, number[]> = {};
  for (const c of colors) {
    pawns[c] = [NEST, NEST, NEST, NEST];
    stamps[c] = [0, 0, 0, 0];
  }
  return {
    colors: [...colors],
    turn: 0,
    phase: 'roll',
    die: null,
    moveValue: null,
    sixesInRow: 0,
    pawns,
    stamps,
    stampCounter: 0,
    lastMoved: null,
    bonusQueue: [],
    winner: null,
    seq: 0
  };
}

export const currentColor = (s: GameState): Color => s.colors[s.turn];

export function absSquare(color: Color, p: number): number {
  return (START[color] + p) % TRACK_LENGTH;
}

const isTrack = (p: number) => p >= 0 && p <= LAST_TRACK;

interface Occupant {
  color: Color;
  pawn: number;
}

function occupantsAt(s: GameState, abs: number): Occupant[] {
  const out: Occupant[] = [];
  for (const c of s.colors) {
    s.pawns[c].forEach((p, i) => {
      if (isTrack(p) && absSquare(c, p) === abs) out.push({ color: c, pawn: i });
    });
  }
  return out;
}

/** Deux pions de même couleur sur une case de piste forment un barrage infranchissable. */
function isBlockade(occ: Occupant[]): boolean {
  return occ.length === 2 && occ[0].color === occ[1].color;
}

function blockadeMembers(s: GameState, color: Color): Set<number> {
  const members = new Set<number>();
  const byAbs = new Map<number, number[]>();
  s.pawns[color].forEach((p, i) => {
    if (!isTrack(p)) return;
    const a = absSquare(color, p);
    byAbs.set(a, [...(byAbs.get(a) ?? []), i]);
  });
  for (const ids of byAbs.values()) if (ids.length >= 2) ids.forEach((i) => members.add(i));
  return members;
}

function exitMove(s: GameState, color: Color, pawn: number): Move | null {
  const start = START[color];
  const occ = occupantsAt(s, start);
  if (occ.length < 2) return { pawn, from: NEST, to: 0 };
  const rivals = occ.filter((o) => o.color !== color);
  if (rivals.length === 0) return null;
  // Deux pions sur la case de sortie dont au moins un adverse : on capture le dernier arrivé.
  const victim = rivals.reduce((a, b) => (s.stamps[b.color][b.pawn] > s.stamps[a.color][a.pawn] ? b : a));
  return { pawn, from: NEST, to: 0, capture: victim };
}

function stepMove(s: GameState, color: Color, pawn: number, value: number): Move | null {
  const from = s.pawns[color][pawn];
  if (from < 0 || from >= GOAL) return null;
  const to = from + value;
  if (to > GOAL) return null;
  // Aucun barrage ne peut être franchi ni occupé sur la piste commune.
  for (let q = from + 1; q <= Math.min(to, LAST_TRACK); q++) {
    if (isBlockade(occupantsAt(s, absSquare(color, q)))) return null;
  }
  if (to > LAST_TRACK) return { pawn, from, to };
  const abs = absSquare(color, to);
  const occ = occupantsAt(s, abs).filter((o) => !(o.color === color && o.pawn === pawn));
  if (occ.length >= 2) return null;
  if (occ.length === 1 && occ[0].color !== color && !SAFE.includes(abs)) {
    return { pawn, from, to, capture: occ[0] };
  }
  return { pawn, from, to };
}

export function legalMoves(s: GameState): Move[] {
  if (s.phase !== 'move' && s.phase !== 'bonus') return [];
  const color = currentColor(s);
  const value = s.moveValue ?? 0;
  const pawns = s.pawns[color];

  if (s.phase === 'move' && s.die === 5) {
    const exits = pawns
      .map((p, i) => (p === NEST ? exitMove(s, color, i) : null))
      .filter((m): m is Move => m !== null);
    // Sortir un pion avec un 5 est obligatoire quand c'est possible.
    if (exits.length) return exits;
  }

  let moves = pawns
    .map((_, i) => stepMove(s, color, i, value))
    .filter((m): m is Move => m !== null);

  if (s.phase === 'move' && s.die === 6) {
    // Avec un 6, il faut ouvrir son propre barrage si on peut.
    const members = blockadeMembers(s, color);
    const opening = moves.filter((m) => members.has(m.pawn));
    if (opening.length) moves = opening;
  }
  return moves;
}

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}

function nextTurn(s: GameState, events: GameEvent[]) {
  s.turn = (s.turn + 1) % s.colors.length;
  s.sixesInRow = 0;
  s.phase = 'roll';
  s.moveValue = null;
  s.lastMoved = null;
  events.push({ type: 'turn', color: currentColor(s) });
}

/** Fin d'un coup (après bonus éventuels) : un 6 rejoue, sinon on passe la main. */
function endOfMove(s: GameState, events: GameEvent[]) {
  s.bonusQueue = [];
  if (s.die === 6) {
    s.phase = 'roll';
    s.moveValue = null;
    events.push({ type: 'extra_turn', color: currentColor(s) });
  } else {
    nextTurn(s, events);
  }
}

/** Enchaîne les bonus en attente ; un bonus sans coup légal est perdu. */
function resolveBonuses(s: GameState, events: GameEvent[]) {
  const color = currentColor(s);
  while (s.bonusQueue.length) {
    s.phase = 'bonus';
    s.moveValue = s.bonusQueue[0];
    if (legalMoves(s).length) return;
    events.push({ type: 'bonus_lost', color, amount: s.bonusQueue[0] });
    s.bonusQueue.shift();
  }
  endOfMove(s, events);
}

export function applyRoll(state: GameState, value: number): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'roll') throw new RuleError('NOT_ROLL_PHASE', 'Ce n’est pas le moment de lancer le dé');
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new RuleError('BAD_DIE', 'Valeur de dé invalide');
  const s = clone(state);
  const color = currentColor(s);
  const events: GameEvent[] = [];
  s.seq++;
  s.die = value;
  s.sixesInRow = value === 6 ? s.sixesInRow + 1 : 0;
  const noneInNest = s.pawns[color].every((p) => p !== NEST);
  s.moveValue = value === 6 && noneInNest ? 7 : value;
  events.push({ type: 'roll', color, value, moveValue: s.moveValue });

  if (s.sixesInRow === 3) {
    // Troisième 6 consécutif : le dernier pion déplacé retourne au nid (sauf s'il est dans le couloir final).
    let penalized: number | null = null;
    const lm = s.lastMoved;
    if (lm && lm.color === color && isTrack(s.pawns[color][lm.pawn])) {
      s.pawns[color][lm.pawn] = NEST;
      penalized = lm.pawn;
    }
    events.push({ type: 'three_sixes', color, pawn: penalized });
    nextTurn(s, events);
    return { state: s, events };
  }

  s.phase = 'move';
  if (legalMoves(s).length === 0) {
    events.push({ type: 'no_move', color, value: s.moveValue });
    endOfMove(s, events);
  }
  return { state: s, events };
}

export function applyMove(state: GameState, pawn: number): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'move' && state.phase !== 'bonus') {
    throw new RuleError('NOT_MOVE_PHASE', 'Lancez d’abord le dé');
  }
  const move = legalMoves(state).find((m) => m.pawn === pawn);
  if (!move) throw new RuleError('ILLEGAL_MOVE', 'Ce pion ne peut pas jouer ce coup');

  const s = clone(state);
  const color = currentColor(s);
  const events: GameEvent[] = [];
  const isBonus = s.phase === 'bonus';
  s.seq++;
  if (isBonus) s.bonusQueue.shift();

  s.pawns[color][pawn] = move.to;
  s.stamps[color][pawn] = ++s.stampCounter;
  s.lastMoved = { color, pawn };
  if (move.from === NEST) events.push({ type: 'exit', color, pawn });
  else events.push({ type: 'move', color, pawn, from: move.from, to: move.to, bonus: isBonus || undefined });

  if (move.capture) {
    s.pawns[move.capture.color][move.capture.pawn] = NEST;
    events.push({ type: 'capture', color, victim: move.capture.color, pawn: move.capture.pawn });
    s.bonusQueue.push(CAPTURE_BONUS);
    events.push({ type: 'bonus', color, amount: CAPTURE_BONUS });
  }
  if (move.to === GOAL) {
    events.push({ type: 'home', color, pawn });
    if (s.pawns[color].every((p) => p === GOAL)) {
      s.winner = color;
      s.phase = 'finished';
      s.moveValue = null;
      s.bonusQueue = [];
      events.push({ type: 'win', color });
      return { state: s, events };
    }
    s.bonusQueue.push(HOME_BONUS);
    events.push({ type: 'bonus', color, amount: HOME_BONUS });
  }

  resolveBonuses(s, events);
  return { state: s, events };
}

/**
 * Coup automatique (temps écoulé) : lance si nécessaire, puis joue le pion le plus avancé.
 * Le dé est fourni par l'appelant (aléatoire côté serveur).
 */
export function autoMovePawn(s: GameState): number | null {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  return moves.reduce((best, m) => (m.to > best.to ? m : best)).pawn;
}

export function finishedCount(s: GameState, color: Color): number {
  return s.pawns[color].filter((p) => p === GOAL).length;
}
