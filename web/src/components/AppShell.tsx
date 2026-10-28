import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { IconGrid, IconHome, IconSearch, IconShield, IconUser, Logo } from './Icons';
import { Avatar, Credits, Loading } from './ui';

function Brand() {
  return (
    <Link to="/" aria-label="Parcheesi Online — الرئيسية" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: '#F4F3FF' }}>
      <Logo />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span dir="ltr" style={{ fontWeight: 900, fontSize: 21, letterSpacing: '-0.01em' }}>
          Parcheesi <span style={{ color: '#FFC83D' }}>Online</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#A6A8D6' }}>العب · تحدَّ · استمتع</span>
      </span>
    </Link>
  );
}

const pill = ({ isActive }: { isActive: boolean }) => ({
  display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 16px', borderRadius: 14, textDecoration: 'none',
  fontWeight: 700, fontSize: 15, color: isActive ? '#fff' : '#C9CAF0', background: isActive ? '#6C47FF' : 'transparent',
  boxShadow: isActive ? '0 10px 24px rgba(108,71,255,0.35)' : undefined, whiteSpace: 'nowrap' as const
});

export function Header() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav('/tables' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : ''));
  };
  const links = (
    <>
      <NavLink to="/" end style={pill}><IconHome size={18} />الرئيسية</NavLink>
      <NavLink to="/tables" style={pill}><IconGrid size={18} />الطاولات</NavLink>
      {user && <NavLink to="/profile" style={pill}><IconUser size={18} />الملف الشخصي</NavLink>}
      {user?.role === 'ADMIN' && <NavLink to="/admin" style={pill}><IconShield size={18} />الإدارة</NavLink>}
    </>
  );
  return (
    <header style={{ borderBottom: '1px solid rgba(140,130,255,0.12)', background: 'rgba(10,11,30,0.92)', position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(8px)' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <Brand />
        <nav aria-label="القائمة الرئيسية" className="pb-hide-md" style={{ display: 'flex', gap: 4 }}>{links}</nav>
        <form onSubmit={submit} className="pb-hide-md" role="search" style={{ position: 'relative', flex: '1 1 240px', maxWidth: 420 }}>
          <span style={{ position: 'absolute', insetInlineStart: 16, top: '50%', transform: 'translateY(-50%)', color: '#8A8CC0', display: 'flex' }}><IconSearch size={18} /></span>
          <input className="pb-input" aria-label="بحث" placeholder="ابحث عن طاولة…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingInlineStart: 44, background: '#14153A' }} />
        </form>
        <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {user ? (
            <Link to="/profile" data-testid="user-chip" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 6px 5px 16px', borderRadius: 16, background: '#14153A', border: '1px solid rgba(140,130,255,0.18)', textDecoration: 'none', color: '#F4F3FF' }}>
              <Avatar name={user.username} color={user.profile.avatarColor} ring="#FFC83D" />
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{user.username}</span>
                <span data-testid="balance"><Credits value={user.balance} /></span>
              </span>
            </Link>
          ) : (
            <>
              <Link className="pb-btn pb-plain pb-sm" to="/login">تسجيل الدخول</Link>
              <Link className="pb-btn pb-gold pb-sm" to="/register">إنشاء حساب</Link>
            </>
          )}
        </div>
        <nav aria-label="القائمة" className="pb-show-md" style={{ display: 'flex', gap: 4, width: '100%', overflowX: 'auto' }}>{links}</nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(140,130,255,0.12)', marginTop: 32 }}>
      <div style={{ maxWidth: 1500, margin: '0 auto', padding: 24, display: 'flex', flexWrap: 'wrap', gap: '14px 28px', alignItems: 'center', fontSize: 13, color: '#8A8CC0' }}>
        <span style={{ fontWeight: 800, color: '#FFC83D' }}>أكثر من مجرد لعبة… مجتمع!</span>
        <span style={{ flex: '1 1 320px' }}>العملات افتراضية: تُكسب باللعب فقط، لا قيمة مالية لها، ولا يمكن شراؤها أو سحبها.</span>
        <Link to="/rules" style={{ color: '#A6A8D6' }}>القواعد</Link>
      </div>
    </footer>
  );
}

export function Page({ children, width = 1500 }: { children: ReactNode; width?: number }) {
  return (
    <>
      <Header />
      <main style={{ maxWidth: width, margin: '0 auto', padding: 24 }}>{children}</main>
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
