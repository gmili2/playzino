import type { GameType } from '@prisma/client';
import {
  c4Active, c4BotColumn, c4Current, c4Drop, c4Eliminate, c4LegalMoves, createConnect4, type C4Event, type C4State
} from './connect4.js';
import { c4BotColumnAsync } from './c4bot.js';
import {
  activeColors, applyMove, applyRoll, autoMovePawn, botChooseMove, createGame, currentColor, eliminate, legalMoves, RuleError, turnOrder,
  type BotLevel, type Color, type GameEvent, type GameState
} from './engine.js';

/**
 * Interface commune des jeux de la plateforme : le gestionnaire de parties (tour, minuterie, robots,
 * reconnexion, mises) ne connaît que ces fonctions, chaque jeu fournit ses règles.
 */

export type AnyState = GameState | C4State;
export type AnyEvent = GameEvent | C4Event;
export type Action = { type: 'roll' } | { type: 'move'; pawn: number } | { type: 'drop'; column: number };
export interface Step { state: AnyState; events: AnyEvent[] }

export interface GameRules {
  /** Couleur de chaque siège, dans l'ordre d'arrivée à la table. */
  seatColors: Color[];
  minPlayers: number;
  maxPlayers: number;
  create(colors: Color[], firstTurn: number): AnyState;
  current(s: AnyState): Color;
  active(s: AnyState): Color[];
  legalMoves(s: AnyState): unknown[];
  apply(s: AnyState, action: Action, rollDie: () => number): Step;
  eliminate(s: AnyState, color: Color): Step;
  /** Une action du robot (validée par les mêmes règles qu'un humain). */
  bot(s: AnyState, level: BotLevel, rollDie: () => number): Step;
  /** Variante asynchrone du coup de robot (calcul long hors du fil principal), utilisée si elle existe. */
  botAsync?(s: AnyState, level: BotLevel, rollDie: () => number): Promise<Step>;
  /** Temps écoulé : le serveur joue tout le tour à la place du joueur (null si rien à jouer). */
  auto(s: AnyState, rollDie: () => number): Step | null;
}

const unsupported = () => {
  throw new RuleError('BAD_ACTION', 'Action impossible dans ce jeu');
};

const parcheesi: GameRules = {
  // À deux, couleurs face à face (bleu en bas à gauche, vert en haut à droite).
  seatColors: ['blue', 'green', 'yellow', 'red'],
  minPlayers: 2,
  maxPlayers: 4,
  create(colors, firstTurn) {
    const s = createGame(turnOrder(colors));
    s.turn = firstTurn;
    return s;
  },
  current: (s) => currentColor(s as GameState),
  active: (s) => activeColors(s as GameState),
  legalMoves: (s) => legalMoves(s as GameState),
  apply(s, a, rollDie) {
    if (a.type === 'roll') return applyRoll(s as GameState, rollDie());
    if (a.type === 'move') return applyMove(s as GameState, a.pawn);
    return unsupported();
  },
  eliminate: (s, color) => eliminate(s as GameState, color),
  bot(s, level, rollDie) {
    const st = s as GameState;
    return st.phase === 'roll' ? applyRoll(st, rollDie()) : applyMove(st, botChooseMove(st, level)!);
  },
  auto(s, rollDie) {
    let state = s as GameState;
    const color = currentColor(state);
    const events: GameEvent[] = [];
    const start = state.seq;
    if (state.phase === 'roll') {
      const r = applyRoll(state, rollDie());
      state = r.state;
      events.push(...r.events);
    }
    while ((state.phase === 'move' || state.phase === 'bonus') && currentColor(state) === color) {
      const r = applyMove(state, autoMovePawn(state)!);
      state = r.state;
      events.push(...r.events);
    }
    return state.seq === start ? null : { state, events };
  }
};

const connect4: GameRules = {
  seatColors: ['red', 'yellow'],
  minPlayers: 2,
  maxPlayers: 2,
  create(colors, firstTurn) {
    const s = createConnect4(colors);
    s.turn = firstTurn;
    return s;
  },
  current: (s) => c4Current(s as C4State),
  active: (s) => c4Active(s as C4State),
  legalMoves: (s) => c4LegalMoves(s as C4State),
  apply: (s, a) => (a.type === 'drop' ? c4Drop(s as C4State, a.column) : unsupported()),
  eliminate: (s, color) => c4Eliminate(s as C4State, color),
  bot: (s, level) => c4Drop(s as C4State, c4BotColumn(s as C4State, level)!),
  botAsync: async (s, level) => c4Drop(s as C4State, (await c4BotColumnAsync(s as C4State, level))!),
  // Temps écoulé : coup prudent (gagner, bloquer, sinon centre).
  auto: (s) => (s.phase === 'finished' ? null : c4Drop(s as C4State, c4BotColumn(s as C4State, 'MEDIUM')!))
};

export const GAME_RULES: Record<GameType, GameRules> = { PARCHEESI: parcheesi, CONNECT4: connect4 };
