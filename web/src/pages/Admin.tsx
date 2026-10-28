import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Header } from '../components/AppShell';
import { IconActivity, IconArrowDown, IconArrowUp, IconClock, IconCoins, IconGrid, IconSearch, IconUser } from '../components/Icons';
import { Avatar, Coin, Empty, StatusChip } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmt, fmtDate, signed, TX_LABEL } from '../lib/format';

interface Overview { users: number; newUsersWeek: number; online: number; gamesToday: number; activeGames: number; creditsInCirculation: number; suspended: number; privateOpen: number; abandonsToday: number }
interface AdminUser { id: string; username: string; email: string; role: string; status: 'ACTIVE' | 'SUSPENDED'; suspendedReason: string | null; balance: number; level: number; avatarColor: string; games: number; createdAt: string }
interface AdminGame { id: string; room: { name: string; code: string; stake: number }; status: string; endReason: string | null; players: { username: string; color: string; result: string | null }[]; winner: string | null; moves: number; startedAt: string; endedAt: string | null }
interface AdminTx { id: string; type: string; amount: number; reason: string; username: string; actor: string | null; createdAt: string }
interface Audit { id: string; action: string; actor: string | null; targetType: string; targetId: string | null; details: Record<string, unknown> | null; createdAt: string }

const ACTION_LABEL: Record<string, string> = {
  'admin.user_suspend': 'إيقاف حساب', 'admin.user_reactivate': 'إعادة تفعيل', 'admin.credit_adjust': 'تعديل رصيد', 'admin.game_abort_request': 'إلغاء مباراة',
  'game.finish': 'نهاية مباراة', 'game.abort': 'إلغاء مباراة', 'auth.register': 'تسجيل', 'auth.login': 'دخول', 'auth.login_failed': 'دخول فاشل', 'auth.logout': 'خروج',
  'room.create': 'إنشاء طاولة', 'room.join': 'انضمام', 'room.leave': 'مغادرة', 'user.update_profile': 'تعديل الملف', 'user.change_password': 'تغيير كلمة المرور'
};

function Stat({ icon, color, label, value, sub }: { icon: ReactNode; color: string; label: string; value: string; sub: string }) {
  return (
    <div style={{ flex: '1 1 200px', padding: 20, borderRadius: 22, background: `linear-gradient(160deg, ${color}26, #14153A 65%)`, border: `1px solid ${color}55` }}>
      <span style={{ width: 48, height: 48, borderRadius: 14, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <div style={{ marginTop: 12, fontSize: 14, color: '#D4D2F2' }}>{label}</div>
      <div dir="ltr" style={{ fontWeight: 900, fontSize: 30, textAlign: 'end' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#A6A8D6' }}>{sub}</div>
    </div>
  );
}

/** Demande une justification (obligatoire côté serveur) avant une action sensible. */
function ReasonDialog({ title, confirm, danger, onCancel, onConfirm }: { title: string; confirm: string; danger?: boolean; onCancel: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) return setErr('السبب إلزامي (5 أحرف على الأقل)');
    try {
      await onConfirm(reason.trim());
    } catch (x) {
      setErr(errorText(x));
    }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(6,6,20,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form role="dialog" aria-modal="true" onSubmit={submit} style={{ width: '100%', maxWidth: 420, padding: 26, borderRadius: 24, background: '#14153A', border: '1px solid rgba(140,130,255,0.25)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontWeight: 900, fontSize: 21 }}>{title}</span>
        <label className="field"><span>السبب (يُسجَّل في سجل النشاطات)</span>
          <textarea className="pb-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </label>
        {err && <span className="field-error">{err}</span>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="pb-btn pb-ghost" style={{ flex: 1 }} onClick={onCancel}>إلغاء</button>
          <button type="submit" className={'pb-btn ' + (danger ? 'pb-solid-danger' : 'pb-violet')} style={{ flex: 1 }}>{confirm}</button>
        </div>
      </form>
    </div>
  );
}

export function AdminPage() {
  const { user: me, refresh } = useAuth();
  const [ov, setOv] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [games, setGames] = useState<AdminGame[]>([]);
  const [txs, setTxs] = useState<AdminTx[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<null | { title: string; confirm: string; danger?: boolean; run: (r: string) => Promise<void> }>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [o, u, g, t, a] = await Promise.all([
        api.get<Overview>('/api/admin/overview'),
        api.get<{ items: AdminUser[] }>('/api/admin/users' + (q ? '?q=' + encodeURIComponent(q) : '')),
        api.get<{ items: AdminGame[] }>('/api/admin/games'),
        api.get<{ items: AdminTx[] }>('/api/admin/transactions'),
        api.get<{ items: Audit[] }>('/api/admin/audit')
      ]);
      setOv(o); setUsers(u.items); setGames(g.items); setTxs(t.items); setAudit(a.items);
    } catch (e) {
      setError(errorText(e));
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const suspend = (u: AdminUser) =>
    setDialog({
      title: `إيقاف ${u.username}`, confirm: 'إيقاف', danger: true,
      run: async (reason) => { await api.post(`/api/admin/users/${u.id}/suspend`, { reason }); setDialog(null); load(); }
    });
  const reactivate = (u: AdminUser) =>
    setDialog({
      title: `إعادة تفعيل ${u.username}`, confirm: 'تفعيل',
      run: async (reason) => { await api.post(`/api/admin/users/${u.id}/reactivate`, { reason }); setDialog(null); load(); }
    });
  const abort = (g: AdminGame) =>
    setDialog({
      title: `إلغاء المباراة (${g.room.name})`, confirm: 'إلغاء وإعادة الرهانات', danger: true,
      run: async (reason) => { await api.post(`/api/admin/games/${g.id}/abort`, { reason }); setDialog(null); load(); }
    });

  return (
    <>
      <Header />
      <div style={{ maxWidth: 1500, margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontWeight: 900, fontSize: 28, marginInlineEnd: 'auto' }}>لوحة الإدارة</h1>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#4ADE80' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 4px rgba(34,197,94,0.2)' }} />المنصة تعمل
          </span>
          <button type="button" className="pb-btn pb-ghost pb-sm" onClick={load}>تحديث</button>
        </div>
        {error && <div role="alert" className="alert alert-error">{error}</div>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <Stat icon={<IconUser size={24} />} color="#2F6BFF" label="إجمالي المستخدمين" value={fmt(ov?.users ?? 0)} sub={`+${ov?.newUsersWeek ?? 0} هذا الأسبوع · ${ov?.suspended ?? 0} موقوف`} />
          <Stat icon={<IconActivity size={24} />} color="#22C55E" label="متصلون الآن" value={fmt(ov?.online ?? 0)} sub={`${ov?.activeGames ?? 0} مباراة جارية`} />
          <Stat icon={<IconGrid size={24} />} color="#F43F5E" label="مباريات اليوم" value={fmt(ov?.gamesToday ?? 0)} sub={`${ov?.abandonsToday ?? 0} انسحاب · ${ov?.privateOpen ?? 0} طاولة خاصة مفتوحة`} />
          <Stat icon={<IconCoins size={24} />} color="#8B5CF6" label="عملات متداولة" value={fmt(ov?.creditsInCirculation ?? 0)} sub="افتراضية · غير قابلة للصرف" />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: '999 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ fontWeight: 900, fontSize: 20, marginInlineEnd: 'auto' }}>المستخدمون</h2>
                <label style={{ position: 'relative', width: 280 }}>
                  <span style={{ position: 'absolute', insetInlineStart: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A8CC0', display: 'flex' }}><IconSearch size={16} /></span>
                  <input className="pb-input" placeholder="ابحث بالاسم أو البريد…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 42, paddingInlineStart: 40 }} />
                </label>
              </div>
              <div className="table-wrap">
                <table className="table" data-testid="admin-users">
                  <thead><tr><th>اللاعب</th><th>المستوى</th><th>المباريات</th><th>الرصيد</th><th>الحالة</th><th>إجراءات</th></tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="pb-row">
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar name={u.username} color={u.avatarColor} size={36} />
                            <span style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 800 }}>{u.username} {u.role === 'ADMIN' && <span style={{ fontSize: 11, color: '#FFC83D' }}>· مسؤول</span>}</span>
                              <span dir="ltr" style={{ fontSize: 12, color: '#A6A8D6', textAlign: 'end' }}>{u.email}</span>
                            </span>
                          </span>
                        </td>
                        <td>{u.level}</td>
                        <td>{u.games}</td>
                        <td><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 800, color: '#FFC83D' }}><Coin size={14} /><span dir="ltr">{fmt(u.balance)}</span></span></td>
                        <td>{u.status === 'ACTIVE'
                          ? <span className="badge" style={{ background: 'rgba(34,197,94,0.14)', color: '#4ADE80' }}>نشط</span>
                          : <span className="badge" title={u.suspendedReason ?? ''} style={{ background: 'rgba(244,63,94,0.14)', color: '#FB7185' }}>موقوف</span>}</td>
                        <td>
                          {u.id !== me?.id && u.role !== 'ADMIN' && (u.status === 'ACTIVE'
                            ? <button type="button" className="pb-btn pb-danger pb-sm" onClick={() => suspend(u)}>إيقاف</button>
                            : <button type="button" className="pb-btn pb-ghost pb-sm" onClick={() => reactivate(u)}>تفعيل</button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
              <h2 style={{ fontWeight: 900, fontSize: 20, padding: '18px 22px' }}>المباريات الأخيرة</h2>
              {games.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>المباراة</th><th>اللاعبون</th><th>الفائز</th><th>الحركات</th><th>البداية</th><th>الحالة</th><th /></tr></thead>
                    <tbody>
                      {games.map((g) => (
                        <tr key={g.id} className="pb-row">
                          <td><div style={{ fontWeight: 800 }}>{g.room.name}</div><div dir="ltr" style={{ fontSize: 12, color: '#A6A8D6', textAlign: 'end' }}>{g.room.code}{g.room.stake ? ` · ${g.room.stake}` : ''}</div></td>
                          <td>{g.players.map((p) => p.username).join('، ')}</td>
                          <td>{g.winner ?? '—'}</td>
                          <td>{g.moves}</td>
                          <td>{fmtDate(g.startedAt)}</td>
                          <td><StatusChip status={g.status} /></td>
                          <td>{g.status === 'ACTIVE' && <button type="button" className="pb-btn pb-danger pb-sm" onClick={() => abort(g)}>إلغاء</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div style={{ padding: '0 22px 22px' }}><Empty>لا توجد مباريات بعد.</Empty></div>}
            </section>

            <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
              <h2 style={{ fontWeight: 900, fontSize: 20, padding: '18px 22px' }}>آخر المعاملات الافتراضية</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>النوع</th><th>اللاعب</th><th>المبلغ</th><th>المصدر</th><th>الوقت</th></tr></thead>
                  <tbody>
                    {txs.map((t) => (
                      <tr key={t.id} className="pb-row">
                        <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, color: t.amount > 0 ? '#4ADE80' : '#FB7185' }}>{t.amount > 0 ? <IconArrowUp size={16} /> : <IconArrowDown size={16} />}{TX_LABEL[t.type] ?? t.type}</span></td>
                        <td style={{ fontWeight: 700 }}>{t.username}</td>
                        <td dir="ltr" style={{ fontWeight: 800, color: t.amount > 0 ? '#4ADE80' : '#FB7185', textAlign: 'end' }}>{signed(t.amount)}</td>
                        <td style={{ fontSize: 13, color: '#B4B6E4' }}>{t.reason}</td>
                        <td>{fmtDate(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div style={{ flex: '1 1 320px', maxWidth: 420, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <CreditControl users={users} onDone={async () => { await load(); await refresh(); }} />
            <section className="panel">
              <h2 className="panel-title"><IconClock size={22} />سجل النشاطات</h2>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
                {audit.map((a) => (
                  <li key={a.id} style={{ padding: '10px 0', borderTop: '1px solid rgba(140,130,255,0.08)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#A6A8D6' }}><b style={{ color: '#F4F3FF' }}>{a.actor ?? 'النظام'}</b><span>{fmtDate(a.createdAt)}</span></span>
                    <span style={{ fontSize: 14 }}>
                      {ACTION_LABEL[a.action] ?? a.action}
                      {a.details && 'reason' in a.details ? ` — ${String(a.details.reason)}` : ''}
                      {a.details && 'amount' in a.details && a.action === 'admin.credit_adjust' ? ` (${signed(Number(a.details.amount))})` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      </div>
      {dialog && <ReasonDialog title={dialog.title} confirm={dialog.confirm} danger={dialog.danger} onCancel={() => setDialog(null)} onConfirm={dialog.run} />}
    </>
  );
}

function CreditControl({ users, onDone }: { users: AdminUser[]; onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<'add' | 'sub'>('add');
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState(500);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Un identifiant par soumission : un double clic n'applique jamais deux fois l'ajustement.
  const requestId = useRef(crypto.randomUUID());
  const selected = users.find((u) => u.id === userId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return setMsg({ ok: false, text: 'اختر مستخدمًا' });
    if (reason.trim().length < 5) return setMsg({ ok: false, text: 'السبب إلزامي (5 أحرف على الأقل)' });
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post<{ balance: number }>(`/api/admin/users/${selected.id}/credits`, {
        amount: mode === 'add' ? amount : -amount, reason: reason.trim(), requestId: requestId.current
      });
      requestId.current = crypto.randomUUID();
      setMsg({ ok: true, text: `تم. الرصيد الجديد لـ ${selected.username}: ${fmt(r.balance)}` });
      setReason('');
      await onDone();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 className="panel-title"><IconCoins size={22} style={{ color: '#FFC83D' }} />التحكم في الرصيد</h2>
      <div className="seg">
        <button type="button" aria-pressed={mode === 'add'} onClick={() => setMode('add')}>إضافة</button>
        <button type="button" aria-pressed={mode === 'sub'} onClick={() => setMode('sub')}>خصم</button>
      </div>
      <label className="field"><span>اختر المستخدم</span>
        <select className="pb-input" value={userId} onChange={(e) => setUserId(e.target.value)} data-testid="credit-user">
          <option value="">—</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.username} — {fmt(u.balance)}</option>)}
        </select>
      </label>
      {selected && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 14, background: '#0F1030' }}>
          <span style={{ color: '#B4B6E4' }}>الرصيد الحالي</span><b dir="ltr" style={{ color: '#FFC83D' }}>{fmt(selected.balance)}</b>
        </div>
      )}
      <label className="field"><span>المبلغ (عملات افتراضية)</span>
        <input className="pb-input" type="number" min={1} max={100000} value={amount} onChange={(e) => setAmount(Math.max(1, Math.min(100000, Number(e.target.value) || 1)))} dir="ltr" style={{ fontSize: 20, fontWeight: 900, textAlign: 'center' }} />
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        {[100, 500, 1000, 5000].map((v) => <button key={v} type="button" className="pb-btn pb-ghost pb-sm" style={{ flex: 1, padding: 0 }} onClick={() => setAmount(v)}>{fmt(v)}</button>)}
      </div>
      <label className="field"><span>السبب (إلزامي)</span>
        <input className="pb-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="تعويض عن خلل في مباراة" />
      </label>
      <span className="hint">الحد الأقصى لكل عملية: 100,000 عملة. كل عملية تُسجَّل في المعاملات وسجل النشاطات باسم المسؤول.</span>
      {msg && <div role="status" className={'alert ' + (msg.ok ? 'alert-ok' : 'alert-error')}>{msg.text}</div>}
      <button type="submit" className="pb-btn pb-violet" disabled={busy}>{mode === 'add' ? 'إضافة الرصيد' : 'خصم الرصيد'}</button>
    </form>
  );
}
