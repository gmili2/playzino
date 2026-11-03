import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { fmt } from '../lib/format';
import { IconArrowDown, IconArrowUp, IconBook, IconChevron, IconCrown, IconGrid, IconHome, IconLogout, IconShield, IconUser, IconUsers, IconWheel } from './Icons';
import { Avatar, Coin, Loading } from './ui';

/** Logo façon Rolly : couronne dorée dans un rond, nom en or. */
export function Brand() {
  return (
    <Link to="/" aria-label="Playzino — الرئيسية" className="rl-brand">
      <span className="rl-brand-mark"><IconCrown size={24} /></span>
      <span dir="ltr" className="rl-brand-name">Playzino</span>
    </Link>
  );
}

const LINKS = [
  { to: '/', label: 'الرئيسية', icon: <IconHome size={18} />, end: true },
  { to: '/tables', label: 'الطاولات', icon: <IconGrid size={18} /> },
  { to: '/players', label: 'اللاعبون', icon: <IconUsers size={18} /> },
  { to: '/wheel', label: 'عجلة الحظ', icon: <IconWheel size={18} /> },
  { to: '/rules', label: 'القواعد', icon: <IconBook size={18} /> }
];

/** Menu du compte (clic sur l'avatar), comme le panneau de Rolly. */
function AccountMenu({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  if (!user) return null;
  const item = (to: string, icon: ReactNode, label: string, extra?: ReactNode) => (
    <Link to={to} className="rl-menu-item" onClick={onClose}>{icon}<span>{label}</span>{extra ?? <IconChevron size={16} className="rl-menu-chev" />}</Link>
  );
  return (
    <div ref={ref} className="rl-menu" role="menu" aria-label="حسابي">
      <div className="rl-menu-head">
        <Avatar name={user.username} color={user.profile.avatarColor} size={58} ring="#F2B232" />
        <span className="rl-menu-who">
          <b>{user.username}</b>
          <span className="rl-tag rl-tag-gold">المستوى {user.profile.level}</span>
        </span>
      </div>
      <Link to="/cashier" className="rl-menu-card" onClick={onClose}>
        <span>الرصيد</span>
        <b><Coin size={18} /><span dir="ltr">{fmt(user.balance)}</span></b>
      </Link>
      <div className="rl-menu-sec">المحفظة</div>
      {item('/cashier', <IconArrowDown size={20} />, 'إيداع')}
      {item('/cashier', <IconArrowUp size={20} />, 'سحب')}
      <div className="rl-menu-sec">اللعب</div>
      {item('/tables', <IconGrid size={20} />, 'الطاولات')}
      {item('/players', <IconUsers size={20} />, 'اللاعبون المتصلون')}
      {item('/wheel', <IconWheel size={20} />, 'عجلة الحظ')}
      <div className="rl-menu-sec">الحساب</div>
      {item('/profile', <IconUser size={20} />, 'الملف الشخصي')}
      {user.role === 'ADMIN' && item('/admin', <IconShield size={20} />, 'لوحة الإدارة')}
      <div className="rl-menu-sec">المساعدة</div>
      {item('/rules', <IconBook size={20} />, 'قواعد اللعب')}
      <button type="button" className="rl-menu-item rl-menu-out" onClick={async () => { onClose(); await logout(); nav('/'); }}>
        <IconLogout size={20} /><span>تسجيل الخروج</span>
      </button>
    </div>
  );
}

/** Barre d'onglets du bas (mobile), avec le bouton Accueil central. */
function TabBar() {
  const { pathname } = useLocation();
  // Pas de barre pendant une partie : le bas de l'écran sert aux commandes du jeu.
  if (pathname.startsWith('/room/')) return null;
  const tab = (to: string, icon: ReactNode, label: string) => (
    <NavLink to={to} className={({ isActive }) => 'rl-tab' + (isActive ? ' active' : '')}>{icon}<span>{label}</span></NavLink>
  );
  return (
    <nav className="rl-tabbar pb-show-md" aria-label="التنقل">
      {tab('/profile', <IconUser size={24} />, 'حسابي')}
      {tab('/tables', <IconGrid size={24} />, 'الطاولات')}
      <NavLink to="/" end className={({ isActive }) => 'rl-tab rl-tab-home' + (isActive ? ' active' : '')}>
        <span className="rl-tab-home-btn"><IconHome size={28} /></span><span>الرئيسية</span>
      </NavLink>
      {tab('/wheel', <IconWheel size={24} />, 'العجلة')}
      {tab('/players', <IconUsers size={24} />, 'اللاعبون')}
    </nav>
  );
}

export function Header() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="rl-top">
        <div className="rl-top-in">
          <Brand />
          <nav aria-label="القائمة الرئيسية" className="rl-links pb-hide-md">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => 'rl-link' + (isActive ? ' active' : '')}>{l.icon}{l.label}</NavLink>
            ))}
          </nav>
          <div className="rl-top-right">
            {user ? (
              <>
                <Link to="/cashier" className="rl-pill" title="رصيدي · إيداع أو سحب" data-testid="balance">
                  <Coin size={20} /><span dir="ltr">{fmt(user.balance)}</span><span className="rl-pill-plus" aria-hidden="true">+</span>
                </Link>
                <span className="rl-avatar-wrap">
                  <button type="button" className="rl-avatar" data-testid="user-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
                    <Avatar name={user.username} color={user.profile.avatarColor} size={42} />
                    <span className="sr-only">{user.username}</span>
                  </button>
                  {open && <AccountMenu onClose={() => setOpen(false)} />}
                </span>
              </>
            ) : (
              <>
                <Link className="pb-btn pb-plain pb-sm" to="/login">دخول</Link>
                <Link className="pb-btn pb-gold pb-sm" to="/register">إنشاء حساب</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <TabBar />
    </>
  );
}

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,222,170,0.12)', marginTop: 16 }}>
      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '10px 24px', alignItems: 'center', fontSize: 13, color: '#8C8698' }}>
        <span style={{ fontWeight: 800, color: '#FFC83D' }}>أكثر من مجرد لعبة… مجتمع!</span>
        <span style={{ flex: '1 1 320px' }}>1 عملة = 1 درهم. الإيداع والسحب بالتحويل البنكي فقط، وكل عملية تراجعها الإدارة.</span>
        <Link to="/cashier" style={{ color: '#A9A3B5' }}>الإيداع والسحب</Link>
        <Link to="/rules" style={{ color: '#A9A3B5' }}>القواعد</Link>
      </div>
    </footer>
  );
}

export function Page({ children, width = 1500 }: { children: ReactNode; width?: number }) {
  return (
    <>
      <Header />
      <main style={{ maxWidth: width, margin: '0 auto', padding: '16px clamp(12px, 3vw, 20px)' }}>{children}</main>
      <Footer />
    </>
  );
}

/** Garde de route : redirige vers la connexion (avec retour) si l'utilisateur n'est pas authentifié. */
export function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={'/login?next=' + encodeURIComponent(loc.pathname)} replace />;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}
