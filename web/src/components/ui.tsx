import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fmt, initials } from '../lib/format';

export function Coin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="#F5B828" />
      <circle cx="10" cy="10" r="6.3" fill="none" stroke="#FFE08A" strokeWidth="1.5" />
      <path d="M10 6.2 12.6 10 10 13.8 7.4 10Z" fill="#FFF3C4" />
    </svg>
  );
}

export function Credits({ value, size = 14, color = '#FFD54A' }: { value: number; size?: number; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 800, fontSize: size, color }}>
      <Coin size={size + 2} />
      <span dir="ltr">{fmt(value)}</span>
    </span>
  );
}

/** Avatar rond : la photo du joueur s'il en a choisi une, sinon ses initiales sur sa couleur. */
export function Avatar({ name, color, src, size = 40, ring, style }: { name: string; color: string; src?: string | null; size?: number; ring?: string; style?: CSSProperties }) {
  const dark = color.toUpperCase() === '#F5C21B';
  if (src) {
    return (
      <img
        src={src} alt="" aria-hidden="true" width={size} height={size} loading="lazy" decoding="async"
        style={{ flex: 'none', width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: color, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined, ...style }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        flex: 'none', width: size, height: size, borderRadius: '50%', background: color, color: dark ? '#2A1E00' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: Math.round(size * 0.35),
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined, ...style
      }}
    >
      {initials(name)}
    </span>
  );
}

const FACES: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** Orientation du cube qui présente chaque face au joueur (faces opposées : 1-6, 2-5, 3-4). */
const FACE_ROT: Record<number, { x: number; y: number }> = { 1: { x: 0, y: 0 }, 6: { x: 0, y: 180 }, 3: { x: 0, y: -90 }, 4: { x: 0, y: 90 }, 5: { x: -90, y: 0 }, 2: { x: 90, y: 0 } };
const FACE_POS: Record<number, string> = { 1: 'translateZ(var(--h))', 6: 'rotateY(180deg) translateZ(var(--h))', 3: 'rotateY(90deg) translateZ(var(--h))', 4: 'rotateY(-90deg) translateZ(var(--h))', 5: 'rotateX(90deg) translateZ(var(--h))', 2: 'rotateX(-90deg) translateZ(var(--h))' };

/** Prochain angle ≡ cible (mod 360), au moins `turns` tours plus loin : le dé tourne toujours vers l'avant. */
function spinTo(prev: number, target: number, turns: number) {
  const base = prev + turns * 360;
  return base - (((base % 360) + 360) % 360) + ((target % 360) + 360) % 360;
}

/**
 * Dé en 3D (CSS). `rolling` : le dé tournoie en attendant le résultat du serveur ; à chaque nouveau `rollId`
 * (un lancer, le mien ou celui d'un adversaire), il roule et retombe sur `face` avec un léger rebond.
 */
export function Die({ face, rolling, rollId = 0, size = 96 }: { face: number; rolling?: boolean; rollId?: number; size?: number }) {
  const [rot, setRot] = useState(() => ({ ...FACE_ROT[face] ?? FACE_ROT[1], ms: 0, ease: 'linear' }));
  const [bounce, setBounce] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (!rolling) return;
    // Tournoiement rapide et long : interrompu en douceur dès que le résultat arrive.
    setRot((r) => ({ x: r.x + 1440 + 90, y: r.y + 1440 + 180, ms: 2600, ease: 'linear' }));
  }, [rolling]);
  useEffect(() => {
    if (rolling) return;
    const t = FACE_ROT[face] ?? FACE_ROT[1];
    if (first.current) {
      first.current = false;
      setRot({ ...t, ms: 0, ease: 'linear' });
      return;
    }
    setRot((r) => ({ x: spinTo(r.x, t.x, 2), y: spinTo(r.y, t.y, 1), ms: 900, ease: 'cubic-bezier(.15,.9,.3,1.12)' }));
    setBounce((b) => b + 1);
  }, [face, rollId, rolling]);
  const pip = Math.round(size * 0.17);
  return (
    <div role="img" aria-label={'النرد: ' + face} className="pc-die3d-wrap" style={{ width: size, height: size }}>
      {/* Deux animations identiques alternées : relancer le rebond sans remonter le cube (qui perdrait sa transition). */}
      <span className="pc-die3d-shadow" style={bounce ? { animation: `pc-die-shadow-${bounce % 2} .9s ease-out` } : undefined} />
      <div className="pc-die3d-hop" style={bounce ? { animation: `pc-die-hop-${bounce % 2} .9s ease-out` } : undefined}>
        <div
          className="pc-die3d"
          style={{ '--h': `${size / 2}px`, transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`, transition: `transform ${rot.ms}ms ${rot.ease}` } as CSSProperties}
        >
          {[1, 2, 3, 4, 5, 6].map((f) => (
            <span key={f} className="pc-die3d-face" style={{ transform: FACE_POS[f], borderRadius: size * 0.2, padding: size * 0.16 }}>
              {Array.from({ length: 9 }, (_, k) => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {FACES[f].includes(k) && <span className="pc-pip" style={{ width: pip, height: pip }} />}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, [string, string, string]> = {
    WAITING: ['في الانتظار', '#22D3EE', 'rgba(34,211,238,0.14)'],
    PLAYING: ['جارية', '#4ADE80', 'rgba(34,197,94,0.14)'],
    ACTIVE: ['جارية', '#4ADE80', 'rgba(34,197,94,0.14)'],
    FINISHED: ['منتهية', '#B8B2C4', 'rgba(255,222,170,0.14)'],
    ABORTED: ['ملغاة', '#FB7185', 'rgba(244,63,94,0.14)'],
    CANCELLED: ['ملغاة', '#FB7185', 'rgba(244,63,94,0.14)'],
    FULL: ['مكتملة', '#FFC83D', 'rgba(255,200,61,0.14)']
  };
  const [label, fg, bg] = map[status] ?? [status, '#B8B2C4', 'rgba(255,222,170,0.14)'];
  return (
    <span className="badge" style={{ color: fg, background: bg }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: fg }} />
      {label}
    </span>
  );
}

export function Spinner({ size = 32 }: { size?: number }) {
  return (
    <svg className="pb-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFC83D" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function Loading({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <div role="status" style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: 'var(--muted)' }}>
      <Spinner />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: 32, borderRadius: 20, background: '#1B1824', textAlign: 'center', color: '#A9A3B5' }}>{children}</div>;
}
