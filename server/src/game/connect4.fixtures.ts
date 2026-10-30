import { COLS } from './connect4.js';

/** Grille pleine sans aucun alignement (ligne 0 en haut), R = rouge, Y = jaune. */
export const DRAW_ROWS = ['RYYRRYY', 'YYRRYYR', 'RRYYRRY', 'YYRRYYR', 'RRYYRRY', 'RRYYRRY'];

/** Ordre de colonnes qui remplit DRAW_ROWS en alternant rouge puis jaune (recherche en profondeur). */
export function drawSequence(): number[] {
  const want = DRAW_ROWS.join('').split('').map((x) => (x === 'R' ? 'red' : 'yellow'));
  const height = Array(COLS).fill(0);
  const seq: number[] = [];
  const dfs = (n: number): boolean => {
    if (n === 42) return true;
    const color = n % 2 === 0 ? 'red' : 'yellow';
    for (let c = 0; c < COLS; c++) {
      if (height[c] === 6) continue;
      const row = 5 - height[c];
      if (want[row * COLS + c] !== color) continue;
      height[c]++;
      seq.push(c);
      if (dfs(n + 1)) return true;
      height[c]--;
      seq.pop();
    }
    return false;
  };
  if (!dfs(0)) throw new Error('pas de séquence');
  return seq;
}
