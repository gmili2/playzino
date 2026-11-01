import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Cartes de modes de jeu illustrées (plateau Ludo incliné, pions brillants, badge « VS », cœur, couronne).
 * Tout est dessiné en SVG : net à toutes les tailles, sans fichier image à charger.
 */
type Variant = 'friend' | 'duel' | 'team' | 'four';

const THEME: Record<Variant, { top: string; bottom: string; edge: string; edgeDark: string; glow: string }> = {
  friend: { top: '#86E0C6', bottom: '#2B8A72', edge: '#5FD6B6', edgeDark: '#2E9C7F', glow: 'rgba(110,240,200,.55)' },
  duel: { top: '#B98AF7', bottom: '#6526C8', edge: '#9C5CF2', edgeDark: '#6A2BC9', glow: 'rgba(190,140,255,.55)' },
  team: { top: '#6E9BF5', bottom: '#1D3DA6', edge: '#4F7BEA', edgeDark: '#2347B8', glow: 'rgba(120,160,255,.55)' },
  four: { top: '#F6AE78', bottom: '#B9472A', edge: '#F08A4B', edgeDark: '#C2582A', glow: 'rgba(255,170,110,.55)' }
};

const PAWN: Record<string, [string, string]> = {
  white: ['#FFFFFF', '#B9C2D3'],
  red: ['#FF7A7A', '#C81E2B'],
  blue: ['#7DB0FF', '#1F4FD1'],
  green: ['#7BE59A', '#1E9446'],
  yellow: ['#FFE27A', '#E0A300']
};

const STAR = 'M0 -11 L2.6 -2.6 L11 0 L2.6 2.6 L0 11 L-2.6 2.6 L-11 0 L-2.6 -2.6Z';

function Pawn({ id, x, y, s = 1, color, faded }: { id: string; x: number; y: number; s?: number; color: string; faded?: boolean }) {
  const [light, dark] = PAWN[color];
  const g = `${id}-p-${color}`;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={faded ? 0.55 : 1}>
      <defs>
        <radialGradient id={g} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      <ellipse cx="0" cy="64" rx="48" ry="11" fill="rgba(0,0,0,.28)" />
      <path d="M-46 62 C-46 22 -26 6 -17 0 L17 0 C26 6 46 22 46 62 Q0 74 -46 62Z" fill={`url(#${g})`} />
      <circle cx="0" cy="-26" r="31" fill={`url(#${g})`} />
      <ellipse cx="-11" cy="-39" rx="11" ry="7" fill="#fff" opacity=".75" />
      <ellipse cx="-24" cy="30" rx="6" ry="16" fill="#fff" opacity=".3" />
    </g>
  );
}

function LudoBoard({ id, v }: { id: string; v: Variant }) {
  const t = THEME[v];
  const quad = (x: number, y: number, light: string, dark: string, key: string) => (
    <g key={key}>
      <defs>
        <linearGradient id={`${id}-q-${key}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <rect x={x} y={y + 5} width="66" height="66" rx="15" fill={dark} />
      <rect x={x} y={y} width="66" height="66" rx="15" fill={`url(#${id}-q-${key})`} />
      <rect x={x + 6} y={y + 4} width="54" height="14" rx="7" fill="#fff" opacity=".28" />
      {[[20, 22], [46, 22], [20, 46], [46, 46]].map(([cx, cy], i) => <circle key={i} cx={x + cx} cy={y + cy} r="7.5" fill="#fff" opacity=".92" />)}
    </g>
  );
  return (
    <g transform="translate(200 150) rotate(-8)">
      <rect x="-104" y="-96" width="208" height="208" rx="32" fill={t.edgeDark} />
      <rect x="-104" y="-104" width="208" height="208" rx="32" fill={t.edge} />
      <rect x="-90" y="-90" width="180" height="180" rx="22" fill="#F5F8FF" />
      <rect x="-15" y="-90" width="30" height="180" fill="#E2E8F5" />
      <rect x="-90" y="-15" width="180" height="30" fill="#E2E8F5" />
      <path d="M-15 -15 L0 0 L15 -15Z" fill="#3B82F6" /><path d="M15 -15 L0 0 L15 15Z" fill="#22C55E" />
      <path d="M15 15 L0 0 L-15 15Z" fill="#FACC15" /><path d="M-15 15 L0 0 L-15 -15Z" fill="#EF4444" />
      {quad(-84, -84, '#FF7B7B', '#D22F3A', 'r')}
      {quad(18, -84, '#78A6FF', '#2E5FE0', 'b')}
      {quad(-84, 18, '#FFE07A', '#E8A90C', 'y')}
      {quad(18, 18, '#7DE39B', '#24A350', 'g')}
    </g>
  );
}

function Badge({ kind }: { kind: 'heart' | 'vs' | 'crown' }) {
  if (kind === 'heart') {
    return (
      <g transform="translate(200 300)">
        <path d="M0 34 C-50 2 -52 -34 -26 -40 C-12 -43 -3 -34 0 -26 C3 -34 12 -43 26 -40 C52 -34 50 2 0 34Z" fill="#fff" transform="scale(1.12)" />
        <path d="M0 34 C-50 2 -52 -34 -26 -40 C-12 -43 -3 -34 0 -26 C3 -34 12 -43 26 -40 C52 -34 50 2 0 34Z" fill="#F0476A" />
        <ellipse cx="-20" cy="-22" rx="12" ry="7" fill="#fff" opacity=".7" transform="rotate(-30 -20 -22)" />
      </g>
    );
  }
  if (kind === 'vs') {
    return (
      <g transform="translate(200 300)">
        <circle r="38" fill="#F2C14E" />
        <circle r="31" fill="#2A1556" />
        <text y="10" textAnchor="middle" fontSize="30" fontWeight="900" fontFamily="Cairo, system-ui, sans-serif" fill="#FFE29A" fontStyle="italic">VS</text>
      </g>
    );
  }
  return (
    <g transform="translate(160 272) scale(.9)">
      <path d="M-34 18 L-40 -22 L-16 -2 L0 -30 L16 -2 L40 -22 L34 18Z" fill="#FFD54A" stroke="#C98A00" strokeWidth="3" strokeLinejoin="round" />
      <rect x="-34" y="16" width="68" height="10" rx="3" fill="#F2B232" stroke="#C98A00" strokeWidth="2" />
      <circle cx="0" cy="4" r="5" fill="#E5484D" />
    </g>
  );
}

function ModeArt({ v }: { v: Variant }) {
  const id = useId().replace(/:/g, '');
  const t = THEME[v];
  return (
    <svg className="md-art" viewBox="0 0 400 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.top} />
          <stop offset="1" stopColor={t.bottom} />
        </linearGradient>
        <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".55" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={t.glow} />
          <stop offset="1" stopColor={t.glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="560" fill={`url(#${id}-bg)`} />
      <path d="M160 0 L240 0 L310 260 L90 260Z" fill={`url(#${id}-beam)`} />
      <ellipse cx="200" cy="270" rx="150" ry="40" fill={`url(#${id}-glow)`} />
      {[[40, 50, 1], [360, 50, 1], [70, 110, 0.6], [345, 245, 0.7], [40, 520, 0.8], [360, 520, 0.8]].map(([x, y, s], i) => (
        <path key={i} d={STAR} transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity=".9" />
      ))}
      {[[300, 70, '#FFD54A'], [85, 265, '#7FE7FF'], [335, 115, '#FFD54A'], [345, 330, '#7FE7FF']].map(([x, y, c], i) => (
        <rect key={i} x={x as number} y={y as number} width="9" height="9" rx="2" fill={c as string} transform={`rotate(20 ${x} ${y})`} opacity=".85" />
      ))}
      <LudoBoard id={id} v={v} />
      {v === 'friend' && <><Pawn id={id} x={105} y={330} s={1.05} color="white" /><Pawn id={id} x={295} y={330} s={1.05} color="white" /><Badge kind="heart" /></>}
      {v === 'duel' && <><Pawn id={id} x={100} y={320} s={1.05} color="red" /><Pawn id={id} x={300} y={320} s={1.05} color="blue" /><Badge kind="vs" /></>}
      {v === 'team' && <>
        <Pawn id={id} x={60} y={350} s={0.78} color="blue" faded /><Pawn id={id} x={125} y={335} s={0.85} color="blue" />
        <Pawn id={id} x={275} y={335} s={0.85} color="red" /><Pawn id={id} x={340} y={350} s={0.78} color="red" faded />
        <Badge kind="vs" />
      </>}
      {v === 'four' && <>
        <Pawn id={id} x={70} y={345} s={0.78} color="green" /><Pawn id={id} x={160} y={345} s={0.86} color="red" />
        <Pawn id={id} x={248} y={330} s={0.86} color="blue" /><Pawn id={id} x={335} y={345} s={0.78} color="yellow" />
        <Badge kind="crown" />
      </>}
      <rect width="400" height="560" fill={`url(#${id}-shade)`} />
    </svg>
  );
}

export interface ModeCardProps {
  variant: Variant;
  title: string;
  sub: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  tag?: ReactNode;
  testId?: string;
}

export function ModeCard({ variant, title, sub, to, onClick, disabled, tag, testId }: ModeCardProps) {
  const t = THEME[variant];
  const body = (
    <>
      <ModeArt v={variant} />
      {tag && <span className="md-tag">{tag}</span>}
      <span className="md-text"><b>{title}</b><small>{sub}</small></span>
    </>
  );
  const style = { ['--md-edge' as string]: t.edge };
  return to ? (
    <Link to={to} className="md-card" style={style} data-testid={testId}>{body}</Link>
  ) : (
    <button type="button" className="md-card" style={style} onClick={onClick} disabled={disabled} data-testid={testId}>{body}</button>
  );
}
