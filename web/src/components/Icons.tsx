import type { SVGProps } from 'react';

/** Icônes du design (tracés Lucide repris tels quels). */
type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true
});
const mk = (paths: JSX.Element) => ({ size, ...rest }: P) => <svg {...base(size)} {...rest}>{paths}</svg>;

export const IconHome = mk(<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />);
export const IconGrid = mk(<><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></>);
export const IconTrophy = mk(<><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>);
export const IconUser = mk(<><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></>);
export const IconUsers = mk(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>);
export const IconBook = mk(<><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>);
export const IconSearch = mk(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>);
export const IconBolt = mk(<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />);
export const IconLock = mk(<><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>);
export const IconKey = mk(<><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></>);
export const IconShield = mk(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></>);
export const IconArrowBack = mk(<><path d="m12 5 7 7-7 7" /><path d="M5 12h14" /></>);
export const IconLogout = mk(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>);
export const IconVolume = mk(<><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>);
export const IconMute = mk(<><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></>);
export const IconDice = mk(<><rect width="18" height="18" x="3" y="3" rx="4" /><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" /></>);
export const IconWifiOff = mk(<><path d="M12 20h.01" /><path d="M8.5 16.43a5 5 0 0 1 7 0" /><path d="M2 8.82a15 15 0 0 1 4.17-2.65" /><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" /><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" /><path d="M5 13a10 10 0 0 1 5.24-2.76" /><path d="m2 2 20 20" /></>);
export const IconClock = mk(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>);
export const IconList = mk(<><path d="M3 12h.01" /><path d="M3 18h.01" /><path d="M3 6h.01" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M8 6h13" /></>);
export const IconCoins = mk(<><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /></>);
export const IconActivity = mk(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />);
export const IconPlus = mk(<><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const IconArrowUp = mk(<><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>);
export const IconArrowDown = mk(<><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>);
export const IconCopy = mk(<><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>);
export const IconRobot = mk(<><rect width="16" height="12" x="4" y="8" rx="3" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1" /><path d="M9 13h.01M15 13h.01" /><path d="M10 17h4" /><path d="M2 13v2M22 13v2" /></>);
export const IconMenu = mk(<><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>);

export const IconCrown = ({ size = 22, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5z" /></svg>
);

export const Logo = ({ size = 46 }: { size?: number }) => (
  <svg width={size} height={(size * 40) / 46} viewBox="0 0 46 40" aria-hidden="true">
    <path d="M4 12 13 22 23 6 33 22 42 12 38 32H8Z" fill="#FFC83D" stroke="#B87400" strokeWidth="2" strokeLinejoin="round" />
    <rect x="8" y="32" width="30" height="5" rx="2" fill="#FFB21E" />
    <circle cx="4" cy="11" r="3" fill="#FFDA5C" /><circle cx="23" cy="5" r="3" fill="#FFDA5C" /><circle cx="42" cy="11" r="3" fill="#FFDA5C" />
    <rect x="15" y="22" width="5" height="5" rx="1.5" fill="#E5484D" /><rect x="21" y="22" width="5" height="5" rx="1.5" fill="#2F6BFF" /><rect x="27" y="22" width="5" height="5" rx="1.5" fill="#1FB57A" />
  </svg>
);

export const Gift = ({ size = 48 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="8" width="18" height="4" rx="1" fill="#FFB21E" />
    <path d="M5 12h14v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" fill="#F43F5E" />
    <path d="M12 8v13" stroke="#FFDA5C" strokeWidth="2.4" />
    <path d="M12 8C10 4 6 4 7.5 6.5 8.5 8 12 8 12 8Zm0 0c2-4 6-4 4.5-1.5C15.5 8 12 8 12 8Z" fill="#FFDA5C" />
  </svg>
);
