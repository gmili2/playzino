import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../components/AppShell';
import { IconCrown } from '../components/Icons';
import { Avatar, Coin, Empty } from '../components/ui';
import { api, errorText, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth';
import { COLOR_HEX, COLOR_NAME, fmt, fmtDate, fmtMonth, signed, TX_LABEL } from '../lib/format';
import type { Me } from '../lib/types';

interface HistoryItem {
  gameId: string;
  room: { name: string; code: string; stake: number };
  color: string;
  result: 'WIN' | 'LOSS' | null;
  payout: number;
  status: string;
  endReason: string | null;
  startedAt: string;
  endedAt: string | null;
  opponents: string[];
}
interface Tx { id: string; type: string; amount: number; balanceAfter: number; reason: string; createdAt: string }

const AVATAR_COLORS = ['#2F6BFF', '#E5484D', '#1FB57A', '#F5C21B', '#8B5CF6', '#22D3EE'];

function StatCard({ label, value, color, border, bg }: { label: string; value: string; color: string; border: string; bg: string }) {
  return (
    <div style={{ flex: '1 1 160px', padding: '18px 20px', borderRadius: 20, background: bg, border: `1px solid ${border}` }}>
      <div style={{ fontSize: 14, color: '#D4D2F2' }}>{label}</div>
      <div dir="ltr" style={{ fontWeight: 900, fontSize: 34, color, textAlign: 'end' }}>{value}</div>
    </div>
  );
}

function Toggle({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontWeight: 800 }}>{label}</span><span style={{ fontSize: 13, color: '#A6A8D6' }}>{sub}</span></span>
      <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
    </div>
  );
}

export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [tab, setTab] = useState<'games' | 'wallet'>('games');

  useEffect(() => {
    api.get<{ items: HistoryItem[] }>('/api/me/games?take=30').then((r) => setHistory(r.items)).catch(() => setHistory([]));
    api.get<{ items: Tx[] }>('/api/wallet?take=50').then((r) => setTxs(r.items)).catch(() => setTxs([]));
  }, [user?.balance]);

  if (!user) return null;
  const pct = Math.round((user.profile.xpInLevel / user.profile.xpForLevel) * 100);

  return (
    <Page width={1280}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section style={{ padding: 24, borderRadius: 24, background: 'linear-gradient(170deg, #2A1B7A, #14153A 60%)', border: '1px solid rgba(140,130,255,0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <div style={{ position: 'relative' }}>
              <IconCrown size={30} style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', color: '#FFC83D', zIndex: 1 }} />
              <Avatar name={user.username} color={user.profile.avatarColor} size={112} style={{ boxShadow: '0 0 0 4px #14153A, 0 0 0 7px #FFC83D' }} />
            </div>
            <h1 style={{ fontWeight: 900, fontSize: 26 }}>{user.username}</h1>
            <span style={{ fontSize: 14, color: '#D4D2F2' }}>المستوى {user.profile.level} · عضو منذ {fmtMonth(user.createdAt)}</span>
            {user.role === 'ADMIN' && <span className="badge" style={{ background: 'rgba(255,200,61,0.16)', color: '#FFC83D' }}>مسؤول</span>}
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#B4B6E4', marginTop: 6 }}>
              <span>التقدم نحو المستوى {user.profile.level + 1}</span>
              <span dir="ltr">{fmt(user.profile.xpInLevel)} / {fmt(user.profile.xpForLevel)} XP</span>
            </div>
            <div style={{ width: '100%', height: 10, borderRadius: 5, background: '#0F1030', overflow: 'hidden' }}>
              <div style={{ width: pct + '%', height: '100%', marginInlineStart: 0, background: 'linear-gradient(90deg,#6C47FF,#B9A8FF)' }} />
            </div>
            <div style={{ width: '100%', marginTop: 8, padding: 16, borderRadius: 18, background: '#0F1030', border: '1px solid rgba(255,200,61,0.35)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <Coin size={40} />
              <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'start' }}>
                <span style={{ fontSize: 13, color: '#B4B6E4' }}>رصيدي</span>
                <span dir="ltr" data-testid="profile-balance" style={{ fontWeight: 900, fontSize: 26, color: '#FFC83D' }}>{fmt(user.balance)}</span>
                <span style={{ fontSize: 12, color: '#8A8CC0' }}>عملات افتراضية · بلا قيمة مالية</span>
              </span>
            </div>
          </section>
          <Settings user={user} onSaved={setUser} onLogout={async () => { await logout(); nav('/'); }} />
        </div>

        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <StatCard label="المباريات" value={String(user.stats.played)} color="#F4F3FF" border="rgba(47,107,255,0.4)" bg="linear-gradient(160deg,#16205A,#14153A)" />
            <StatCard label="الانتصارات" value={String(user.stats.wins)} color="#4ADE80" border="rgba(34,197,94,0.4)" bg="linear-gradient(160deg,#0F3A2A,#14153A)" />
            <StatCard label="الخسائر" value={String(user.stats.losses)} color="#FB7185" border="rgba(244,63,94,0.4)" bg="linear-gradient(160deg,#3A1424,#14153A)" />
            <StatCard label="نسبة الفوز" value={user.stats.winRate + '%'} color="#FFC83D" border="rgba(255,200,61,0.45)" bg="linear-gradient(160deg,#3A2A10,#14153A)" />
          </div>

          <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div role="tablist" style={{ display: 'flex', gap: 6 }}>
                <button type="button" role="tab" className="pb-chip" aria-selected={tab === 'games'} onClick={() => setTab('games')}>آخر المباريات</button>
                <button type="button" role="tab" className="pb-chip" aria-selected={tab === 'wallet'} onClick={() => setTab('wallet')}>سجل المحفظة</button>
              </div>
            </div>
            {tab === 'games' ? (
              history && history.length ? (
                <div className="table-wrap">
                  <table className="table" data-testid="history">
                    <thead><tr><th>التاريخ</th><th>الطاولة</th><th>الخصوم</th><th>اللون</th><th>النتيجة</th><th>العملات</th></tr></thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.gameId} className="pb-row">
                          <td>{fmtDate(h.endedAt ?? h.startedAt)}</td>
                          <td style={{ fontWeight: 800 }}>{h.room.name}</td>
                          <td>{h.opponents.join('، ')}</td>
                          <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_HEX[h.color] }} />{COLOR_NAME[h.color]}</span></td>
                          <td>
                            {h.status === 'ABORTED' ? <span className="badge" style={{ background: 'rgba(140,130,255,0.14)', color: '#B4B6E4' }}>ملغاة</span>
                              : h.result === 'WIN' ? <span className="badge" style={{ background: 'rgba(34,197,94,0.14)', color: '#4ADE80' }}>فوز</span>
                              : <span className="badge" style={{ background: 'rgba(244,63,94,0.14)', color: '#FB7185' }}>خسارة</span>}
                          </td>
                          <td dir="ltr" style={{ fontWeight: 800, color: h.payout ? '#FFC83D' : '#A6A8D6', textAlign: 'end' }}>{h.payout ? '+' + fmt(h.payout) : h.room.stake ? '-' + fmt(h.room.stake) : '0'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div style={{ padding: '0 22px 22px' }}><Empty>{history === null ? 'جارٍ التحميل…' : 'لم تلعب أي مباراة بعد.'}</Empty></div>
            ) : txs && txs.length ? (
              <div className="table-wrap">
                <table className="table" data-testid="transactions">
                  <thead><tr><th>التاريخ</th><th>النوع</th><th>التفاصيل</th><th>المبلغ</th><th>الرصيد بعدها</th></tr></thead>
                  <tbody>
                    {txs.map((t) => (
                      <tr key={t.id} className="pb-row">
                        <td>{fmtDate(t.createdAt)}</td>
                        <td style={{ fontWeight: 800 }}>{TX_LABEL[t.type] ?? t.type}</td>
                        <td style={{ color: '#B4B6E4', fontSize: 13 }}>{t.reason}</td>
                        <td dir="ltr" style={{ fontWeight: 800, color: t.amount > 0 ? '#4ADE80' : '#FB7185', textAlign: 'end' }}>{signed(t.amount)}</td>
                        <td dir="ltr" style={{ textAlign: 'end' }}>{fmt(t.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div style={{ padding: '0 22px 22px' }}><Empty>{txs === null ? 'جارٍ التحميل…' : 'لا توجد معاملات.'}</Empty></div>}
          </section>
        </div>
      </div>
    </Page>
  );
}

function Settings({ user, onSaved, onLogout }: { user: Me; onSaved: (u: Me) => void; onLogout: () => void }) {
  const [form, setForm] = useState({
    username: user.username, email: user.email, avatarColor: user.profile.avatarColor,
    soundEnabled: user.profile.soundEnabled, invitesEnabled: user.profile.invitesEnabled, hideOnline: user.profile.hideOnline
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErrors({});
    try {
      const r = await api.patch<{ user: Me }>('/api/me', form);
      onSaved(r.user);
      setMsg({ ok: true, text: 'تم حفظ التغييرات' });
    } catch (err) {
      setErrors(fieldErrors(err));
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/api/me/password', pw);
      setPw({ currentPassword: '', newPassword: '' });
      setMsg({ ok: true, text: 'تم تغيير كلمة المرور وتسجيل الخروج من الأجهزة الأخرى' });
    } catch (err) {
      setMsg({ ok: false, text: fieldErrors(err).newPassword ? '8 أحرف على الأقل' : errorText(err) });
    }
  };

  return (
    <section className="panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h2 style={{ fontWeight: 900, fontSize: 22 }}>إعدادات الحساب</h2>
      {msg && <div role="status" className={'alert ' + (msg.ok ? 'alert-ok' : 'alert-error')}>{msg.text}</div>}
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label className="field"><span>اسم المستخدم</span>
          <input className="pb-input" dir="ltr" value={form.username} aria-invalid={!!errors.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <span className={errors.username ? 'field-error' : 'hint'}>{errors.username ?? 'من 3 إلى 16 حرفًا لاتينيًا أو رقمًا، مع . أو - أو _'}</span>
        </label>
        <label className="field"><span>البريد الإلكتروني</span>
          <input className="pb-input" dir="ltr" type="email" value={form.email} aria-invalid={!!errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
        <div className="field"><span>لون الصورة الرمزية</span>
          <div style={{ display: 'flex', gap: 10 }}>
            {AVATAR_COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} aria-pressed={form.avatarColor === c} onClick={() => setForm({ ...form, avatarColor: c })}
                style={{ width: 32, height: 32, borderRadius: '50%', border: 0, cursor: 'pointer', background: c, boxShadow: form.avatarColor === c ? '0 0 0 3px #14153A, 0 0 0 5px #fff' : undefined }} />
            ))}
          </div>
        </div>
        <div style={{ height: 1, background: 'rgba(140,130,255,0.14)' }} />
        <Toggle label="أصوات اللعبة" sub="النرد، التحركات والأسر" checked={form.soundEnabled} onChange={(v) => setForm({ ...form, soundEnabled: v })} />
        <Toggle label="دعوات المباريات" sub="استقبال دعوات أصدقائك" checked={form.invitesEnabled} onChange={(v) => setForm({ ...form, invitesEnabled: v })} />
        <Toggle label="إخفاء حالة الاتصال" sub="لن يراك أصدقاؤك متصلًا" checked={form.hideOnline} onChange={(v) => setForm({ ...form, hideOnline: v })} />
        <button type="submit" className="pb-btn pb-gold" disabled={busy} style={{ alignSelf: 'flex-start' }}>حفظ التغييرات</button>
      </form>
      <div style={{ height: 1, background: 'rgba(140,130,255,0.14)' }} />
      <form onSubmit={changePw} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontWeight: 800 }}>تغيير كلمة المرور</span>
        <input className="pb-input" type="password" dir="ltr" autoComplete="current-password" placeholder="كلمة المرور الحالية" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        <input className="pb-input" type="password" dir="ltr" autoComplete="new-password" placeholder="كلمة المرور الجديدة" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
        <button type="submit" className="pb-btn pb-ghost pb-sm" disabled={!pw.currentPassword || !pw.newPassword} style={{ alignSelf: 'flex-start' }}>تحديث</button>
      </form>
      <div style={{ height: 1, background: 'rgba(140,130,255,0.14)' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#A6A8D6' }}>متصل على هذا الجهاز</span>
        <button type="button" className="pb-btn pb-danger pb-sm" data-testid="logout" onClick={onLogout}>تسجيل الخروج</button>
      </div>
    </section>
  );
}
