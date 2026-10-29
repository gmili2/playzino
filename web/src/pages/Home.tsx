import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Board, SHOWCASE_PAWNS } from '../components/Board';
import { Footer, Header } from '../components/AppShell';
import { Gift, IconBolt, IconRobot, IconBook, IconCrown, IconGrid, IconHome, IconLock, IconShield, IconTrophy, IconUser, IconUsers } from '../components/Icons';
import { RoomCard } from '../components/RoomCard';
import { Avatar, Empty } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmt } from '../lib/format';
import { useLobby, useRoomActions } from '../lib/hooks';

interface Stats {
  online: number;
  leaderboard: { rank: number; userId: string; username: string; avatarColor: string; wins: number; winnings: number }[];
  recentWins: { gameId: string; username: string; avatarColor: string; room: string; payout: number }[];
}

const FILTERS = [
  { key: '', label: 'الكل' },
  { key: 'WAITING', label: 'في الانتظار' },
  { key: 'PLAYING', label: 'جارية' }
];
const PERIODS = [
  { key: 'week', label: 'الأسبوع' },
  { key: 'month', label: 'الشهر' },
  { key: 'all', label: 'كل الأوقات' }
];

function Sidebar({ online }: { online: number | null }) {
  const { user, refresh } = useAuth();
  const [msg, setMsg] = useState('');
  const [claimed, setClaimed] = useState(false);
  const claim = async () => {
    try {
      await api.post('/api/wallet/daily-bonus');
      setMsg('تمت إضافة 200 عملة إلى رصيدك!');
      setClaimed(true);
      await refresh();
    } catch (e) {
      setMsg(errorText(e));
      setClaimed(true);
    }
  };
  const nav = (to: string, icon: JSX.Element, label: string, end = false) => (
    <NavLink className={({ isActive }) => 'pb-nav' + (isActive ? ' active' : '')} to={to} end={end}>{icon}{label}</NavLink>
  );
  return (
    <nav aria-label="القائمة الجانبية" className="pb-hide-md" style={{ flex: '0 0 236px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {nav('/', <IconHome size={22} />, 'الرئيسية', true)}
      {nav('/tables', <IconGrid size={22} />, 'الطاولات')}
      <a className="pb-nav" href="#leaderboard"><IconTrophy size={22} />الترتيب</a>
      {user && nav('/profile', <IconUser size={22} />, 'الملف الشخصي')}
      {nav('/rules', <IconBook size={22} />, 'قواعد اللعب')}

      <div style={{ marginTop: 18, padding: '20px 18px', borderRadius: 20, background: '#1A1430', border: '1px solid rgba(255,200,61,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <Gift />
        <span style={{ fontWeight: 800, fontSize: 17, color: '#FFC83D' }}>المكافأة اليومية</span>
        <span role="status" style={{ fontSize: 13, lineHeight: 1.6, color: '#D4D2F2' }}>{msg || 'احصل على 200 عملة افتراضية مجانًا كل يوم.'}</span>
        {user ? (
          <button type="button" className="pb-btn pb-gold" style={{ width: '100%' }} disabled={claimed} onClick={claim}>{claimed ? 'تم الاستلام' : 'استلم الآن'}</button>
        ) : (
          <Link className="pb-btn pb-gold" style={{ width: '100%' }} to="/register">سجّل للاستلام</Link>
        )}
      </div>

      <div style={{ marginTop: 14, padding: '16px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 4px rgba(34,197,94,0.2)' }} />متصلون الآن
        </span>
        <span style={{ fontSize: 13, color: '#A6A8D6' }}><span dir="ltr">{online === null ? '—' : fmt(online)}</span> لاعبًا</span>
      </div>
    </nav>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('');
  const { rooms, online } = useLobby({ status: filter });
  const actions = useRoomActions();
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const [period, setPeriod] = useState('week');
  const [stats, setStats] = useState<Stats | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<Stats>('/api/stats?period=' + period).then(setStats).catch(() => setStats(null));
  }, [period]);

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (!/^PRC-[A-Za-z0-9]{4}$/.test(code.trim())) return setCodeMsg('الصيغة: PRC- متبوعة بأربعة رموز');
    setCodeMsg('');
    actions.joinCode(code);
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + '/register');
    } catch {
      /* presse-papiers indisponible */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <Header />
      <div style={{ maxWidth: 1500, margin: '0 auto', padding: 24, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <Sidebar online={online ?? stats?.online ?? null} />

        <main style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section aria-labelledby="hero-title" style={{ position: 'relative', overflow: 'hidden', borderRadius: 26, background: 'linear-gradient(120deg, #2A1B7A 0%, #1A1550 45%, #121338 100%)', border: '1px solid rgba(140,130,255,0.25)', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
            <div aria-hidden="true" style={{ position: 'absolute', insetInlineEnd: -60, top: -80, width: 420, height: 420, background: 'radial-gradient(closest-side, rgba(255,200,61,0.22), rgba(255,200,61,0))' }} />
            <div style={{ position: 'relative', padding: 36, display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center' }}>
              <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <IconCrown size={40} style={{ color: '#FFC83D' }} />
                <h1 id="hero-title" style={{ fontWeight: 900, fontSize: 'clamp(32px, 4vw, 50px)', lineHeight: 1.25 }}>العب مع أصدقائك<br /><span style={{ color: '#FFC83D' }}>وتحدَّ الجميع!</span></h1>
                <p style={{ margin: 0, maxWidth: 480, fontSize: 17, lineHeight: 1.8, color: '#D4D2F2' }}>لعبة البارتشيزي الكلاسيكية مباشرة من المتصفح، بدون تحميل. ارمِ النرد، أخرج بيادقك، وأوصلها إلى البيت قبل الجميع.</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <button type="button" className="pb-btn pb-gold pb-lg" onClick={() => actions.quick(0)} disabled={actions.busy} data-testid="play-now">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}><path d="m6 3 14 9-14 9V3z" /></svg>
                    العب الآن
                  </button>
                  <Link className="pb-btn pb-ghost pb-lg" to="/tables#create"><IconLock size={20} />أنشئ طاولة خاصة</Link>
                  <button type="button" className="pb-btn pb-ghost pb-lg" onClick={() => actions.practice(1)} disabled={actions.busy} data-testid="practice-home"><IconRobot size={20} />ضد الروبوت</button>
                </div>
                <form onSubmit={submitCode} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 440 }}>
                  <label htmlFor="lobby-code" style={{ fontSize: 13, fontWeight: 700, color: '#B4B6E4' }}>لديك رمز دعوة؟</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input id="lobby-code" dir="ltr" className="pb-input" placeholder="PRC-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} style={{ flex: '1 1 auto', textAlign: 'center', letterSpacing: '0.1em', fontWeight: 800 }} />
                    <button type="submit" className="pb-btn pb-violet" disabled={actions.busy}>انضم</button>
                  </div>
                  <span role="status" style={{ fontSize: 12, color: codeMsg || actions.error ? '#FB7185' : '#8A8CC0' }}>{codeMsg || actions.error || 'الصيغة: PRC-XXXX'}</span>
                </form>
              </div>
              <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', justifyContent: 'center' }} aria-hidden="true">
                <div style={{ width: '100%', maxWidth: 400, transform: 'rotate(3deg)', pointerEvents: 'none' }}>
                  <Board pawns={SHOWCASE_PAWNS} label="لوحة توضيحية" />
                </div>
              </div>
            </div>
          </section>

          <section aria-label="المميزات" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {[
              [<IconBolt size={22} />, 'rgba(108,71,255,0.2)', '#B9A8FF', 'مباراة سريعة', 'طاولة عامة بنقرة واحدة'],
              [<IconUsers size={22} />, 'rgba(34,197,94,0.18)', '#4ADE80', 'وضع الأصدقاء', 'أنشئ طاولتك الخاصة'],
              [<IconCrown size={22} />, 'rgba(255,200,61,0.18)', '#FFC83D', 'مكافآت', 'عملات افتراضية وخبرة'],
              [<IconShield size={22} />, 'rgba(34,211,238,0.16)', '#22D3EE', 'لعب نزيه', 'نرد عادل يتحكم فيه الخادم']
            ].map(([icon, bg, fg, title, sub]) => (
              <div key={title as string} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, background: '#14153A', border: '1px solid rgba(140,130,255,0.14)' }}>
                <span style={{ flex: 'none', width: 46, height: 46, borderRadius: '50%', background: bg as string, color: fg as string, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
                <span style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontWeight: 800 }}>{title}</span><span style={{ fontSize: 12, color: '#A6A8D6' }}>{sub}</span></span>
              </div>
            ))}
          </section>

          <section aria-labelledby="tables-title" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <h2 id="tables-title" style={{ marginInlineEnd: 'auto', fontWeight: 800, fontSize: 22 }}>الطاولات المتاحة</h2>
              <button type="button" className="pb-btn pb-violet pb-sm" onClick={() => actions.quick(0)} disabled={actions.busy}><IconBolt size={16} />انضم لطاولة عامة</button>
            </div>
            <div role="tablist" aria-label="تصفية الطاولات" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {FILTERS.map((f) => (
                <button key={f.key} type="button" role="tab" className="pb-chip" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
              ))}
            </div>
            {rooms && rooms.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {rooms.map((r) => (
                  <RoomCard key={r.id} room={r} busy={actions.busy} mine={!!user && r.players.some((p) => p.userId === user.id)} onJoin={() => actions.join(r.id)} />
                ))}
              </div>
            ) : (
              <Empty>{rooms === null ? 'جارٍ التحميل…' : 'لا توجد طاولات في هذه الفئة حاليًا. أنشئ واحدة!'}</Empty>
            )}
          </section>

          <section aria-label="القواعد" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {[
              ['5', 'إخراج بيدق', 'الرقم 5 يُخرج بيدقًا من البيت إلى خانة الانطلاق.'],
              ['6', 'رمية إضافية', 'الرقم 6 يمنحك رمية أخرى بعد التحرك.'],
              ['×', 'الأسر', 'قف على بيدق الخصم خارج خانات الأمان لتعيده إلى بيته، واربح 20 خانة.']
            ].map(([n, t, d]) => (
              <div key={n} style={{ padding: 18, borderRadius: 18, background: '#14153A', border: '1px solid rgba(140,130,255,0.14)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ flex: 'none', fontWeight: 900, fontSize: 30, color: '#FFC83D', lineHeight: 1 }}>{n}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={{ fontWeight: 800 }}>{t}</span><span style={{ fontSize: 13, lineHeight: 1.7, color: '#A6A8D6' }}>{d}</span></span>
              </div>
            ))}
          </section>
        </main>

        <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ position: 'relative', overflow: 'hidden', padding: 22, borderRadius: 22, background: 'linear-gradient(160deg, #3A2410, #1A1430 70%)', border: '1px solid rgba(255,200,61,0.45)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#FFDA5C' }}>إحصائياتي</span>
            {user ? (
              <>
                <div style={{ display: 'flex', gap: 18, justifyContent: 'center' }}>
                  <span style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontWeight: 900, fontSize: 30 }}>{user.stats.played}</span><span style={{ fontSize: 12, color: '#D4D2F2' }}>مباراة</span></span>
                  <span style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontWeight: 900, fontSize: 30, color: '#4ADE80' }}>{user.stats.wins}</span><span style={{ fontSize: 12, color: '#D4D2F2' }}>فوز</span></span>
                  <span style={{ display: 'flex', flexDirection: 'column' }}><span dir="ltr" style={{ fontWeight: 900, fontSize: 30, color: '#FFC83D' }}>{Math.round(user.stats.winRate)}%</span><span style={{ fontSize: 12, color: '#D4D2F2' }}>نسبة الفوز</span></span>
                </div>
                <Link className="pb-btn pb-gold" to="/profile" style={{ width: '100%', marginTop: 6 }}>عرض ملفي</Link>
              </>
            ) : (
              <>
                <span style={{ fontSize: 14, color: '#D4D2F2', lineHeight: 1.7 }}>أنشئ حسابًا لتتبع مبارياتك وانتصاراتك.</span>
                <Link className="pb-btn pb-gold" to="/register" style={{ width: '100%', marginTop: 6 }}>إنشاء حساب</Link>
              </>
            )}
          </div>

          <div className="panel">
            <h2 className="panel-title"><IconTrophy size={22} style={{ color: '#FFC83D' }} />آخر الانتصارات</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {stats?.recentWins.length ? stats.recentWins.map((w) => (
                <div key={w.gameId} className="pb-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, margin: '0 -8px', borderRadius: 12 }}>
                  <Avatar name={w.username} color={w.avatarColor} size={36} />
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}><span style={{ fontWeight: 700, fontSize: 14 }}>{w.username}</span><span style={{ fontSize: 12, color: '#A6A8D6' }}>{w.room}</span></span>
                  <span dir="ltr" style={{ fontWeight: 800, color: '#FFC83D' }}>+{fmt(w.payout)}</span>
                </div>
              )) : <span style={{ fontSize: 13, color: '#A6A8D6' }}>لا توجد انتصارات بعد. كن الأول!</span>}
            </div>
          </div>

          <div id="leaderboard" className="panel">
            <h2 className="panel-title"><IconCrown size={22} style={{ color: '#FFC83D' }} />ترتيب اللاعبين</h2>
            <div role="tablist" aria-label="فترة الترتيب" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: '#0F1030', marginBottom: 10 }}>
              {PERIODS.map((p) => (
                <button key={p.key} type="button" role="tab" aria-selected={period === p.key} onClick={() => setPeriod(p.key)}
                  style={{ flex: 1, height: 34, border: 0, borderRadius: 999, cursor: 'pointer', font: '700 13px Cairo, system-ui, sans-serif', background: period === p.key ? '#6C47FF' : 'transparent', color: period === p.key ? '#fff' : '#B4B6E4' }}>{p.label}</button>
              ))}
            </div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {stats?.leaderboard.length ? stats.leaderboard.map((r) => {
                const me = r.userId === user?.id;
                return (
                  <li key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 12, background: me ? 'rgba(108,71,255,0.16)' : undefined, border: me ? '1px solid rgba(140,130,255,0.35)' : '1px solid transparent' }}>
                    <span style={{ width: 20, fontWeight: 900, color: r.rank === 1 ? '#FFC83D' : r.rank <= 3 ? '#F5A524' : '#A6A8D6' }}>{r.rank}</span>
                    <Avatar name={r.username} color={r.avatarColor} size={30} />
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{r.username}</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: '#FFC83D' }}>{r.wins} فوز</span>
                  </li>
                );
              }) : <li style={{ fontSize: 13, color: '#A6A8D6' }}>لا توجد نتائج لهذه الفترة.</li>}
            </ol>
          </div>

          <div style={{ padding: 18, borderRadius: 22, background: 'linear-gradient(120deg, #4B2BD6, #2A1B7A)', border: '1px solid rgba(185,168,255,0.4)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <Gift size={44} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontWeight: 800 }}>ادعُ أصدقاءك</span><span style={{ fontSize: 12, lineHeight: 1.6, color: '#DCD6FF' }}>كل صديق جديد يحصل على 1,000 عملة افتراضية</span></span>
            <button type="button" className="pb-btn pb-gold pb-sm" onClick={copyInvite}>{copied ? 'تم النسخ ✓' : 'نسخ الرابط'}</button>
          </div>
        </aside>
      </div>
      <Footer />
    </>
  );
}
