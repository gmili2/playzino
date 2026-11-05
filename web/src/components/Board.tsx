import type { CSSProperties } from 'react';
import type { Color } from '../lib/types';

/**
 * Plateau Parchís classique : camps d'un tiers du plateau, bras de 3 couloirs aux cases allongées et numérotées,
 * cases sûres grises, triangles d'arrivée au centre. Les positions restent celles de la grille logique 19×19
 * (piste de 68 cases) ; seule l'échelle est non uniforme (8 unités par camp, 3 unités par bras).
 */

// Disposition du Parchís classique : jaune en haut à gauche, vert en haut à droite, bleu en bas à gauche,
// rouge en bas à droite ; chaque couloir final part de la case d'extrémité du bras de sa couleur.
const PAL: Record<Color, { name: string; fill: string; deep: string; tint: string; start: number; nest: [number, number]; home: (k: number) => [number, number] }> = {
  yellow: { name: 'الأصفر', fill: '#F5C21B', deep: '#A67700', tint: '#FBE7A6', start: 4, nest: [0, 0], home: (k) => [k, 9] },
  blue: { name: 'الأزرق', fill: '#2F6BFF', deep: '#1A3FB0', tint: '#CAD9FF', start: 21, nest: [11, 0], home: (k) => [9, k] },
  red: { name: 'الأحمر', fill: '#E5484D', deep: '#A3262B', tint: '#F6C9CB', start: 38, nest: [11, 11], home: (k) => [18 - k, 9] },
  green: { name: 'الأخضر', fill: '#1FB57A', deep: '#0C7149', tint: '#BDEBD7', start: 55, nest: [0, 11], home: (k) => [9, 18 - k] }
};
const COLORS = Object.keys(PAL) as Color[];
// Cases sûres (numéros 5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68) : départs colorés, les autres en gris.
const SAFE = [4, 11, 16, 21, 28, 33, 38, 45, 50, 55, 62, 67];
const LINE = '#7D8597';
/** Dernière position sur la piste (couloir final ensuite, arrivée au centre à GOAL), comme le moteur. */
const LAST_TRACK = 63;
const GOAL = 71;

/** Unité de grille (0‥19) → pourcentage du plateau : camp = 8 unités sur un tiers, bras = 3 unités sur un tiers. */
const T = 100 / 3;
const G = (g: number) => (g <= 8 ? (g * T) / 8 : g <= 11 ? T + ((g - 8) * T) / 3 : 2 * T + ((g - 11) * T) / 8);
/** Case d'un bras vertical (colonnes 8‥10 hors centre) : allongée horizontalement. */
const wide = (r: number, c: number) => c >= 8 && c < 11 && !(r >= 8 && r < 11);

/**
 * Case i (numéro affiché i + 1) → (ligne, colonne). Sens antihoraire : 1 en haut du bras du haut, on descend,
 * puis le bras gauche vers la gauche, le bras du bas vers le bas, etc. ; 17, 34, 51 et 68 sont les cases
 * d'extrémité, d'où partent les couloirs bleu, rouge, vert et jaune.
 */
function trackCoord(i: number): [number, number] {
  i = ((i % 68) + 68) % 68;
  if (i <= 7) return [i, 8];
  if (i <= 15) return [8, 15 - i];
  if (i === 16) return [9, 0];
  if (i <= 24) return [10, i - 17];
  if (i <= 32) return [i - 14, 8];
  if (i === 33) return [18, 9];
  if (i <= 41) return [52 - i, 10];
  if (i <= 49) return [10, i - 31];
  if (i === 50) return [9, 18];
  if (i <= 58) return [8, 69 - i];
  if (i <= 66) return [66 - i, 10];
  return [0, 9];
}

/** Centre (en unités de grille), diamètre (en % du plateau) et case d'un pion. */
function center(color: Color, p: number, slot: number) {
  const C = PAL[color];
  if (p < 0) {
    const [nr, nc] = C.nest;
    return { r: nr + 2.6 + (slot >= 2 ? 2.8 : 0), c: nc + 2.6 + (slot % 2 ? 2.8 : 0), size: 6.2, key: 'n' + color + slot, wide: false };
  }
  if (p >= GOAL) {
    const off = [-0.75, -0.25, 0.25, 0.75][slot % 4];
    const base = { yellow: [8.55, 9.5], green: [9.5, 10.45], red: [10.45, 9.5], blue: [9.5, 8.55] }[color];
    const vertical = color === 'yellow' || color === 'red';
    return { r: base[0] + (vertical ? 0 : off), c: base[1] + (vertical ? off : 0), size: 3.6, key: 'h' + color + slot, wide: false };
  }
  const [r, c] = p <= LAST_TRACK ? trackCoord(C.start + p) : C.home(p - LAST_TRACK);
  return { r: r + 0.5, c: c + 0.5, size: 4.5, key: r + '-' + c, wide: wide(r, c) };
}

const rect = (r: number, c: number, h = 1, w = 1): CSSProperties => ({
  position: 'absolute', left: `${G(c)}%`, top: `${G(r)}%`, width: `${G(c + w) - G(c)}%`, height: `${G(r + h) - G(r)}%`, boxSizing: 'border-box'
});

/**
 * Rotation du plateau (quarts de tour dans le sens horaire) pour que chaque joueur voie son camp en bas à gauche.
 * On fait tourner les coordonnées de grille, pas l'image : numéros et noms restent à l'endroit.
 */
export type Quarter = 0 | 1 | 2 | 3;
/** Couleur du joueur → rotation qui amène son camp en bas à gauche (place du bleu sur le plateau classique). */
export const QUARTER_FOR: Record<Color, Quarter> = { blue: 0, red: 1, green: 2, yellow: 3 };
const N = 19;
/** Point de grille (ligne, colonne) après q quarts de tour horaires. */
function rotPt(r: number, c: number, q: Quarter): [number, number] {
  for (let k = 0; k < q; k++) [r, c] = [c, N - r];
  return [r, c];
}
/** Rectangle de grille après rotation (coins tournés, puis remis en ordre). */
function rotRect(r: number, c: number, h: number, w: number, q: Quarter): [number, number, number, number] {
  const [r1, c1] = rotPt(r, c, q);
  const [r2, c2] = rotPt(r + h, c + w, q);
  return [Math.min(r1, r2), Math.min(c1, c2), Math.abs(r2 - r1), Math.abs(c2 - c1)];
}

const cellBase: CSSProperties = { border: `0.5px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center' };

// La partie statique du plateau est calculée une seule fois.
const startOf: Record<number, Color> = {};
COLORS.forEach((k) => (startOf[PAL[k].start] = k));
const TRACK_CELLS = Array.from({ length: 68 }, (_, i) => {
  const [r, c] = trackCoord(i);
  return { i, r, c, sc: startOf[i], safe: SAFE.includes(i) };
});

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]]
};

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

export function Board({
  pawns, targets = [], label = 'لوحة البارتشيزي', names = {}, turn = null, die = null, quarter = 0
}: {
  pawns: BoardPawn[];
  targets?: BoardTarget[];
  label?: string;
  /** Nom affiché dans le camp de chaque couleur. */
  names?: Partial<Record<Color, string>>;
  /** Couleur qui a la main : son camp est mis en avant et reçoit le dé. */
  turn?: Color | null;
  die?: number | null;
  /** Rotation d'affichage (voir QUARTER_FOR) : 0 = disposition classique, bleu en bas à gauche. */
  quarter?: Quarter;
}) {
  const q = quarter;
  const R = (r: number, c: number, h = 1, w = 1) => rect(...rotRect(r, c, h, w, q));
  /** Centre à l'écran : point tourné ; au quart de tour, une case allongée change de sens. */
  const at = (ctr: { r: number; c: number; wide: boolean }) => {
    const [r, c] = rotPt(ctr.r, ctr.c, q);
    return { r, c, wide: q % 2 ? !ctr.wide : ctr.wide };
  };
  const groups: Record<string, number> = {};
  const placed = pawns.map((pw) => {
    const raw = center(pw.color, pw.p, pw.slot);
    const ctr = { ...raw, ...at(raw) };
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
        width: '100%', aspectRatio: '1 / 1', boxSizing: 'border-box', padding: '1.8%', borderRadius: 22, background: 'linear-gradient(160deg, #2A2350, #15122E)',
        boxShadow: 'inset 0 0 0 1px rgba(255,200,61,0.35), 0 0 0 4px rgba(139,92,246,0.18), 0 30px 60px rgba(0,0,0,0.5)'
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%', containerType: 'inline-size', background: '#FFFFFF', borderRadius: 10, overflow: 'hidden', boxShadow: `0 0 0 1px ${LINE}`, color: '#3B4252' }}>
        {COLORS.map((k) => {
          const C = PAL[k];
          // Position du camp à l'écran (après rotation) : nom sur le bord extérieur, dé dans le coin intérieur.
          const [r, c] = rotRect(C.nest[0], C.nest[1], 8, 8, q);
          const top = r === 0;
          const active = turn === k;
          return (
            <div key={'nest' + k} style={{ ...rect(r, c, 8, 8), border: `0.5px solid ${LINE}`, background: `radial-gradient(circle at 50% 50%, ${C.fill} 0 55%, ${C.deep} 140%)` }}>
              <div style={{ position: 'absolute', left: '16%', top: '16%', width: '68%', height: '68%', borderRadius: '50%', background: 'rgba(255,255,255,0.16)', boxShadow: 'inset 0 3px 10px rgba(0,0,0,0.22), 0 0 0 2px rgba(255,255,255,0.35)' }} />
              {names[k] && (
                <div
                  style={{
                    position: 'absolute', left: '50%', transform: 'translateX(-50%)', [top ? 'top' : 'bottom']: '3.5%', maxWidth: '86%', padding: '0.4cqw 2cqw',
                    borderRadius: 999, background: active ? '#FFFFFF' : 'rgba(0,0,0,0.28)', color: active ? C.deep : '#FFFFFF',
                    fontSize: '2.3cqw', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    boxShadow: active ? `0 0 0 2px ${C.deep}, 0 0 14px rgba(255,255,255,0.8)` : 'none'
                  }}
                >
                  {names[k]}
                </div>
              )}
              {active && (
                <div className="pc-pulse" style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 0.6cqw rgba(255,255,255,0.85)', pointerEvents: 'none' }} />
              )}
              {active && die && (
                <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: 'absolute', width: '20%', height: '20%', [c === 0 ? 'right' : 'left']: '5%', [top ? 'bottom' : 'top']: '5%', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}>
                  <rect x="4" y="4" width="92" height="92" rx="20" fill="#FFFFFF" stroke="#C3CDE0" strokeWidth="4" />
                  {(PIPS[die] ?? []).map(([x, y], n) => <circle key={n} cx={x} cy={y} r="9" fill="#0B1326" />)}
                </svg>
              )}
            </div>
          );
        })}
        {COLORS.flatMap((k) =>
          [0, 1, 2, 3].map((s) => {
            const ctr = at(center(k, -1, s));
            return (
              <div
                key={'sock' + k + s}
                style={{ position: 'absolute', left: `${G(ctr.c) - 3.3}%`, top: `${G(ctr.r) - 3.3}%`, width: '6.6%', height: '6.6%', borderRadius: '50%', background: 'rgba(0,0,0,0.16)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.25)' }}
              />
            );
          })
        )}
        {TRACK_CELLS.map(({ i, r, c, sc, safe }) => (
          <div
            key={'t' + i}
            style={{ ...R(r, c), ...cellBase, background: sc ? PAL[sc].tint : safe ? '#CDD2DB' : '#FFFFFF', fontSize: '1.65cqw', fontWeight: 600, color: sc ? PAL[sc].deep : '#5B6475' }}
          >
            {sc ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: '2.6cqw', height: '2.6cqw' }}><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6Z" fill={PAL[sc].fill} stroke={PAL[sc].deep} strokeWidth="1.2" /></svg>
            ) : (
              i + 1
            )}
          </div>
        ))}
        {COLORS.flatMap((k) =>
          [1, 2, 3, 4, 5, 6, 7].map((j) => {
            const [r, c] = PAL[k].home(j);
            return <div key={'h' + k + j} style={{ ...R(r, c), ...cellBase, background: PAL[k].fill, borderColor: PAL[k].deep }} />;
          })
        )}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ ...rect(8, 8, 3, 3), display: 'block', transform: `rotate(${q * 90}deg)` }}>
          <polygon points="0,0 100,0 50,50" fill={PAL.yellow.fill} />
          <polygon points="100,0 100,100 50,50" fill={PAL.green.fill} />
          <polygon points="0,100 100,100 50,50" fill={PAL.red.fill} />
          <polygon points="0,0 0,100 50,50" fill={PAL.blue.fill} />
          <path d="M0,0 L100,100 M100,0 L0,100" stroke="#FFFFFF" strokeWidth="1.2" />
          <rect x="0" y="0" width="100" height="100" fill="none" stroke={LINE} strokeWidth="1" />
          <circle cx="50" cy="50" r="7" fill="#FFFFFF" stroke={LINE} strokeWidth="1" />
        </svg>
        {targets.map((t, idx) => {
          const raw = center(t.color, t.p, t.slot || 0);
          const ctr = { ...raw, ...at(raw) };
          const s = ctr.size + 0.6;
          return (
            <div
              key={'tg' + idx}
              style={{
                position: 'absolute', left: `${G(ctr.c) - s / 2}%`, top: `${G(ctr.r) - s / 2}%`, width: `${s}%`, height: `${s}%`,
                boxSizing: 'border-box', borderRadius: '50%', border: '2px dashed #0EA5C6', background: 'rgba(49,216,245,0.25)', zIndex: 4, pointerEvents: 'none'
              }}
            />
          );
        })}
        {placed.map(({ pw, ctr }) => {
          const C = PAL[pw.color];
          let x = G(ctr.c), y = G(ctr.r), size = ctr.size;
          if (groups[ctr.key] > 1) {
            // Deux pions sur la même case (barrière) : côte à côte dans le sens long de la case.
            const n = (seen[ctr.key] = (seen[ctr.key] || 0) + 1);
            const d = n === 1 ? -2.6 : 2.6;
            if (ctr.wide) x += d;
            else y += d;
          }
          const mv = !!pw.movable;
          const where = pw.p < 0 ? 'في البيت' : pw.p >= GOAL ? 'وصل' : pw.p > LAST_TRACK ? 'في الممر الأخير' : 'الخانة ' + (((C.start + pw.p) % 68) + 1);
          return (
            <button
              key={pw.color + pw.slot}
              type="button"
              data-testid={`pawn-${pw.color}-${pw.slot}`}
              aria-label={'البيدق ' + C.name + ' ' + (pw.slot + 1) + '، ' + where + (mv ? ' — يمكن تحريكه' : '')}
              disabled={!(mv && pw.onPick)}
              onClick={pw.onPick}
              style={{
                position: 'absolute', left: `${x - size / 2}%`, top: `${y - size / 2}%`, width: `${size}%`, height: `${size}%`,
                padding: 0, border: 0, background: 'transparent', borderRadius: '50%', transition: 'left .16s ease, top .16s ease, transform .2s ease',
                zIndex: mv ? 6 : 3, cursor: mv && pw.onPick ? 'pointer' : 'default', transform: mv ? 'scale(1.12)' : undefined
              }}
            >
              <span
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: '50%', boxSizing: 'border-box',
                  background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.65), rgba(255,255,255,0) 46%), ${C.fill}`, border: `1.5px solid ${C.deep}`,
                  boxShadow: `0 2px 0 ${C.deep}, 0 4px 8px rgba(0,0,0,0.35)` + (mv ? ', 0 0 0 3px #FFFFFF, 0 0 0 6px rgba(14,165,198,0.7), 0 0 18px rgba(49,216,245,0.85)' : '')
                }}
              >
                <span style={{ width: '42%', height: '42%', borderRadius: '50%', border: '1.5px solid rgba(0,0,0,0.18)', background: 'rgba(255,255,255,0.3)' }} />
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
  [['blue', [-1, -1, 12, 40]], ['yellow', [-1, 5, 30, 71]], ['red', [-1, -1, -1, 18]], ['green', [-1, -1, 26, -1]]] as [Color, number[]][]
).flatMap(([color, arr]) => arr.map((p, slot) => ({ color, p, slot })));
