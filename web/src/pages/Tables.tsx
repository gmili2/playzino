import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page } from '../components/AppShell';
import { IconBolt, IconKey, IconLock, IconRobot, IconSearch } from '../components/Icons';
import { Credits, Empty, StatusChip } from '../components/ui';
import { useAuth } from '../lib/auth';
import { COLOR_HEX, GAME_LABEL } from '../lib/format';
import { useLobby, useRoomActions } from '../lib/hooks';
import type { GameType } from '../lib/types';

const STAKES = [0, 50, 100, 250, 500, 1000];
const TURNS = [15, 30, 60];
const PLAYERS = [2, 3, 4];
const playersLabel = (n: number) => (n === 2 ? 'لاعبان' : `${n} لاعبين`);
const stakeLabel = (s: number) => (s === 0 ? 'مجانية' : String(s));

function Seg<T extends string | number>({ value, options, onChange, label, render }: { value: T; options: T[]; onChange: (v: T) => void; label: string; render?: (v: T) => ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={String(o)} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>{render ? render(o) : String(o)}</button>
        ))}
      </div>
    </div>
  );
}

function ActionCard({ icon, iconBg, title, sub, children, highlight }: { icon: ReactNode; iconBg: string; title: string; sub: string; children: ReactNode; highlight?: boolean }) {
  return (
    <section style={{ flex: '1 1 300px', padding: 24, borderRadius: 24, background: highlight ? 'linear-gradient(160deg, #2A1B7A, #1B1824 70%)' : '#1B1824', border: '1px solid rgba(255,222,170,0.22)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={{ width: 50, height: 50, borderRadius: 14, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <div>
        <h2 style={{ fontWeight: 900, fontSize: 22 }}>{title}</h2>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#B8B2C4' }}>{sub}</p>
      </div>
      {children}
    </section>
  );
}

/** Petite vignette de chaque jeu (sélecteur, cartes de table). */
export function GameIcon({ game, size = 46 }: { game: GameType; size?: number }) {
  if (game === 'CONNECT4') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flex: 'none' }}>
        <rect x="2" y="6" width="44" height="38" rx="8" fill="#2F6BFF" />
        {[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => {
          const fill = r === 2 && c < 3 ? (c % 2 ? '#F5C21B' : '#E5484D') : r === 1 && c === 1 ? '#E5484D' : '#0B0C24';
          return <circle key={r + '-' + c} cx={9.5 + c * 9.7} cy={15 + r * 11} r="3.8" fill={fill} />;
        }))}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flex: 'none' }}>
      <rect x="2" y="2" width="44" height="44" rx="8" fill="#FFFFFF" />
      <rect x="2" y="2" width="17" height="17" rx="6" fill="#E5484D" /><rect x="29" y="2" width="17" height="17" rx="6" fill="#F5C21B" />
      <rect x="2" y="29" width="17" height="17" rx="6" fill="#2F6BFF" /><rect x="29" y="29" width="17" height="17" rx="6" fill="#1FB57A" />
      <path d="M19 19h10v10H19z" fill="#110E17" />
    </svg>
  );
}

export function TablesPage() {
  const { user } = useAuth();
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [status, setStatus] = useState('');
  const { rooms } = useLobby({ status, q });
  const actions = useRoomActions();

  const [game, setGame] = useState<GameType>(sp.get('game') === 'CONNECT4' ? 'CONNECT4' : 'PARCHEESI');
  const c4 = game === 'CONNECT4';
  const [quickStake, setQuickStake] = useState(0);
  const [quickPlayers, setQuickPlayers] = useState(2);
  const [bots, setBots] = useState(1);
  const [form, setForm] = useState({ name: '', visibility: 'PRIVATE' as 'PUBLIC' | 'PRIVATE', stake: 0, turnSeconds: 30, maxPlayers: 2 });
  const [code, setCode] = useState('');
  const [localErr, setLocalErr] = useState('');

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 3) return setLocalErr('اسم الطاولة: 3 أحرف على الأقل');
    setLocalErr('');
    actions.create({ ...form, name: form.name.trim(), gameType: game, maxPlayers: c4 ? 2 : form.maxPlayers });
  };
  const join = (e: FormEvent) => {
    e.preventDefault();
    if (!/^PRC-[A-Za-z0-9]{4}$/.test(code.trim())) return setLocalErr('صيغة الرمز: PRC- متبوعة بأربعة رموز');
    setLocalErr('');
    actions.joinCode(code);
  };
  const balance = user?.balance ?? Infinity;
  const error = localErr || actions.error;

  return (
    <Page width={1280}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div>
          <h1 style={{ fontWeight: 900, fontSize: 'clamp(30px, 4vw, 44px)' }}>ابحث عن طاولة أو أنشئ واحدة</h1>
          <p style={{ margin: '8px 0 0', fontSize: 16, color: '#B8B2C4' }}>العب فورًا مع لاعبين من كل مكان، أو اجمع أصدقاءك حول طاولة خاصة، من لاعبَين إلى أربعة لاعبين.</p>
        </div>
        {error && <div role="alert" className="alert alert-error">{error}</div>}

        <div role="radiogroup" aria-label="اختر اللعبة" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {(['PARCHEESI', 'CONNECT4'] as GameType[]).map((g) => (
            <button
              key={g} type="button" role="radio" aria-checked={game === g} data-testid={`game-${g}`} onClick={() => setGame(g)}
              style={{
                flex: '1 1 240px', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 18, cursor: 'pointer', textAlign: 'start', color: '#F7F3EC', font: 'inherit',
                background: game === g ? 'linear-gradient(160deg, #2A1B7A, #1A1550)' : '#1B1824', border: game === g ? '2px solid #FFC83D' : '1px solid rgba(255,222,170,0.22)'
              }}
            >
              <GameIcon game={g} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 900, fontSize: 18 }}>{GAME_LABEL[g]}</span>
                <span style={{ fontSize: 13, color: '#B8B2C4' }}>{g === 'CONNECT4' ? 'لاعبان · صفّ أربع قطع لتفوز' : 'من 2 إلى 4 لاعبين · نرد وبيادق'}</span>
              </span>
            </button>
          ))}
        </div>

        <div id="create" style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          <ActionCard highlight icon={<IconBolt size={24} style={{ color: '#FFC83D' }} />} iconBg="rgba(255,200,61,0.16)" title="طاولة عامة" sub="نضعك في أول طاولة عامة فيها مكان شاغر بنفس الرهان.">
            {!c4 && <Seg label="عدد اللاعبين" value={quickPlayers} options={PLAYERS} onChange={setQuickPlayers} render={playersLabel} />}
            <Seg label="الرهان (عملات)" value={quickStake} options={STAKES} onChange={setQuickStake} render={stakeLabel} />
            <button type="button" className="pb-btn pb-gold" style={{ marginTop: 'auto' }} disabled={actions.busy || quickStake > balance} onClick={() => actions.quick(quickStake, c4 ? 2 : quickPlayers, game)}>ابحث عن طاولة</button>
          </ActionCard>

          <ActionCard icon={<IconLock size={24} style={{ color: '#F9A8D4' }} />} iconBg="rgba(244,114,182,0.16)" title="إنشاء طاولة" sub="الطاولة الخاصة لا يدخلها إلا من يملك رمز الدعوة.">
            <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label className="field"><span>اسم الطاولة</span>
                <input className="pb-input" value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={c4 ? "تحدي الأربعة" : "سهرة البارتشيزي"} />
              </label>
              {!c4 && <Seg label="عدد اللاعبين" value={form.maxPlayers} options={PLAYERS} onChange={(v) => setForm({ ...form, maxPlayers: v })} render={playersLabel} />}
              <Seg label="النوع" value={form.visibility} options={['PRIVATE', 'PUBLIC'] as ('PRIVATE' | 'PUBLIC')[]} onChange={(v) => setForm({ ...form, visibility: v })} render={(v) => (v === 'PRIVATE' ? 'خاصة' : 'عامة')} />
              <Seg label="الوقت لكل دور" value={form.turnSeconds} options={TURNS} onChange={(v) => setForm({ ...form, turnSeconds: v })} render={(v) => v + ' ث'} />
              <Seg label="الرهان" value={form.stake} options={STAKES} onChange={(v) => setForm({ ...form, stake: v })} render={stakeLabel} />
              <button type="submit" className="pb-btn pb-violet" disabled={actions.busy || form.stake > balance}>أنشئ الطاولة</button>
            </form>
          </ActionCard>

          <ActionCard icon={<IconRobot size={24} style={{ color: '#4ADE80' }} />} iconBg="rgba(34,197,94,0.16)" title="ضد الروبوت" sub="تدرّب بدون رهان ضد روبوت يلعب بنفس القواعد. لا تُحتسب في الترتيب.">
            {!c4 && <Seg label="عدد الروبوتات" value={bots} options={[1, 2, 3]} onChange={setBots} render={(n) => (n === 1 ? 'روبوت واحد' : `${n} روبوتات`)} />}
            <button type="button" className="pb-btn pb-ghost" style={{ marginTop: 'auto' }} disabled={actions.busy} onClick={() => actions.practice(c4 ? 1 : bots, game)} data-testid="practice">ابدأ التدريب</button>
          </ActionCard>

          <ActionCard icon={<IconKey size={24} style={{ color: '#22D3EE' }} />} iconBg="rgba(34,211,238,0.16)" title="الانضمام برمز" sub="أدخل الرمز الذي أرسله صديقك.">
            <form onSubmit={join} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="field"><span>رمز الدعوة</span>
                <input className="pb-input" dir="ltr" value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PRC-XXXX" style={{ textAlign: 'center', letterSpacing: '0.12em', fontWeight: 800 }} />
              </label>
              <span className="hint">الصيغة: PRC- متبوعة بأربعة رموز.</span>
              <button type="submit" className="pb-btn pb-ghost" disabled={actions.busy}>ابحث عن الطاولة</button>
            </form>
          </ActionCard>
        </div>

        <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <h2 style={{ marginInlineEnd: 'auto', fontWeight: 900, fontSize: 20 }}>جميع الطاولات العامة</h2>
            <label style={{ position: 'relative', width: 260 }}>
              <span style={{ position: 'absolute', insetInlineStart: 14, top: '50%', transform: 'translateY(-50%)', color: '#8C8698', display: 'flex' }}><IconSearch size={16} /></span>
              <input className="pb-input" aria-label="ابحث عن طاولة" placeholder="ابحث عن طاولة" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 42, paddingInlineStart: 40 }} />
            </label>
            <div role="tablist" style={{ display: 'flex', gap: 6 }}>
              {[['', 'الكل'], ['WAITING', 'في الانتظار'], ['PLAYING', 'جارية']].map(([k, l]) => (
                <button key={k} type="button" role="tab" className="pb-chip" aria-selected={status === k} onClick={() => setStatus(k)}>{l}</button>
              ))}
            </div>
          </div>
          {rooms && rooms.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>الطاولة</th><th>اللاعبون</th><th>الرهان</th><th>الحالة</th><th /></tr></thead>
                <tbody>
                  {rooms.map((r) => {
                    const mine = !!user && r.players.some((p) => p.userId === user.id);
                    const joinable = r.status === 'WAITING' && r.players.length < r.maxPlayers;
                    return (
                      <tr key={r.id} className="pb-row">
                        <td>
                          <div style={{ fontWeight: 800, fontSize: 16 }}>{r.name} <span className="badge" style={{ marginInlineStart: 6, padding: '2px 9px', fontSize: 11, background: r.gameType === 'CONNECT4' ? 'rgba(47,107,255,0.2)' : 'rgba(255,200,61,0.16)', color: r.gameType === 'CONNECT4' ? '#93B4FF' : '#FFC83D' }}>{GAME_LABEL[r.gameType]}</span></div>
                          <div style={{ fontSize: 12, color: '#A9A3B5' }}><span dir="ltr">{r.code}</span> · {r.players.find((p) => p.userId === r.hostId)?.username} · {r.turnSeconds} ث لكل دور</div>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {Array.from({ length: r.maxPlayers }, (_, s) => {
                              const p = r.players.find((x) => x.seat === s);
                              return <span key={s} style={{ width: 22, height: 6, borderRadius: 3, background: p ? COLOR_HEX[p.color] : '#2A2B5E' }} />;
                            })}
                            <span style={{ fontSize: 13, color: '#CFC9D9' }}>{r.players.length}/{r.maxPlayers}</span>
                          </span>
                        </td>
                        <td>{r.stake ? <Credits value={r.stake} /> : <span style={{ color: '#4ADE80', fontWeight: 700 }}>مجانية</span>}</td>
                        <td><StatusChip status={r.status} /></td>
                        <td style={{ textAlign: 'end' }}>
                          {mine ? <a className="pb-btn pb-ghost pb-sm" href={'/room/' + r.id}>العودة</a>
                            : joinable ? <button type="button" className="pb-btn pb-violet pb-sm" disabled={actions.busy || r.stake > balance} onClick={() => actions.join(r.id)}>انضم</button>
                            : <button type="button" className="pb-btn pb-ghost pb-sm" disabled>{r.status === 'PLAYING' ? 'جارية' : 'مكتملة'}</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '0 22px 22px' }}><Empty>{rooms === null ? 'جارٍ التحميل…' : 'لا توجد طاولات مطابقة.'}</Empty></div>
          )}
        </section>
      </div>
    </Page>
  );
}
