import type { CSSProperties } from 'react';
import type { Color } from '../lib/types';

/** Plateau Parcheesi — portage fidèle du composant « Board » du design (grille 19×19, piste de 68 cases). */

const PAL: Record<Color, { name: string; fill: string; deep: string; tint: string; start: number; nest: [number, number]; home: (k: number) => [number, number] }> = {
  red: { name: 'الأحمر', fill: '#E5484D', deep: '#A3262B', tint: '#F6C9CB', start: 4, nest: [0, 0], home: (k) => [9, k] },
  yellow: { name: 'الأصفر', fill: '#F5C21B', deep: '#A67700', tint: '#FBE7A6', start: 21, nest: [0, 11], home: (k) => [k, 9] },
  green: { name: 'الأخضر', fill: '#1FB57A', deep: '#0C7149', tint: '#BDEBD7', start: 38, nest: [11, 11], home: (k) => [9, 18 - k] },
  blue: { name: 'الأزرق', fill: '#2F6BFF', deep: '#1A3FB0', tint: '#CAD9FF', start: 55, nest: [11, 0], home: (k) => [18 - k, 9] }
};
const COLORS = Object.keys(PAL) as Color[];
const SAFE = [4, 11, 16, 21, 28, 33, 38, 45, 50, 55, 62, 67];
const P = 100 / 19;

function trackCoord(i: number): [number, number] {
  i = ((i % 68) + 68) % 68;
  if (i <= 7) return [7 - i, 8];
  if (i === 8) return [0, 9];
  if (i <= 16) return [i - 9, 10];
  if (i <= 24) return [8, i - 6];
  if (i === 25) return [9, 18];
  if (i <= 33) return [10, 44 - i];
  if (i <= 41) return [i - 23, 10];
  if (i === 42) return [18, 9];
  if (i <= 50) return [61 - i, 8];
  if (i <= 58) return [10, 58 - i];
  if (i === 59) return [9, 0];
  return [8, i - 60];
}

function center(color: Color, p: number, slot: number) {
  const C = PAL[color];
  if (p < 0) {
    const [nr, nc] = C.nest;
    return { r: nr + 2.5 + (slot >= 2 ? 3 : 0), c: nc + 2.5 + (slot % 2 ? 3 : 0), size: 1.3, key: 'n' + color + slot };
  }
  if (p >= 63) {
    const off = [-0.66, -0.22, 0.22, 0.66][slot % 4];
    const base = { yellow: [8.6, 9.5], green: [9.5, 10.4], blue: [10.4, 9.5], red: [9.5, 8.6] }[color];
    const vertical = color === 'yellow' || color === 'blue';
    return { r: base[0] + (vertical ? 0 : off), c: base[1] + (vertical ? off : 0), size: 0.48, key: 'h' + color + slot };
  }
  const rc = p <= 55 ? trackCoord(C.start + p) : C.home(p - 55);
  return { r: rc[0] + 0.5, c: rc[1] + 0.5, size: 0.84, key: rc[0] + '-' + rc[1] };
}

const pos = (r: number, c: number, w: number, h: number): CSSProperties => ({
  position: 'absolute', left: `${c * P}%`, top: `${r * P}%`, width: `${w * P}%`, height: `${h * P}%`, boxSizing: 'border-box'
});

const cellBase: CSSProperties = { border: '1px solid #0F1030', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' };

// La partie statique du plateau est calculée une seule fois.
const startOf: Record<number, Color> = {};
COLORS.forEach((k) => (startOf[PAL[k].start] = k));
const TRACK_CELLS = Array.from({ length: 68 }, (_, i) => {
  const [r, c] = trackCoord(i);
  const sc = startOf[i];
  const safe = SAFE.includes(i);
  return { i, r, c, sc, safe };
});

export interface BoardPawn {
  color: Color;
  p: number;
  slot: number;
  movable?: boolean;
  onPick?: () => void;
}

export interface BoardTarget {
  color: Color;
  p: number;
  slot?: number;
}

export function Board({ pawns, targets = [], label = 'لوحة البارتشيزي' }: { pawns: BoardPawn[]; targets?: BoardTarget[]; label?: string }) {
  const groups: Record<string, number> = {};
  const placed = pawns.map((pw) => {
    const ctr = center(pw.color, pw.p, pw.slot);
    groups[ctr.key] = (groups[ctr.key] || 0) + 1;
    return { pw, ctr };
  });
  const seen: Record<string, number> = {};

  return (
    <div
      role="group"
      dir="ltr"
      aria-label={label}
      style={{
        width: '100%', aspectRatio: '1 / 1', boxSizing: 'border-box', padding: '2.4%', borderRadius: 22, background: '#0F1030',
        boxShadow: 'inset 0 0 0 1px rgba(140,130,255,0.30), 0 0 0 4px rgba(108,71,255,0.18), 0 30px 60px rgba(0,0,0,0.5)', color: '#F2F5FB'
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {COLORS.map((k) => {
          const [r, c] = PAL[k].nest;
          return (
            <div key={'nest' + k} style={{ ...pos(r + 0.12, c + 0.12, 7.76, 7.76), background: PAL[k].fill, borderRadius: '12%', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2), inset 0 -5px 0 rgba(0,0,0,0.14)' }}>
              <div style={{ position: 'absolute', left: '11.5%', top: '11.5%', width: '77%', height: '77%', borderRadius: '20%', background: 'rgba(255,255,255,0.92)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.16)' }} />
            </div>
          );
        })}
        {COLORS.flatMap((k) =>
          [0, 1, 2, 3].map((s) => {
            const ctr = center(k, -1, s);
            return <div key={'sock' + k + s} style={{ ...pos(ctr.r - 0.8, ctr.c - 0.8, 1.6, 1.6), borderRadius: '50%', background: PAL[k].tint, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.18)' }} />;
          })
        )}
        {TRACK_CELLS.map(({ i, r, c, sc, safe }) => (
          <div key={'t' + i} style={{ ...pos(r, c, 1, 1), ...cellBase, background: sc ? PAL[sc].fill : '#EEF2FA' }}>
            {sc ? (
              <span style={{ width: '36%', height: '36%', borderRadius: '50%', background: 'rgba(255,255,255,0.92)', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
            ) : safe ? (
              <span style={{ width: '46%', height: '46%', borderRadius: '50%', boxSizing: 'border-box', border: '2px solid #A3B1CC' }} />
            ) : null}
          </div>
        ))}
        {COLORS.flatMap((k) =>
          [1, 2, 3, 4, 5, 6, 7].map((j) => {
            const [r, c] = PAL[k].home(j);
            return <div key={'h' + k + j} style={{ ...pos(r, c, 1, 1), ...cellBase, background: PAL[k].fill, opacity: 0.62 + j * 0.054 }} />;
          })
        )}
        <div
          style={{
            ...pos(8, 8, 3, 3), background: 'conic-gradient(from -45deg, #F5C21B 0 25%, #1FB57A 0 50%, #2F6BFF 0 75%, #E5484D 0 100%)',
            border: '1px solid #0B1326', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div style={{ width: '38%', height: '38%', borderRadius: '50%', background: '#0B1326', boxShadow: '0 0 0 3px rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" style={{ width: '58%', height: '58%' }} aria-hidden="true"><path d="M12 3 21 12 12 21 3 12Z" fill="#F2F5FB" /></svg>
          </div>
        </div>
        {targets.map((t, idx) => {
          const ctr = center(t.color, t.p, t.slot || 0);
          const s = 0.86;
          return (
            <div
              key={'tg' + idx}
              style={{
                position: 'absolute', left: `${(ctr.c - s / 2) * P}%`, top: `${(ctr.r - s / 2) * P}%`, width: `${s * P}%`, height: `${s * P}%`,
                boxSizing: 'border-box', borderRadius: '50%', border: '2px dashed #31D8F5', background: 'rgba(49,216,245,0.18)', zIndex: 4, pointerEvents: 'none'
              }}
            />
          );
        })}
        {placed.map(({ pw, ctr }) => {
          const C = PAL[pw.color];
          let { r, c, size } = ctr;
          if (groups[ctr.key] > 1) {
            const n = (seen[ctr.key] = (seen[ctr.key] || 0) + 1);
            const d = n === 1 ? -0.18 : 0.18;
            r += d;
            c += d;
            size *= 0.74;
          }
          const mv = !!pw.movable;
          const where = pw.p < 0 ? 'في البيت' : pw.p >= 63 ? 'وصل' : pw.p > 55 ? 'في الممر الأخير' : 'الخانة ' + pw.p;
          return (
            <button
              key={pw.color + pw.slot}
              type="button"
              data-testid={`pawn-${pw.color}-${pw.slot}`}
              aria-label={'البيدق ' + C.name + ' ' + (pw.slot + 1) + '، ' + where + (mv ? ' — يمكن تحريكه' : '')}
              disabled={!(mv && pw.onPick)}
              onClick={pw.onPick}
              style={{
                position: 'absolute', left: `${(c - size / 2) * P}%`, top: `${(r - size / 2) * P}%`, width: `${size * P}%`, height: `${size * P}%`,
                padding: 0, border: 0, background: 'transparent', borderRadius: '50%', transition: 'left .16s ease, top .16s ease, transform .2s ease',
                zIndex: mv ? 6 : 3, cursor: mv && pw.onPick ? 'pointer' : 'default', transform: mv ? 'scale(1.1)' : undefined
              }}
            >
              <span
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: '50%',
                  background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.6), rgba(255,255,255,0) 44%), ${C.fill}`,
                  boxShadow: `0 2px 0 ${C.deep}, 0 5px 10px rgba(0,0,0,0.38), inset 0 0 0 1.5px rgba(255,255,255,0.5)` + (mv ? ', 0 0 0 3px #FFFFFF, 0 0 0 6px rgba(49,216,245,0.65), 0 0 20px rgba(49,216,245,0.75)' : '')
                }}
              >
                <span style={{ width: '40%', height: '40%', borderRadius: '50%', background: 'rgba(255,255,255,0.38)', boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.25)' }} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Position d'exposition pour l'accueil (plateau décoratif, aucune donnée de partie). */
export const SHOWCASE_PAWNS: BoardPawn[] = (
  [['blue', [-1, -1, 12, 40]], ['yellow', [-1, 5, 30, 63]], ['red', [-1, -1, -1, 18]], ['green', [-1, -1, 26, -1]]] as [Color, number[]][]
).flatMap(([color, arr]) => arr.map((p, slot) => ({ color, p, slot })));
