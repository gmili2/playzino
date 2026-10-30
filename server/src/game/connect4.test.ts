import { describe, expect, it } from 'vitest';
import { c4BotColumn, c4Drop, c4Eliminate, c4LegalMoves, COLS, createConnect4, type C4State } from './connect4.js';
import { drawSequence } from './connect4.fixtures.js';

const fresh = () => createConnect4(['red', 'yellow']);

/** Joue une suite de colonnes en alternant les joueurs. */
function play(cols: number[], s = fresh()) {
  for (const c of cols) s = c4Drop(s, c).state;
  return s;
}

describe('Puissance 4 : règles', () => {
  it('le jeton tombe au plus bas et les joueurs alternent', () => {
    const r = c4Drop(fresh(), 3);
    expect(r.events).toEqual([{ type: 'drop', color: 'red', column: 3, row: 5 }]);
    expect(r.state.board[5 * COLS + 3]).toBe('red');
    expect(r.state.turn).toBe(1);
    const s = c4Drop(r.state, 3).state;
    expect(s.board[4 * COLS + 3]).toBe('yellow');
    expect(s.seq).toBe(2);
  });

  it('victoire verticale, horizontale et dans les deux diagonales', () => {
    const vertical = play([0, 1, 0, 1, 0, 1, 0]);
    expect(vertical).toMatchObject({ phase: 'finished', winner: 'red' });
    expect(vertical.winLine).toHaveLength(4);

    expect(play([0, 0, 1, 1, 2, 2, 3])).toMatchObject({ phase: 'finished', winner: 'red' });
    // Diagonale montante (rouge en 0,1,2,3 à des hauteurs croissantes).
    expect(play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3])).toMatchObject({ phase: 'finished', winner: 'red' });
    // Diagonale descendante.
    expect(play([6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3])).toMatchObject({ phase: 'finished', winner: 'red' });
  });

  it('refuse une colonne pleine, une colonne invalide et tout coup après la fin', () => {
    const full = play([0, 0, 0, 0, 0, 0]);
    expect(c4LegalMoves(full).map((m) => m.column)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => c4Drop(full, 0)).toThrow(expect.objectContaining({ code: 'COLUMN_FULL' }));
    expect(() => c4Drop(fresh(), 7)).toThrow(expect.objectContaining({ code: 'BAD_COLUMN' }));
    const over = play([0, 1, 0, 1, 0, 1, 0]);
    expect(() => c4Drop(over, 2)).toThrow(expect.objectContaining({ code: 'GAME_OVER' }));
    expect(c4LegalMoves(over)).toEqual([]);
  });

  it('grille pleine sans alignement : match nul', () => {
    const s = play(drawSequence());
    expect(s).toMatchObject({ phase: 'finished', winner: null, draw: true });
  });

  it('abandon : l’adversaire gagne', () => {
    const r = c4Eliminate(play([3]), 'yellow');
    expect(r.state).toMatchObject({ phase: 'finished', winner: 'red', out: ['yellow'] });
  });
});

describe('Puissance 4 : robot', () => {
  it('moyen et haut gagnent quand ils le peuvent, sinon bloquent', () => {
    const canWin = play([0, 6, 0, 6, 0, 5]); // rouge a 3 jetons en colonne 0
    expect(c4BotColumn(canWin, 'MEDIUM')).toBe(0);
    expect(c4BotColumn(canWin, 'HIGH')).toBe(0);
    const mustBlock = play([0, 6, 0, 6, 0]); // jaune doit bloquer la colonne 0
    expect(c4BotColumn(mustBlock, 'MEDIUM')).toBe(0);
    expect(c4BotColumn(mustBlock, 'HIGH')).toBe(0);
  });

  it('bas : colonne légale au hasard', () => {
    const s = play([0, 0, 0, 0, 0, 0]);
    expect(c4BotColumn(s, 'LOW', () => 0)).toBe(1);
    expect(c4BotColumn(s, 'LOW', () => 0.999)).toBe(6);
  });

  it('le niveau haut bat le niveau bas', () => {
    let x = 7;
    const rand = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let game = 0; game < 6; game++) {
      const high = game % 2 === 0 ? 'red' : 'yellow';
      let s: C4State = fresh();
      while (s.phase === 'play') s = c4Drop(s, c4BotColumn(s, s.colors[s.turn] === high ? 'HIGH' : 'LOW', rand)!).state;
      expect(s.winner).toBe(high);
    }
  });

  it('toujours un coup légal, jusqu’à la fin, à tous les niveaux', () => {
    for (const level of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      let s = fresh();
      while (s.phase === 'play') {
        const col = c4BotColumn(s, level)!;
        expect(c4LegalMoves(s).some((m) => m.column === col)).toBe(true);
        s = c4Drop(s, col).state;
      }
      expect(s.phase).toBe('finished');
    }
  });
});
