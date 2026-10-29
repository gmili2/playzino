import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page } from '../components/AppShell';
import { IconBolt, IconKey, IconLock, IconSearch } from '../components/Icons';
import { Credits, Empty, StatusChip } from '../components/ui';
import { useAuth } from '../lib/auth';
import { COLOR_HEX } from '../lib/format';
import { useLobby, useRoomActions } from '../lib/hooks';

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
    <section style={{ flex: '1 1 300px', padding: 24, borderRadius: 24, background: highlight ? 'linear-gradient(160deg, #2A1B7A, #14153A 70%)' : '#14153A', border: '1px solid rgba(140,130,255,0.22)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={{ width: 50, height: 50, borderRadius: 14, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <div>
        <h2 style={{ fontWeight: 900, fontSize: 22 }}>{title}</h2>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#B4B6E4' }}>{sub}</p>
      </div>
      {children}
    </section>
  );
}

export function TablesPage() {
  const { user } = useAuth();
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [status, setStatus] = useState('');
  const { rooms } = useLobby({ status, q });
  const actions = useRoomActions();

  const [quickStake, setQuickStake] = useState(0);
  const [quickPlayers, setQuickPlayers] = useState(2);
  const [form, setForm] = useState({ name: '', visibility: 'PRIVATE' as 'PUBLIC' | 'PRIVATE', stake: 0, turnSeconds: 30, maxPlayers: 2 });
  const [code, setCode] = useState('');
  const [localErr, setLocalErr] = useState('');

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 3) return setLocalErr('اسم الطاولة: 3 أحرف على الأقل');
    setLocalErr('');
    actions.create({ ...form, name: form.name.trim() });
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
          <p style={{ margin: '8px 0 0', fontSize: 16, color: '#B4B6E4' }}>العب فورًا مع لاعبين من كل مكان، أو اجمع أصدقاءك حول طاولة خاصة، من لاعبَين إلى أربعة لاعبين.</p>
        </div>
        {error && <div role="alert" className="alert alert-error">{error}</div>}

        <div id="create" style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          <ActionCard highlight icon={<IconBolt size={24} style={{ color: '#FFC83D' }} />} iconBg="rgba(255,200,61,0.16)" title="طاولة عامة" sub="نضعك في أول طاولة عامة فيها مكان شاغر بنفس الرهان.">
            <Seg label="عدد اللاعبين" value={quickPlayers} options={PLAYERS} onChange={setQuickPlayers} render={playersLabel} />
            <Seg label="الرهان (عملات افتراضية)" value={quickStake} options={STAKES} onChange={setQuickStake} render={stakeLabel} />
            <button type="button" className="pb-btn pb-gold" style={{ marginTop: 'auto' }} disabled={actions.busy || quickStake > balance} onClick={() => actions.quick(quickStake, quickPlayers)}>ابحث عن طاولة</button>
          </ActionCard>

          <ActionCard icon={<IconLock size={24} style={{ color: '#F9A8D4' }} />} iconBg="rgba(244,114,182,0.16)" title="إنشاء طاولة" sub="الطاولة الخاصة لا يدخلها إلا من يملك رمز الدعوة.">
            <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label className="field"><span>اسم الطاولة</span>
                <input className="pb-input" value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="سهرة البارتشيزي" />
              </label>
              <Seg label="عدد اللاعبين" value={form.maxPlayers} options={PLAYERS} onChange={(v) => setForm({ ...form, maxPlayers: v })} render={playersLabel} />
              <Seg label="النوع" value={form.visibility} options={['PRIVATE', 'PUBLIC'] as ('PRIVATE' | 'PUBLIC')[]} onChange={(v) => setForm({ ...form, visibility: v })} render={(v) => (v === 'PRIVATE' ? 'خاصة' : 'عامة')} />
              <Seg label="الوقت لكل دور" value={form.turnSeconds} options={TURNS} onChange={(v) => setForm({ ...form, turnSeconds: v })} render={(v) => v + ' ث'} />
              <Seg label="الرهان" value={form.stake} options={STAKES} onChange={(v) => setForm({ ...form, stake: v })} render={stakeLabel} />
              <button type="submit" className="pb-btn pb-violet" disabled={actions.busy || form.stake > balance}>أنشئ الطاولة</button>
            </form>
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
              <span style={{ position: 'absolute', insetInlineStart: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A8CC0', display: 'flex' }}><IconSearch size={16} /></span>
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
                          <div style={{ fontWeight: 800, fontSize: 16 }}>{r.name}</div>
                          <div style={{ fontSize: 12, color: '#A6A8D6' }}><span dir="ltr">{r.code}</span> · {r.players.find((p) => p.userId === r.hostId)?.username} · {r.turnSeconds} ث لكل دور</div>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {Array.from({ length: r.maxPlayers }, (_, s) => {
                              const p = r.players.find((x) => x.seat === s);
                              return <span key={s} style={{ width: 22, height: 6, borderRadius: 3, background: p ? COLOR_HEX[p.color] : '#2A2B5E' }} />;
                            })}
                            <span style={{ fontSize: 13, color: '#C9CAF0' }}>{r.players.length}/{r.maxPlayers}</span>
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
