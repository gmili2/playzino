import { RuleError, type BotLevel, type Color } from './engine.js';

/**
 * Moteur Puissance 4 (pur, sans I/O) : grille de 6 lignes × 7 colonnes, deux joueurs.
 * Le premier qui aligne 4 jetons (horizontal, vertical ou diagonal) gagne ; grille pleine = match nul.
 */

export const ROWS = 6;
export const COLS = 7;
const CELLS = ROWS * COLS;

export interface C4State {
  game: 'CONNECT4';
  colors: Color[];
  turn: number;
  seq: number;
  phase: 'play' | 'finished';
  /** Index ligne × COLS + colonne, ligne 0 en haut. */
  board: (Color | null)[];
  winner: Color | null;
  draw: boolean;
  /** Les 4 (ou plus) cases alignées du gagnant, pour les mettre en évidence. */
  winLine: number[] | null;
  /** Dernière case jouée. */
  last: number | null;
  out: Color[];
}

export type C4Event =
  | { type: 'drop'; color: Color; column: number; row: number }
  | { type: 'win'; color: Color }
  | { type: 'draw' }
  | { type: 'eliminated'; color: Color };

export interface C4Move {
  column: number;
}

export function createConnect4(colors: Color[]): C4State {
  if (colors.length !== 2 || colors[0] === colors[1]) throw new RuleError('BAD_COLORS', 'Puissance 4 se joue à deux');
  return { game: 'CONNECT4', colors: [...colors], turn: 0, seq: 0, phase: 'play', board: Array(CELLS).fill(null), winner: null, draw: false, winLine: null, last: null, out: [] };
}

export const c4Current = (s: C4State) => s.colors[s.turn];
export const c4Active = (s: C4State) => s.colors.filter((c) => !s.out.includes(c));

/** Ligne d'arrivée d'un jeton lâché dans la colonne, ou -1 si elle est pleine. */
function landingRow(board: (Color | null)[], column: number) {
  for (let r = ROWS - 1; r >= 0; r--) if (!board[r * COLS + column]) return r;
  return -1;
}

export function c4LegalMoves(s: C4State): C4Move[] {
  if (s.phase !== 'play') return [];
  return Array.from({ length: COLS }, (_, column) => ({ column })).filter((m) => landingRow(s.board, m.column) >= 0);
}

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** Alignement d'au moins 4 passant par la case `idx`, ou null. */
function lineThrough(board: (Color | null)[], idx: number): number[] | null {
  const color = board[idx];
  if (!color) return null;
  const r0 = Math.floor(idx / COLS), c0 = idx % COLS;
  for (const [dr, dc] of DIRS) {
    const line = [idx];
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign, c = c0 + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === color) {
        line.push(r * COLS + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a - b);
  }
  return null;
}

export function c4Drop(state: C4State, column: number): { state: C4State; events: C4Event[] } {
  if (state.phase !== 'play') throw new RuleError('GAME_OVER', 'La partie est terminée');
  if (!Number.isInteger(column) || column < 0 || column >= COLS) throw new RuleError('BAD_COLUMN', 'Colonne invalide');
  const row = landingRow(state.board, column);
  if (row < 0) throw new RuleError('COLUMN_FULL', 'Cette colonne est pleine');
  const s: C4State = { ...state, board: [...state.board], out: [...state.out] };
  const color = c4Current(s);
  const idx = row * COLS + column;
  s.board[idx] = color;
  s.last = idx;
  s.seq++;
  const events: C4Event[] = [{ type: 'drop', color, column, row }];
  const line = lineThrough(s.board, idx);
  if (line) {
    s.phase = 'finished';
    s.winner = color;
    s.winLine = line;
    events.push({ type: 'win', color });
  } else if (s.board.every(Boolean)) {
    s.phase = 'finished';
    s.draw = true;
    events.push({ type: 'draw' });
  } else {
    s.turn = 1 - s.turn;
  }
  return { state: s, events };
}

/** Abandon ou déconnexion : l'autre joueur gagne. */
export function c4Eliminate(state: C4State, color: Color): { state: C4State; events: C4Event[] } {
  if (state.phase !== 'play') throw new RuleError('GAME_OVER', 'La partie est terminée');
  if (!state.colors.includes(color)) throw new RuleError('BAD_COLOR', 'Couleur absente de la partie');
  const other = state.colors.find((c) => c !== color)!;
  const s: C4State = { ...state, board: [...state.board], out: [...state.out, color], phase: 'finished', winner: other, seq: state.seq + 1 };
  return { state: s, events: [{ type: 'eliminated', color }, { type: 'win', color: other }] };
}

// ---------- robot ----------

/** Colonnes du centre vers les bords : meilleur ordre d'exploration et de départage. */
const ORDER = [3, 2, 4, 1, 5, 0, 6];

/** Grille numérique (0 vide, 1 joueur au trait, 2 adversaire) pour la recherche. */
type Grid = Int8Array;

function toGrid(s: C4State, me: Color): Grid {
  return Int8Array.from(s.board, (c) => (c === null ? 0 : c === me ? 1 : 2));
}

function gridLanding(g: Grid, column: number) {
  for (let r = ROWS - 1; r >= 0; r--) if (!g[r * COLS + column]) return r * COLS + column;
  return -1;
}

function gridWins(g: Grid, idx: number) {
  const who = g[idx];
  const r0 = Math.floor(idx / COLS), c0 = idx % COLS;
  for (const [dr, dc] of DIRS) {
    let n = 1;
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign, c = c0 + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && g[r * COLS + c] === who) {
        n++;
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (n >= 4) return true;
  }
  return false;
}

/** Colonne qui fait gagner `who` immédiatement, ou -1. */
function winningColumn(g: Grid, who: 1 | 2) {
  for (const c of ORDER) {
    const idx = gridLanding(g, c);
    if (idx < 0) continue;
    g[idx] = who;
    const win = gridWins(g, idx);
    g[idx] = 0;
    if (win) return c;
  }
  return -1;
}

/** Évaluation statique du point de vue du joueur 1 : fenêtres de 4 cases et contrôle du centre. */
function evaluate(g: Grid) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) if (g[r * COLS + 3] === 1) score += 3; else if (g[r * COLS + 3] === 2) score -= 3;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of DIRS) {
        const r3 = r + dr * 3, c3 = c + dc * 3;
        if (r3 < 0 || r3 >= ROWS || c3 < 0 || c3 >= COLS) continue;
        let mine = 0, theirs = 0;
        for (let k = 0; k < 4; k++) {
          const v = g[(r + dr * k) * COLS + c + dc * k];
          if (v === 1) mine++;
          else if (v === 2) theirs++;
        }
        if (mine && theirs) continue;
        if (mine === 3) score += 5;
        else if (mine === 2) score += 2;
        else if (theirs === 3) score -= 4;
        else if (theirs === 2) score -= 1;
      }
    }
  }
  return score;
}

const WIN_SCORE = 1_000_000;

/** Négamax alpha-bêta : score du point de vue du joueur 1 si `who` = 1. */
function negamax(g: Grid, depth: number, alpha: number, beta: number, who: 1 | 2): number {
  if (depth === 0) return who === 1 ? evaluate(g) : -evaluate(g);
  let any = false;
  for (const c of ORDER) {
    const idx = gridLanding(g, c);
    if (idx < 0) continue;
    any = true;
    g[idx] = who;
    // Gagner plus tôt vaut mieux : la profondeur restante s'ajoute au score.
    const v = gridWins(g, idx) ? WIN_SCORE + depth : -negamax(g, depth - 1, -beta, -alpha, who === 1 ? 2 : 1);
    g[idx] = 0;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return any ? alpha : 0; // grille pleine : nul
}

const SEARCH_DEPTH = 6;

/**
 * Colonne choisie par le robot :
 * - LOW : au hasard ;
 * - MEDIUM : gagne s'il le peut, sinon bloque, sinon évite d'offrir la victoire et préfère le centre ;
 * - HIGH : recherche négamax à 6 demi-coups. MEDIUM et HIGH sont déterministes.
 */
export function c4BotColumn(s: C4State, level: BotLevel = 'HIGH', rand: () => number = Math.random): number | null {
  const moves = c4LegalMoves(s);
  if (!moves.length) return null;
  if (level === 'LOW') return moves[Math.floor(rand() * moves.length)].column;
  const g = toGrid(s, c4Current(s));
  const win = winningColumn(g, 1);
  if (win >= 0) return win;
  const block = winningColumn(g, 2);
  if (block >= 0) return block;
  if (level === 'MEDIUM') {
    // Ne pas jouer sous une case qui offrirait la victoire à l'adversaire.
    const safe = ORDER.filter((c) => {
      const idx = gridLanding(g, c);
      if (idx < 0) return false;
      g[idx] = 1;
      const gift = winningColumn(g, 2) >= 0;
      g[idx] = 0;
      return !gift;
    });
    return safe[0] ?? ORDER.find((c) => gridLanding(g, c) >= 0)!;
  }
  let best = -1, bestScore = -Infinity;
  for (const c of ORDER) {
    const idx = gridLanding(g, c);
    if (idx < 0) continue;
    g[idx] = 1;
    const v = -negamax(g, SEARCH_DEPTH - 1, -Infinity, -bestScore, 2);
    g[idx] = 0;
    if (v > bestScore) {
      bestScore = v;
      best = c;
    }
  }
  return best;
}
