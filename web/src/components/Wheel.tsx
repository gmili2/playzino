import { fmt } from '../lib/format';

const COLORS = ['#E5484D', '#F59E0B', '#22C55E', '#2F6BFF', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#0EA5E9', '#84CC16', '#A855F7', '#EF4444'];
/** Gains affichés sur la roue décorative (bannières) avant de connaître la vraie roue. */
export const SHOWCASE_WHEEL = [10, 50, 20, 100, 25, 200, 15, 500];

const C = 200;
const point = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
};

/** Angle (en degrés, sens horaire) qui amène le centre de la case `index` sous l'aiguille du haut. */
export function restAngle(index: number, count: number) {
  return -((index + 0.5) * 360) / count;
}

/**
 * Roue de la fortune en SVG : cases colorées, jante dorée à ampoules, moyeu à couronne.
 * `rotation` fait tourner le disque (l'aiguille reste en haut).
 */
export function Wheel({ segments, rotation = 0, label }: { segments: number[]; rotation?: number; label?: string }) {
  const n = segments.length;
  const step = 360 / n;
  const big = Math.max(...segments);
  return (
    <div className="wh-stage" role="img" aria-label={label ?? 'عجلة الحظ'}>
      <div className="wh-glow" />
      <svg className="wh-pointer" viewBox="0 0 44 54" aria-hidden="true">
        <path d="M22 52 4 14a18 18 0 1 1 36 0Z" fill="url(#whPtr)" stroke="#7A4A00" strokeWidth="2" />
        <circle cx="22" cy="16" r="6" fill="#FFF3C4" />
        <defs><linearGradient id="whPtr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE9A8" /><stop offset="1" stopColor="#E09A10" /></linearGradient></defs>
      </svg>
      <svg className="wh-rotor" viewBox="0 0 400 400" style={{ transform: `rotate(${rotation}deg)` }} aria-hidden="true">
        <defs>
          <linearGradient id="whRim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE9A8" /><stop offset=".5" stopColor="#E7A52A" /><stop offset="1" stopColor="#8A5600" /></linearGradient>
          <radialGradient id="whShade"><stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".28" /></radialGradient>
        </defs>
        <circle cx={C} cy={C} r="196" fill="#3B2400" />
        <circle cx={C} cy={C} r="188" fill="none" stroke="url(#whRim)" strokeWidth="18" />
        {segments.map((amount, i) => {
          const a0 = i * step;
          const a1 = a0 + step;
          return (
            <g key={i}>
              <path d={`M${C} ${C} L${point(178, a0)} A178 178 0 ${step > 180 ? 1 : 0} 1 ${point(178, a1)} Z`} fill={COLORS[i % COLORS.length]} stroke="#FFE9A8" strokeOpacity=".55" strokeWidth="2" />
              <g transform={`rotate(${a0 + step / 2} ${C} ${C})`}>
                <text x={C} y="70" textAnchor="middle" fontFamily="Cairo, system-ui, sans-serif" fontWeight="900" fontSize={amount === big ? 34 : 28} fill="#fff" stroke="rgba(0,0,0,.35)" strokeWidth="1.2" paintOrder="stroke">{fmt(amount)}</text>
                <circle cx={C} cy="94" r="10" fill="#F5B828" stroke="#FFE08A" strokeWidth="2" />
                <path d={`M${C} 88 ${C + 4} 94 ${C} 100 ${C - 4} 94Z`} fill="#FFF3C4" />
              </g>
            </g>
          );
        })}
        <circle cx={C} cy={C} r="178" fill="url(#whShade)" />
        {Array.from({ length: 24 }, (_, i) => (
          <circle key={i} className="wh-bulb" cx={point(188, i * 15).split(' ')[0]} cy={point(188, i * 15).split(' ')[1]} r="4.5" fill="#FFF7D6" />
        ))}
        <circle cx={C} cy={C} r="40" fill="#1B1824" stroke="url(#whRim)" strokeWidth="7" />
        <path d="m178 186 6 22h32l6-22-11 11-11-17-11 17Z M182 211h36v6h-36Z" fill="#F2B232" />
      </svg>
    </div>
  );
}
