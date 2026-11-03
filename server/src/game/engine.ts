/**
 * Moteur de règles Parcheesi — fonctions pures, sans E/S.
 * Variante documentée dans RULES.md (Parchís espagnol à un dé, plateau 68 cases).
 *
 * Position d'un pion (relative à sa couleur) :
 *   -1        dans le nid (maison de départ)
 *   0..63     sur la piste commune (0 = case de sortie, 63 = case d'entrée du couloir, 5 cases avant la sortie)
 *   64..70    dans le couloir final (privé)
 *   71        arrivé au centre
 */

export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export const TRACK_LENGTH = 68;
export const LAST_TRACK = 63;
export const GOAL = 71;
export const NEST = -1;
export const PAWNS_PER_PLAYER = 4;

/** Case absolue de sortie de chaque couleur (identique au plateau du design). */
// Cases de sortie (numéros 5, 22, 39, 56 affichés) : jaune en haut à gauche, puis bleu, rouge, vert dans le sens antihoraire.
export const START: Record<Color, number> = { yellow: 4, blue: 21, red: 38, green: 55 };
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
  /** Couleurs éliminées (abandon ou déconnexion) : elles ne jouent plus. Absent des états anciens. */
  out?: Color[];
  /** Numéro d'action, incrémenté à chaque lancer/déplacement accepté. */
  seq: number;
  /** Longueur du parcours sur la piste (64) ; absent des parties créées avec l'ancien parcours de 56 cases. */
  track?: number;
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
  | { type: 'eliminated'; color: Color }
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
    out: [],
    seq: 0,
    track: LAST_TRACK + 1
  };
}

/**
 * Partie créée avec l'ancien parcours (56 cases de piste, couloir 56‥62, arrivée 63) : on décale le couloir et
 * l'arrivée pour qu'aucun pion déjà rentré ne retourne sur la piste.
 */
export function upgradeState(s: GameState): GameState {
  if (s.track) return s;
  const OLD_LAST = 55;
  for (const c of Object.keys(s.pawns)) s.pawns[c] = s.pawns[c].map((p) => (p > OLD_LAST ? p + (LAST_TRACK - OLD_LAST) : p));
  s.track = LAST_TRACK + 1;
  return s;
}

/** Ordre de jeu : sens de la piste (jaune → bleu → rouge → vert), quel que soit l'ordre des sièges. */
export function turnOrder(colors: Color[]): Color[] {
  return [...colors].sort((a, b) => START[a] - START[b]);
}

export const activeColors = (s: GameState): Color[] => s.colors.filter((c) => !(s.out ?? []).includes(c));

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
  const out = s.out ?? [];
  do {
    s.turn = (s.turn + 1) % s.colors.length;
  } while (out.includes(s.colors[s.turn]) && out.length < s.colors.length);
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

/**
 * Élimine une couleur (abandon, déconnexion, suspension) : ses pions quittent le plateau.
 * S'il ne reste qu'un joueur actif, il gagne la partie.
 */
export function eliminate(state: GameState, color: Color): { state: GameState; events: GameEvent[] } {
  if (state.phase === 'finished') throw new RuleError('GAME_OVER', 'La partie est terminée');
  if (!state.colors.includes(color)) throw new RuleError('BAD_COLOR', 'Couleur absente de la partie');
  if ((state.out ?? []).includes(color)) return { state, events: [] };
  const s = clone(state);
  const events: GameEvent[] = [];
  s.seq++;
  s.out = [...(s.out ?? []), color];
  s.pawns[color] = s.pawns[color].map(() => NEST);
  events.push({ type: 'eliminated', color });
  const remaining = activeColors(s);
  if (remaining.length === 1) {
    s.winner = remaining[0];
    s.phase = 'finished';
    s.moveValue = null;
    s.bonusQueue = [];
    events.push({ type: 'win', color: remaining[0] });
    return { state: s, events };
  }
  if (currentColor(s) === color) {
    s.bonusQueue = [];
    nextTurn(s, events);
  }
  return { state: s, events };
}

export function finishedCount(s: GameState, color: Color): number {
  return s.pawns[color].filter((p) => p === GOAL).length;
}

export const BOT_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'EXPERT'] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

/**
 * Stratégie du robot selon le niveau choisi par l'administrateur :
 * - LOW : un coup légal au hasard ;
 * - MEDIUM : glouton simple (arriver au centre > capturer > sortir un pion > avancer), sans lire le danger ;
 * - HIGH : en plus, se mettre à l'abri, former des barrages et éviter de finir exposé juste devant
 *   un pion adverse ;
 * - EXPERT : joue chaque coup (bonus de capture ou d'arrivée compris) et évalue la position obtenue : avance sur
 *   les adversaires, probabilité d'être capturé au prochain lancer, menaces sur les pions adverses, barrages.
 * MEDIUM, HIGH et EXPERT sont déterministes (aucun aléa) pour être testables.
 */
export function botChooseMove(s: GameState, level: BotLevel = 'HIGH', rand: () => number = Math.random): number | null {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  if (level === 'LOW') return moves[Math.floor(rand() * moves.length)].pawn;
  if (level === 'EXPERT') return expertMove(s, moves);
  if (level === 'MEDIUM') {
    const simple = (m: Move) => m.to + (m.to === GOAL ? 1000 : 0) + (m.capture ? 500 : 0) + (m.from === NEST ? 300 : 0);
    return moves.reduce((best, m) => (simple(m) > simple(best) ? m : best)).pawn;
  }
  const color = currentColor(s);
  const rivals = activeColors(s).filter((c) => c !== color);

  // Un pion adverse situé 1 à 6 cases derrière une case peut l'atteindre au prochain lancer.
  const threatened = (abs: number) =>
    rivals.some((c) =>
      s.pawns[c].some((p) => {
        if (!isTrack(p)) return false;
        const dist = (abs - absSquare(c, p) + TRACK_LENGTH) % TRACK_LENGTH;
        return dist >= 1 && dist <= 6 && p + dist <= LAST_TRACK;
      })
    );

  const score = (m: Move) => {
    let v = m.to; // progression
    if (m.to === GOAL) v += 1000;
    if (m.capture) v += 500 + Math.max(0, s.pawns[m.capture.color][m.capture.pawn]);
    if (m.from === NEST) v += 300;
    if (m.to > LAST_TRACK && m.to < GOAL) v += 120; // à l'abri dans le couloir final
    if (isTrack(m.to)) {
      const abs = absSquare(color, m.to);
      if (SAFE.includes(abs)) v += 60;
      else if (threatened(abs)) v -= 150;
      if (s.pawns[color].some((p, i) => i !== m.pawn && isTrack(p) && absSquare(color, p) === abs)) v += 40; // barrage
    }
    // Quitter une case menacée est une bonne idée.
    if (isTrack(m.from) && !SAFE.includes(absSquare(color, m.from)) && threatened(absSquare(color, m.from))) v += 80;
    return v;
  };
  return moves.reduce((best, m) => (score(m) > score(best) ? m : best)).pawn;
}

// ---------- robot EXPERT ----------

const WIN_VALUE = 1_000_000;
/**
 * Poids de l'évaluation, réglés en faisant jouer EXPERT contre HIGH (≈ 67 % de victoires sur 1 500 parties) :
 * out = valeur d'un pion sorti du nid (il faut un 5), home = bonus du couloir final où il ne craint plus rien,
 * risk = poids du risque de capture, threat = poids des menaces sur l'adversaire, maxRival = part du rival le plus avancé.
 */
const W = { out: 18, risk: 1, threat: 0.25, maxRival: 0.65, home: 30 };

/**
 * Valeur d'un pion selon sa position : progression, sortie du nid, sécurité du couloir final.
 * Le centre ne vaut pas plus que le couloir : un pion du couloir est déjà à l'abri, le robot garde donc ses dés pour
 * les pions exposés et ne le rentre que s'il n'a rien de mieux (ou pour gagner). Mesuré : 67 % contre HIGH, 51 % sinon.
 */
function pawnValue(p: number): number {
  if (p === NEST) return 0;
  if (p === GOAL) return W.out + GOAL + 25;
  return W.out + p + 1 + (p > LAST_TRACK ? W.home : 0);
}

/** Probabilité qu'un lancer (1‥6, le 6 valant 7 sans pion au nid) amène un pion de `attacker` sur `abs`. */
function hitChance(s: GameState, attacker: Color, abs: number): number {
  const reach = new Set<number>();
  const sixIsSeven = s.pawns[attacker].every((p) => p !== NEST);
  for (const p of s.pawns[attacker]) {
    if (!isTrack(p)) continue;
    const dist = (abs - absSquare(attacker, p) + TRACK_LENGTH) % TRACK_LENGTH;
    if (p + dist > LAST_TRACK) continue;
    if (dist >= 1 && dist <= 5) reach.add(dist);
    if (dist === (sixIsSeven ? 7 : 6)) reach.add(6);
  }
  // Un 6 rejoue : on compte un peu les doubles lancers (6 puis 1‥6).
  let n = reach.size;
  if (!reach.has(6)) {
    for (const p of s.pawns[attacker]) {
      if (!isTrack(p)) continue;
      const dist = (abs - absSquare(attacker, p) + TRACK_LENGTH) % TRACK_LENGTH;
      const step = sixIsSeven ? 7 : 6;
      if (dist > step && dist - step <= 6 && p + dist <= LAST_TRACK) {
        n += 1 / 6;
        break;
      }
    }
  }
  return Math.min(6, n) / 6;
}

/** Évaluation de la position du point de vue de `me` (plus grand = meilleur). */
function evaluateFor(s: GameState, me: Color): number {
  if (s.winner) return s.winner === me ? WIN_VALUE : -WIN_VALUE;
  const rivals = activeColors(s).filter((c) => c !== me);
  const total = (c: Color) => s.pawns[c].reduce((a, p) => a + pawnValue(p), 0);

  let v = total(me);
  if (rivals.length) {
    const scores = rivals.map(total);
    // Surveiller surtout le rival le plus avancé.
    v -= W.maxRival * Math.max(...scores) + ((1 - W.maxRival) * scores.reduce((a, b) => a + b, 0)) / scores.length;
  }

  const myBlocks = blockadeMembers(s, me);
  s.pawns[me].forEach((p, i) => {
    if (!isTrack(p)) return;
    const abs = absSquare(me, p);
    if (SAFE.includes(abs) || myBlocks.has(i)) return;
    // Risque : chance d'être capturé avant notre prochain tour (pion perdu + bonus de 20 offert).
    let safe = 1;
    for (const c of rivals) safe *= 1 - hitChance(s, c, abs);
    v -= W.risk * (1 - safe) * (pawnValue(p) + CAPTURE_BONUS + 6);
  });

  // Menaces : pions adverses exposés que nous pourrons capturer au prochain tour.
  for (const c of rivals) {
    const blocks = blockadeMembers(s, c);
    s.pawns[c].forEach((p, i) => {
      if (!isTrack(p) || blocks.has(i)) return;
      const abs = absSquare(c, p);
      if (SAFE.includes(abs)) return;
      v += W.threat * hitChance(s, me, abs) * (pawnValue(p) + CAPTURE_BONUS);
    });
  }

  // Barrage juste devant un pion adverse : il le bloque.
  for (const i of myBlocks) {
    const abs = absSquare(me, s.pawns[me][i]);
    const blocking = rivals.some((c) => s.pawns[c].some((p) => isTrack(p) && ((abs - absSquare(c, p) + TRACK_LENGTH) % TRACK_LENGTH) <= 6));
    v += blocking ? 6 : 2;
  }
  return v;
}

/** Meilleure suite pour la couleur au trait (coup puis bonus éventuels), vue de cette couleur. */
function greedyReply(s: GameState): GameState {
  const color = currentColor(s);
  let state = s;
  for (let k = 0; k < 3 && (state.phase === 'move' || state.phase === 'bonus') && currentColor(state) === color; k++) {
    let best: GameState | null = null, bestScore = -Infinity;
    for (const m of legalMoves(state)) {
      const next = applyMove(state, m.pawn).state;
      const v = evaluateFor(next, color);
      if (v > bestScore) {
        bestScore = v;
        best = next;
      }
    }
    if (!best) break;
    state = best;
  }
  return state;
}

/**
 * Espérance de la position après le prochain lancer de l'adversaire suivant (6 valeurs équiprobables,
 * l'adversaire jouant au mieux pour lui), vue de `me`.
 */
function expectAfterReply(s: GameState, me: Color): number {
  if (s.phase === 'finished' || currentColor(s) === me || s.phase !== 'roll') return evaluateFor(s, me);
  let sum = 0;
  for (let d = 1; d <= 6; d++) sum += evaluateFor(greedyReply(applyRoll(s, d).state), me);
  return sum / 6;
}

/** Comme bestFollowUp, mais chaque position finale est jugée après la réponse de l'adversaire. */
function bestLine(s: GameState, me: Color, depth: number): number {
  if (depth < 3 && (s.phase === 'move' || s.phase === 'bonus') && currentColor(s) === me) {
    let best = -Infinity;
    for (const m of legalMoves(s)) best = Math.max(best, bestLine(applyMove(s, m.pawn).state, me, depth + 1));
    if (best > -Infinity) return best;
  }
  return expectAfterReply(s, me);
}

function expertMove(s: GameState, moves: Move[]): number {
  const me = currentColor(s);
  let best = moves[0], bestScore = -Infinity;
  for (const m of moves) {
    const v = bestLine(applyMove(s, m.pawn).state, me, 0);
    if (v > bestScore) {
      bestScore = v;
      best = m;
    }
  }
  return best.pawn;
}
