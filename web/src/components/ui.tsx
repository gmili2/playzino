import type { CSSProperties, ReactNode } from 'react';
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
    <span title="عملات افتراضية بدون قيمة مالية" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 800, fontSize: size, color }}>
      <Coin size={size + 2} />
      <span dir="ltr">{fmt(value)}</span>
    </span>
  );
}

export function Avatar({ name, color, size = 40, ring, style }: { name: string; color: string; size?: number; ring?: string; style?: CSSProperties }) {
  const dark = color.toUpperCase() === '#F5C21B';
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

export function Die({ face, rolling, size = 96 }: { face: number; rolling?: boolean; size?: number }) {
  const pip = Math.round(size * 0.156);
  return (
    <div
      className={rolling ? 'pc-die pc-rolling' : 'pc-die'}
      role="img"
      aria-label={'النرد: ' + face}
      style={{
        flex: 'none', width: size, height: size, borderRadius: size * 0.23, background: 'linear-gradient(160deg, #FFFFFF, #E4EAF5)',
        boxShadow: 'inset 0 -6px 0 #C3CDE0, 0 0 0 4px rgba(255,200,61,0.25), 0 14px 30px rgba(0,0,0,0.45)',
        display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
        padding: `${size * 0.167}px ${size * 0.167}px ${size * 0.208}px`, gap: 4
      }}
    >
      {Array.from({ length: 9 }, (_, k) => (
        <span key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: pip, height: pip, borderRadius: '50%', background: '#0B1326', boxShadow: 'inset 0 2px 2px rgba(0,0,0,0.5)', opacity: FACES[face]?.includes(k) ? 1 : 0 }} />
        </span>
      ))}
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, [string, string, string]> = {
    WAITING: ['في الانتظار', '#22D3EE', 'rgba(34,211,238,0.14)'],
    PLAYING: ['جارية', '#4ADE80', 'rgba(34,197,94,0.14)'],
    ACTIVE: ['جارية', '#4ADE80', 'rgba(34,197,94,0.14)'],
    FINISHED: ['منتهية', '#B4B6E4', 'rgba(140,130,255,0.14)'],
    ABORTED: ['ملغاة', '#FB7185', 'rgba(244,63,94,0.14)'],
    CANCELLED: ['ملغاة', '#FB7185', 'rgba(244,63,94,0.14)'],
    FULL: ['مكتملة', '#FFC83D', 'rgba(255,200,61,0.14)']
  };
  const [label, fg, bg] = map[status] ?? [status, '#B4B6E4', 'rgba(140,130,255,0.14)'];
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
  return <div style={{ padding: 32, borderRadius: 20, background: '#14153A', textAlign: 'center', color: '#A6A8D6' }}>{children}</div>;
}
