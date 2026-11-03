import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Décor « casino » partagé : faisceaux de projecteurs, pièces d'or flottantes, éclats de diamant, podium lumineux
 * et ampoules de chapiteau. Purement décoratif (aria-hidden), immobile si l'utilisateur réduit les animations.
 */

/** Projecteurs qui balaient la scène depuis le haut (à placer dans un parent en position relative). */
export function StageLights({ beams = 4 }: { beams?: number }) {
  return (
    <div className="cs-lights" aria-hidden="true">
      <span className="cs-haze" />
      {Array.from({ length: beams }, (_, i) => (
        <span key={i} className="cs-beam" style={{ '--x': `${((i + 0.5) / beams) * 100}%`, '--tilt': `${(i - (beams - 1) / 2) * 14}deg`, '--d': `${-i * 1.7}s` } as CSSProperties} />
      ))}
    </div>
  );
}

// Positions fixes (en %) : le décor reste identique d'un rendu à l'autre.
const COIN_SPOTS = [
  { x: 6, y: 18, s: 34, r: -20, d: 0 }, { x: 88, y: 12, s: 28, r: 25, d: -1.2 }, { x: 92, y: 52, s: 38, r: -10, d: -2.1 },
  { x: 3, y: 62, s: 30, r: 15, d: -3 }, { x: 80, y: 80, s: 24, r: 40, d: -0.6 }, { x: 15, y: 86, s: 22, r: -35, d: -1.8 },
  { x: 70, y: 6, s: 20, r: 10, d: -2.6 }, { x: 24, y: 4, s: 18, r: -15, d: -3.4 }
];

function CoinArt() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id="csCoin" cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#FFF6C8" /><stop offset=".45" stopColor="#FFD23F" /><stop offset="1" stopColor="#B87400" /></radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="#9A5E00" />
      <circle cx="20" cy="19" r="18" fill="url(#csCoin)" />
      <circle cx="20" cy="19" r="13" fill="none" stroke="#C98A00" strokeWidth="2" />
      <path d="m20 10 2.6 6 6.4.5-4.9 4.2 1.5 6.3-5.6-3.4-5.6 3.4 1.5-6.3-4.9-4.2 6.4-.5Z" fill="#FFF3B0" stroke="#C98A00" strokeWidth=".8" />
    </svg>
  );
}

/** Pièces d'or qui flottent autour de l'élément. */
export function FloatingCoins({ count = 6 }: { count?: number }) {
  return (
    <div className="cs-coins" aria-hidden="true">
      {COIN_SPOTS.slice(0, count).map((c, i) => (
        <span key={i} className="cs-coin" style={{ left: `${c.x}%`, top: `${c.y}%`, width: c.s, '--r': `${c.r}deg`, '--d': `${c.d}s`, filter: c.s < 24 ? 'blur(1.2px)' : undefined } as CSSProperties}>
          <CoinArt />
        </span>
      ))}
    </div>
  );
}

const SPARK_SPOTS = [
  { x: 8, y: 10, s: 18, d: 0 }, { x: 92, y: 8, s: 14, d: -0.7 }, { x: 50, y: 3, s: 12, d: -1.9 }, { x: 96, y: 40, s: 16, d: -1.3 },
  { x: 4, y: 45, s: 12, d: -2.4 }, { x: 88, y: 90, s: 18, d: -0.4 }, { x: 12, y: 94, s: 14, d: -1.6 }, { x: 60, y: 97, s: 10, d: -2.8 },
  { x: 30, y: 20, s: 9, d: -3.1 }, { x: 72, y: 26, s: 11, d: -2.2 }, { x: 40, y: 80, s: 9, d: -0.9 }, { x: 78, y: 66, s: 10, d: -3.5 }
];

/** Éclats de diamant (étoiles à quatre branches) qui scintillent. */
export function Sparkles({ count = 8, color = '#FFF7D6' }: { count?: number; color?: string }) {
  return (
    <div className="cs-sparkles" aria-hidden="true">
      {SPARK_SPOTS.slice(0, count).map((s, i) => (
        <svg key={i} className="cs-spark" viewBox="0 0 24 24" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, '--d': `${s.d}s` } as CSSProperties}>
          <path d="M12 0c.7 6.3 5.7 11.3 12 12-6.3.7-11.3 5.7-12 12-.7-6.3-5.7-11.3-12-12C6.3 11.3 11.3 6.3 12 0Z" fill={color} />
        </svg>
      ))}
    </div>
  );
}

/** Podium lumineux sous un élément (roue, trophée). */
export function Podium() {
  return <div className="cs-podium" aria-hidden="true"><span /><span /></div>;
}

/**
 * Ampoules de chapiteau tout autour du parent (position relative). Deux rangées décalées s'allument en alternance ;
 * le tracé est recalculé à la taille réelle pour que les ampoules restent rondes et régulièrement espacées.
 */
export function MarqueeBulbs({ inset = 7, radius = 20, gap = 22 }: { inset?: number; radius?: number; gap?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rect = size && size.w > 2 * inset && size.h > 2 * inset && { x: inset, y: inset, width: size.w - 2 * inset, height: size.h - 2 * inset, rx: radius };
  return (
    <div ref={ref} className="cs-marquee" aria-hidden="true">
      {rect && (
        <svg width={size!.w} height={size!.h}>
          <rect {...rect} className="cs-bulbs a" strokeDasharray={`0 ${gap}`} />
          <rect {...rect} className="cs-bulbs b" strokeDasharray={`0 ${gap}`} strokeDashoffset={gap / 2} />
        </svg>
      )}
    </div>
  );
}
