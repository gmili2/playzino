import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Board, SHOWCASE_PAWNS } from '../components/Board';
import { Connect4Board, SHOWCASE_C4 } from '../components/Connect4Board';
import { Footer, Header } from '../components/AppShell';
import { IconBolt, IconCrown, IconLock, IconTrophy, IconUsers, IconWheel } from '../components/Icons';
import { SHOWCASE_WHEEL, Wheel } from '../components/Wheel';
import { ModeCard } from '../components/ModeCards';
import { RoomCard } from '../components/RoomCard';
import { StakePicker, type QuickChoice } from '../components/StakePicker';
import { TaskCard } from '../components/TaskCard';
import { FloatingCoins, Sparkles, StageLights } from '../components/Casino';
import { Avatar, Empty } from '../components/ui';
import { api } from '../lib/api';
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

const SLIDE_MS = 6000;

const PARCHEESI_2: QuickChoice = { maxPlayers: 2, gameType: 'PARCHEESI', title: 'بارتشيزي · 1 ضد 1' };
const CONNECT4: QuickChoice = { maxPlayers: 2, gameType: 'CONNECT4', title: 'أربعة على التوالي · 1 ضد 1' };

/** Bannières défilantes façon Rolly : roue du jour, partie rapide, Puissance 4. */
function HeroCarousel({ busy, onQuick, onC4 }: { busy: boolean; onQuick: () => void; onC4: () => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const slides = [
    <div key="wheel" className="rl-slide rl-slide-purple">
      <div>
        <h2>عجلة <em>الحظ</em></h2>
        <p>أدر العجلة واربح حتى {fmt(Math.max(...SHOWCASE_WHEEL))} عملة لتلعب بها!</p>
        <Link to="/wheel" className="pb-btn pb-gold pb-lg" data-testid="hero-wheel">أدر العجلة <IconWheel size={20} /></Link>
      </div>
      <div className="rl-slide-art" style={{ maxWidth: 230, marginInline: 'auto', width: '100%' }}><Wheel segments={SHOWCASE_WHEEL} rotation={-22} /></div>
    </div>,
    <div key="quick" className="rl-slide rl-slide-gold">
      <div>
        <h2>تحدَّ <em>الجميع</em></h2>
        <p>بارتشيزي مباشرة من المتصفح: ارمِ النرد وأوصل بيادقك الأربعة إلى البيت قبل الخصوم.</p>
        <button type="button" className="pb-btn pb-gold pb-lg" onClick={onQuick} disabled={busy} data-testid="play-now">العب الآن</button>
      </div>
      <div className="rl-slide-art" style={{ maxWidth: 240, marginInline: 'auto', width: '100%', transform: 'rotate(4deg)' }}><Board pawns={SHOWCASE_PAWNS} label="لوحة توضيحية" /></div>
    </div>,
    <div key="c4" className="rl-slide rl-slide-blue">
      <div>
        <h2>أربعة على <em>التوالي</em></h2>
        <p>أسقط قطعك وصُفّ أربعًا أفقيًا أو عموديًا أو قطريًا قبل خصمك.</p>
        <button type="button" className="pb-btn pb-gold pb-lg" onClick={onC4} disabled={busy}>العب الآن</button>
      </div>
      <div className="rl-slide-art" style={{ maxWidth: 240, marginInline: 'auto', width: '100%' }}><Connect4Board board={SHOWCASE_C4} label="لوحة توضيحية" /></div>
    </div>
  ];
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [paused, slides.length]);
  return (
    <section aria-roledescription="carrousel" aria-label="العروض" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="rl-hero"><StageLights beams={3} />{slides[i]}<FloatingCoins count={5} /><Sparkles count={10} /></div>
      <div className="rl-dots">
        {slides.map((_, k) => <button key={k} type="button" aria-label={`العرض ${k + 1}`} aria-current={i === k} onClick={() => { setI(k); setPaused(true); }} />)}
      </div>
    </section>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('');
  const { rooms, online } = useLobby({ status: filter });
  const actions = useRoomActions();
  const [pick, choose] = useState<QuickChoice | null>(null);
  // Visiteur non connecté : pas de mise à choisir, la partie rapide le renvoie vers la connexion.
  const setPick = (c: QuickChoice | null) => (c && !user ? actions.quick(0, c.maxPlayers, c.gameType) : choose(c));
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const [period, setPeriod] = useState('week');
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.get<Stats>('/api/stats?period=' + period).then(setStats).catch(() => setStats(null));
  }, [period]);

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (!/^PRC-[A-Za-z0-9]{4}$/.test(code.trim())) return setCodeMsg('الصيغة: PRC- متبوعة بأربعة رموز');
    setCodeMsg('');
    actions.joinCode(code);
  };


  return (
    <>
      <Header />
      <div style={{ maxWidth: 1500, margin: '0 auto', padding: 24, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>

        <main style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <HeroCarousel busy={actions.busy} onQuick={() => setPick(PARCHEESI_2)} onC4={() => setPick(CONNECT4)} />
          {actions.error && <div role="alert" className="alert alert-error">{actions.error}</div>}

          <section aria-label="بارتشيزي" className="md-grid">
            <ModeCard variant="friend" title="العب مع صديق" sub="أنشئ طاولة خاصة وادعُ أصدقاءك" to="/tables#create" testId="mode-friend" />
            <ModeCard variant="duel" title="1 ضد 1" sub="مباراة كلاسيكية بين لاعبَين" onClick={() => setPick(PARCHEESI_2)} disabled={actions.busy} testId="mode-duel" />
            <ModeCard variant="team" title="فريق ضد فريق" sub="تحالف مع زميل واهزم الفريق الآخر" disabled tag="قريبًا" testId="mode-team" />
            <ModeCard variant="four" title="4 لاعبين" sub="كل لاعب لنفسه — أول من يوصل بيادقه يفوز" onClick={() => setPick({ maxPlayers: 4, gameType: 'PARCHEESI', title: 'بارتشيزي · 4 لاعبين' })} disabled={actions.busy} testId="mode-four" />
          </section>

          <section aria-label="أنماط اللعب" className="rl-modes">
            <button type="button" className="rl-mode" style={{ background: 'radial-gradient(160px 120px at 50% 30%, rgba(80,170,255,.3), transparent), linear-gradient(180deg,#132B4A,#0E1220)' }} onClick={() => setPick(CONNECT4)} disabled={actions.busy}>
              <span className="rl-mode-art" style={{ inset: '12px 24% 48% 24%' }}><Connect4Board board={SHOWCASE_C4} label="" /></span>
              <b>أربعة على التوالي</b><small>1 ضد 1</small>
            </button>
            <Link to="/wheel" className="rl-mode" style={{ background: 'radial-gradient(160px 120px at 50% 30%, rgba(242,178,50,.35), transparent), linear-gradient(180deg,#3A2410,#1A120A)' }}>
              <span className="rl-mode-art" style={{ inset: '12px 26% 48% 26%' }}><Wheel segments={SHOWCASE_WHEEL} /></span>
              <b>عجلة الحظ</b><small>اربح حتى {fmt(Math.max(...SHOWCASE_WHEEL))} عملة</small>
            </Link>
          </section>

          <form onSubmit={submitCode} className="panel" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 16 }}>
            <label htmlFor="lobby-code" style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><IconLock size={18} style={{ color: '#F2B232' }} />لديك رمز دعوة؟</label>
            <input id="lobby-code" dir="ltr" className="pb-input" placeholder="PRC-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} style={{ flex: '1 1 160px', maxWidth: 260, textAlign: 'center', letterSpacing: '0.1em', fontWeight: 800 }} />
            <button type="submit" className="pb-btn pb-gold" disabled={actions.busy}>انضم</button>
            {codeMsg && <span role="status" style={{ fontSize: 12, color: '#FB7185' }}>{codeMsg}</span>}
          </form>

          <section aria-labelledby="tables-title" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <h2 id="tables-title" style={{ fontWeight: 800, fontSize: 22 }}>الطاولات المتاحة</h2>
              <span style={{ marginInlineEnd: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#A9A3B5' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 4px rgba(34,197,94,0.2)' }} /><span dir="ltr">{fmt(online ?? stats?.online ?? 0)}</span> متصل الآن</span>
              <button type="button" className="pb-btn pb-violet pb-sm" onClick={() => setPick(PARCHEESI_2)} disabled={actions.busy}><IconBolt size={16} />انضم لطاولة عامة</button>
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
              <div key={n} style={{ padding: 18, borderRadius: 18, background: '#1B1824', border: '1px solid rgba(255,222,170,0.14)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ flex: 'none', fontWeight: 900, fontSize: 30, color: '#FFC83D', lineHeight: 1 }}>{n}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={{ fontWeight: 800 }}>{t}</span><span style={{ fontSize: 13, lineHeight: 1.7, color: '#A9A3B5' }}>{d}</span></span>
              </div>
            ))}
          </section>
        </main>

        <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ position: 'relative', overflow: 'hidden', padding: 22, borderRadius: 22, background: 'linear-gradient(160deg, #3A2410, #221A2E 70%)', border: '1px solid rgba(255,200,61,0.45)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#FFDA5C' }}>إحصائياتي</span>
            {user ? (
              <>
                <div style={{ display: 'flex', gap: 18, justifyContent: 'center' }}>
                  <span style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontWeight: 900, fontSize: 30 }}>{user.stats.played}</span><span style={{ fontSize: 12, color: '#DAD5E2' }}>مباراة</span></span>
                  <span style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontWeight: 900, fontSize: 30, color: '#4ADE80' }}>{user.stats.wins}</span><span style={{ fontSize: 12, color: '#DAD5E2' }}>فوز</span></span>
                  <span style={{ display: 'flex', flexDirection: 'column' }}><span dir="ltr" style={{ fontWeight: 900, fontSize: 30, color: '#FFC83D' }}>{Math.round(user.stats.winRate)}%</span><span style={{ fontSize: 12, color: '#DAD5E2' }}>نسبة الفوز</span></span>
                </div>
                <Link className="pb-btn pb-gold" to="/profile" style={{ width: '100%', marginTop: 6 }}>عرض ملفي</Link>
              </>
            ) : (
              <>
                <span style={{ fontSize: 14, color: '#DAD5E2', lineHeight: 1.7 }}>أنشئ حسابًا لتتبع مبارياتك وانتصاراتك.</span>
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
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}><span style={{ fontWeight: 700, fontSize: 14 }}>{w.username}</span><span style={{ fontSize: 12, color: '#A9A3B5' }}>{w.room}</span></span>
                  <span dir="ltr" style={{ fontWeight: 800, color: '#FFC83D' }}>+{fmt(w.payout)}</span>
                </div>
              )) : <span style={{ fontSize: 13, color: '#A9A3B5' }}>لا توجد انتصارات بعد. كن الأول!</span>}
            </div>
          </div>

          <div id="leaderboard" className="panel">
            <h2 className="panel-title"><IconCrown size={22} style={{ color: '#FFC83D' }} />ترتيب اللاعبين</h2>
            <div role="tablist" aria-label="فترة الترتيب" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: '#110E17', marginBottom: 10 }}>
              {PERIODS.map((p) => (
                <button key={p.key} type="button" role="tab" aria-selected={period === p.key} onClick={() => setPeriod(p.key)}
                  style={{ flex: 1, height: 34, border: 0, borderRadius: 999, cursor: 'pointer', font: '700 13px Cairo, system-ui, sans-serif', background: period === p.key ? 'linear-gradient(180deg,#FFDA6B,#F2B232)' : 'transparent', color: period === p.key ? '#2B1A00' : '#B8B2C4' }}>{p.label}</button>
              ))}
            </div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {stats?.leaderboard.length ? stats.leaderboard.map((r) => {
                const me = r.userId === user?.id;
                return (
                  <li key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 12, background: me ? 'rgba(139,92,246,0.16)' : undefined, border: me ? '1px solid rgba(255,222,170,0.35)' : '1px solid transparent' }}>
                    <span style={{ width: 20, fontWeight: 900, color: r.rank === 1 ? '#FFC83D' : r.rank <= 3 ? '#F5A524' : '#A9A3B5' }}>{r.rank}</span>
                    <Avatar name={r.username} color={r.avatarColor} size={30} />
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{r.username}</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: '#FFC83D' }}>{r.wins} فوز</span>
                  </li>
                );
              }) : <li style={{ fontSize: 13, color: '#A9A3B5' }}>لا توجد نتائج لهذه الفترة.</li>}
            </ol>
          </div>

          {user && !user.phone && (
            <Link to="/profile" className="alert alert-error" style={{ textDecoration: 'none' }}>أضف رقم هاتفك في حسابك ليتعرّف عليك فريق الدعم عند الإيداع والسحب ←</Link>
          )}
          <TaskCard />
        </aside>
      </div>
      <StakePicker
        choice={pick}
        balance={user?.balance ?? 0}
        busy={actions.busy}
        onClose={() => choose(null)}
        onPick={(stake) => {
          if (!pick) return;
          choose(null); // une erreur éventuelle (solde, table déjà rejointe) s'affiche sur la page
          actions.quick(stake, pick.maxPlayers, pick.gameType);
        }}
      />
      <Footer />
    </>
  );
}
