import { useState, type CSSProperties } from 'react';
import type { Color } from '../lib/types';

/** Plateau Puissance 4 : 7 colonnes × 6 lignes (ligne 0 en haut), une rangée d'aperçu au-dessus pour viser. */

export const C4_ROWS = 6;
export const C4_COLS = 7;

const TOKEN: Record<string, { fill: string; deep: string; name: string }> = {
  red: { fill: '#E5484D', deep: '#A3262B', name: 'أحمر' },
  yellow: { fill: '#F5C21B', deep: '#A67700', name: 'أصفر' }
};

const token = (color: Color): CSSProperties => ({
  position: 'absolute', inset: '8%', borderRadius: '50%',
  background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.55), rgba(255,255,255,0) 45%), ${TOKEN[color]?.fill ?? '#999'}`,
  boxShadow: `inset 0 0 0 0.9cqw ${TOKEN[color]?.deep ?? '#555'}, inset 0 -0.8cqw 0 rgba(0,0,0,0.18), 0 0.4cqw 0.8cqw rgba(0,0,0,0.35)`
});

const EMPTY_BOARD: (Color | null)[] = Array(C4_ROWS * C4_COLS).fill(null);

export function Connect4Board({
  board = EMPTY_BOARD, last = null, winLine = null, playable = [], myColor, onDrop, label = 'لوحة أربعة على التوالي'
}: {
  board?: (Color | null)[];
  last?: number | null;
  winLine?: number[] | null;
  /** Colonnes jouables maintenant par ce joueur (vide = pas son tour). */
  playable?: number[];
  myColor?: Color;
  onDrop?: (column: number) => void;
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const canPlay = !!onDrop && playable.length > 0;
  const aim = canPlay && hover !== null && playable.includes(hover) ? hover : null;
  const win = new Set(winLine ?? []);
  const cellPct = 100 / C4_COLS;

  return (
    <div role="group" dir="ltr" aria-label={label} style={{ width: '100%', aspectRatio: '1 / 1', containerType: 'inline-size', position: 'relative' }} onMouseLeave={() => setHover(null)}>
      {/* Rangée d'aperçu : le jeton du joueur au-dessus de la colonne visée. */}
      <div style={{ position: 'absolute', left: '3%', right: '3%', top: 0, height: `${(94 / C4_COLS)}%` }}>
        {aim !== null && myColor && (
          <div style={{ position: 'absolute', left: `${aim * cellPct}%`, width: `${cellPct}%`, height: '100%', transition: 'left .12s ease' }}>
            <span className="pc-pulse" style={token(myColor)} />
          </div>
        )}
      </div>
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, top: `${94 / C4_COLS}%`, padding: '3%', boxSizing: 'border-box', borderRadius: '4cqw',
          background: 'linear-gradient(180deg, #2F6BFF, #1A3FB0)', boxShadow: 'inset 0 0.6cqw 0 rgba(255,255,255,0.25), inset 0 -1cqw 0 rgba(0,0,0,0.25), 0 3cqw 6cqw rgba(0,0,0,0.45)'
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'grid', gridTemplateColumns: `repeat(${C4_COLS}, 1fr)`, gridTemplateRows: `repeat(${C4_ROWS}, 1fr)` }}>
          {board.map((cell, idx) => {
            const row = Math.floor(idx / C4_COLS);
            const col = idx % C4_COLS;
            const isLast = idx === last;
            return (
              <div key={idx} style={{ position: 'relative', background: aim === col ? 'rgba(255,255,255,0.08)' : undefined }}>
                <span style={{ position: 'absolute', inset: '8%', borderRadius: '50%', background: '#0B0C24', boxShadow: 'inset 0 0.8cqw 1.2cqw rgba(0,0,0,0.65), 0 0 0 0.35cqw rgba(0,0,0,0.18)' }} />
                {cell && (
                  <span
                    key={isLast ? 'last' + idx : idx}
                    className={isLast ? 'c4-drop' : undefined}
                    style={{ ...token(cell), ['--c4-from' as string]: `${-(row + 1.6) * 119}%`, zIndex: isLast ? 2 : 1 }}
                  />
                )}
                {win.has(idx) && (
                  <span className="pc-pulse" style={{ position: 'absolute', inset: '2%', borderRadius: '50%', boxShadow: '0 0 0 0.7cqw #FFFFFF, 0 0 2.5cqw 0.6cqw rgba(255,255,255,0.8)', zIndex: 3, pointerEvents: 'none' }} />
                )}
              </div>
            );
          })}
          {canPlay && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${C4_COLS}, 1fr)`, zIndex: 4 }}>
              {Array.from({ length: C4_COLS }, (_, col) => {
                const ok = playable.includes(col);
                return (
                  <button
                    key={col}
                    type="button"
                    data-testid={`c4-col-${col}`}
                    aria-label={`العمود ${col + 1}${ok ? '' : ' (ممتلئ)'}`}
                    disabled={!ok}
                    onMouseEnter={() => setHover(col)}
                    onFocus={() => setHover(col)}
                    onClick={() => onDrop!(col)}
                    style={{ border: 0, padding: 0, background: 'transparent', cursor: ok ? 'pointer' : 'not-allowed', borderRadius: '2cqw' }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Position d'exposition pour l'accueil (plateau décoratif). */
export const SHOWCASE_C4: (Color | null)[] = (() => {
  const b: (Color | null)[] = Array(C4_ROWS * C4_COLS).fill(null);
  const put = (r: number, c: number, color: Color) => (b[r * C4_COLS + c] = color);
  [[5, 3, 'red'], [5, 2, 'yellow'], [4, 3, 'red'], [5, 4, 'yellow'], [3, 3, 'red'], [4, 2, 'yellow'], [5, 1, 'red'], [4, 4, 'yellow'], [3, 2, 'red'], [5, 5, 'yellow']]
    .forEach(([r, c, color]) => put(r as number, c as number, color as Color));
  return b;
})();
