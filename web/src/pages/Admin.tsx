import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconActivity, IconArrowDown, IconArrowUp, IconChevron, IconClock, IconCoins, IconCrown, IconDice, IconHome, IconList, IconLock, IconLogout, IconMenu, IconPlus, IconRobot, IconSearch, IconSettings, IconShield, IconUsers, IconWheel } from '../components/Icons';
import { Wheel } from '../components/Wheel';
import { Avatar, Coin, Empty, StatusChip } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmt, fmtDate, GAME_LABEL, signed, TX_LABEL } from '../lib/format';

interface Overview { users: number; newUsersWeek: number; online: number; gamesToday: number; activeGames: number; creditsInCirculation: number; suspended: number; privateOpen: number; abandonsToday: number }
interface AdminUser { id: string; username: string; email: string; role: string; status: 'ACTIVE' | 'SUSPENDED'; suspendedReason: string | null; balance: number; level: number; avatarColor: string; games: number; createdAt: string }
interface AdminGame { id: string; room: { name: string; code: string; stake: number; gameType?: string }; status: string; endReason: string | null; players: { username: string; color: string; result: string | null }[]; winner: string | null; moves: number; startedAt: string; endedAt: string | null }
interface AdminTx { id: string; type: string; amount: number; reason: string; username: string; actor: string | null; createdAt: string }
interface Audit { id: string; action: string; actor: string | null; targetType: string; targetId: string | null; details: Record<string, unknown> | null; createdAt: string }

const ACTION_LABEL: Record<string, string> = {
  'admin.user_suspend': 'إيقاف حساب', 'admin.user_reactivate': 'إعادة تفعيل', 'admin.credit_adjust': 'تعديل رصيد', 'admin.game_abort_request': 'إلغاء مباراة', 'admin.bot_level': 'مستوى الروبوت', 'admin.wheel': 'تعديل عجلة الحظ',
  'game.finish': 'نهاية مباراة', 'game.abort': 'إلغاء مباراة', 'auth.register': 'تسجيل', 'auth.login': 'دخول', 'auth.login_failed': 'دخول فاشل', 'auth.logout': 'خروج',
  'room.create': 'إنشاء طاولة', 'room.join': 'انضمام', 'room.leave': 'مغادرة', 'user.update_profile': 'تعديل الملف', 'user.change_password': 'تغيير كلمة المرور'
};

function Stat({ icon, color, label, value, sub }: { icon: ReactNode; color: string; label: string; value: string; sub: string }) {
  return (
    <div className="ad-stat" style={{ background: `linear-gradient(160deg, ${color}38, ${color}10 55%, #15121D)`, borderColor: `${color}66` }}>
      <span className="ad-stat-icon" style={{ background: `linear-gradient(180deg, ${color}, ${color}BB)` }}>{icon}</span>
      <div className="ad-stat-label">{label}</div>
      <div dir="ltr" className="ad-stat-value">{value}</div>
      <div className="ad-stat-sub">{sub}</div>
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
      <form role="dialog" aria-modal="true" onSubmit={submit} style={{ width: '100%', maxWidth: 420, padding: 26, borderRadius: 24, background: '#1B1824', border: '1px solid rgba(255,222,170,0.25)', display: 'flex', flexDirection: 'column', gap: 12 }}>
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

type View = 'dashboard' | 'users' | 'credits' | 'games' | 'transactions' | 'wheel' | 'settings' | 'audit';

const NAV: [View, ReactNode, string][] = [
  ['dashboard', <IconHome size={22} />, 'لوحة التحكم'],
  ['users', <IconUsers size={22} />, 'المستخدمون'],
  ['credits', <IconCoins size={22} />, 'التحكم في الرصيد'],
  ['transactions', <IconList size={22} />, 'سجل المعاملات'],
  ['games', <IconDice size={22} />, 'المباريات'],
  ['wheel', <IconWheel size={22} />, 'عجلة الحظ'],
  ['settings', <IconSettings size={22} />, 'الإعدادات'],
  ['audit', <IconClock size={22} />, 'سجل النشاطات']
];

/** Mini-statistiques en bas du tableau de bord, comme « إحصائيات سريعة ». */
function QuickStats({ games, txs }: { games: AdminGame[]; txs: AdminTx[] }) {
  const wheel = txs.filter((t) => t.type === 'DAILY_BONUS');
  const bestWin = txs.filter((t) => t.type === 'WIN').sort((a, b) => b.amount - a.amount)[0];
  const c4 = games.filter((g) => g.room.gameType === 'CONNECT4').length;
  const items: [string, string, string, string][] = [
    ['#16A34A', 'أكبر ربح في مباراة', bestWin ? signed(bestWin.amount) : '—', bestWin ? `من طرف ${bestWin.username}` : ''],
    ['#DC2626', 'مباريات ملغاة', String(games.filter((g) => g.status === 'ABORTED').length), 'ضمن آخر المباريات'],
    ['#7C3AED', 'اللعبة الأكثر لعبًا', c4 > games.length / 2 ? GAME_LABEL.CONNECT4 : GAME_LABEL.PARCHEESI, `${games.length ? Math.round((Math.max(c4, games.length - c4) / games.length) * 100) : 0}% من المباريات`],
    ['#2563EB', 'دورات العجلة', String(wheel.length), `${fmt(wheel.reduce((s, t) => s + t.amount, 0))} عملة موزعة`]
  ];
  return (
    <section className="panel">
      <h2 className="panel-title"><IconActivity size={22} style={{ color: '#F2B232' }} />إحصائيات سريعة</h2>
      <div className="ad-quick">
        {items.map(([color, label, value, sub]) => (
          <div key={label} style={{ background: `linear-gradient(160deg, ${color}40, ${color}12)`, borderColor: `${color}66` }}>
            <span>{label}</span><b>{value}</b><small>{sub}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

interface WheelAdmin { segments: { amount: number; weight: number }[]; spinsToday: number; coinsToday: number; recent: { id: string; username: string; amount: number; createdAt: string }[] }

/** Réglages de la roue : gain et chance de chaque case, aperçu, tours du jour. */
function WheelControl() {
  const [data, setData] = useState<WheelAdmin | null>(null);
  const [segs, setSegs] = useState<{ amount: number; weight: number }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get<WheelAdmin>('/api/admin/settings/wheel').then((d) => { setData(d); setSegs(d.segments); }, (e) => setMsg({ ok: false, text: errorText(e) }));
  useEffect(() => { load(); }, []);

  const total = segs.reduce((s, x) => s + x.weight, 0);
  const expected = total ? segs.reduce((s, x) => s + x.amount * x.weight, 0) / total : 0;
  const setSeg = (i: number, k: 'amount' | 'weight', v: number) => setSegs(segs.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.put('/api/admin/settings/wheel', { segments: segs });
      setMsg({ ok: true, text: 'تم حفظ العجلة: تُطبَّق على الدورات القادمة.' });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  if (!data) return msg ? <div role="alert" className="alert alert-error">{msg.text}</div> : <Empty>جارٍ التحميل…</Empty>;
  return (
    <div className="ad-grid">
      <section className="panel ad-col" style={{ gap: 14 }}>
        <h2 className="panel-title"><IconWheel size={22} style={{ color: '#F2B232' }} />خانات العجلة</h2>
        <span className="hint">لكل خانة: عدد العملات التي تُربح، ووزنها (كلما كبر الوزن زادت فرصة ظهورها). من {4} إلى {12} خانة.</span>
        <div className="table-wrap">
          <table className="table" data-testid="wheel-admin">
            <thead><tr><th>#</th><th>الربح (عملة)</th><th>الوزن</th><th>الاحتمال</th><th /></tr></thead>
            <tbody>
              {segs.map((s, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><input className="pb-input" type="number" min={1} max={100000} dir="ltr" value={s.amount} onChange={(e) => setSeg(i, 'amount', Math.max(1, Math.min(100000, Math.round(Number(e.target.value) || 1))))} style={{ height: 40, width: 120 }} /></td>
                  <td><input className="pb-input" type="number" min={0} max={1000} dir="ltr" value={s.weight} onChange={(e) => setSeg(i, 'weight', Math.max(0, Math.min(1000, Math.round(Number(e.target.value) || 0))))} style={{ height: 40, width: 100 }} /></td>
                  <td dir="ltr" style={{ fontWeight: 800, color: '#FFD866', textAlign: 'end' }}>{total ? ((s.weight / total) * 100).toFixed(1) : '0'}%</td>
                  <td><button type="button" className="pb-btn pb-danger pb-sm" disabled={segs.length <= 4} onClick={() => setSegs(segs.filter((_, j) => j !== i))}>حذف</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <button type="button" className="pb-btn pb-ghost pb-sm" disabled={segs.length >= 12} onClick={() => setSegs([...segs, { amount: 10, weight: 10 }])}><IconPlus size={16} />إضافة خانة</button>
          <span className="hint" style={{ marginInlineEnd: 'auto' }}>متوسط الربح لكل دورة: <b dir="ltr" style={{ color: '#FFD866' }}>{expected.toFixed(1)}</b> عملة</span>
          <button type="button" className="pb-btn pb-ghost pb-sm" onClick={() => setSegs(data.segments)} disabled={busy}>إلغاء</button>
          <button type="button" className="pb-btn pb-gold" onClick={save} disabled={busy || total === 0}>حفظ العجلة</button>
        </div>
        {total === 0 && <div className="alert alert-error">يجب أن يكون لخانة واحدة على الأقل وزن أكبر من 0.</div>}
        {msg && <div role="status" className={'alert ' + (msg.ok ? 'alert-ok' : 'alert-error')}>{msg.text}</div>}
      </section>
      <div className="ad-col ad-col-side">
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <h2 className="panel-title" style={{ alignSelf: 'stretch' }}>معاينة</h2>
          <div style={{ width: '100%', maxWidth: 300 }}><Wheel segments={segs.map((s) => s.amount)} /></div>
          <div className="ad-quick" style={{ width: '100%', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ background: 'linear-gradient(160deg,#2563EB40,#2563EB12)', borderColor: '#2563EB66' }}><span>دورات اليوم</span><b>{fmt(data.spinsToday)}</b></div>
            <div style={{ background: 'linear-gradient(160deg,#F2B23240,#F2B23212)', borderColor: '#F2B23266' }}><span>عملات موزعة اليوم</span><b>{fmt(data.coinsToday)}</b></div>
          </div>
        </section>
        <section className="panel">
          <h2 className="panel-title"><IconClock size={22} />آخر الدورات</h2>
          {data.recent.length ? (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {data.recent.map((r) => (
                <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid rgba(255,222,170,0.08)', fontSize: 14 }}>
                  <b>{r.username}</b><span dir="ltr" style={{ color: '#FFD866', fontWeight: 800 }}>+{fmt(r.amount)}</span><span style={{ color: '#A9A3B5', fontSize: 12 }}>{fmtDate(r.createdAt)}</span>
                </li>
              ))}
            </ol>
          ) : <span className="hint">لم يدر أحد العجلة بعد.</span>}
        </section>
      </div>
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
  const [view, setView] = useState<View>('dashboard');
  const [menu, setMenu] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

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

  const go = (v: View) => { setView(v); setMenu(false); window.scrollTo({ top: 0 }); };
  const usersTable = (list: AdminUser[]) => (
    <div className="table-wrap">
      <table className="table" data-testid="admin-users">
        <thead><tr><th>اللاعب</th><th>المستوى</th><th>المباريات</th><th>الرصيد</th><th>الحالة</th><th>التسجيل</th><th>إجراءات</th></tr></thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.id} className="pb-row">
              <td>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={u.username} color={u.avatarColor} size={36} />
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 800 }}>{u.username} {u.role === 'ADMIN' && <span style={{ fontSize: 11, color: '#FFC83D' }}>· مسؤول</span>}</span>
                    <span dir="ltr" style={{ fontSize: 12, color: '#A9A3B5', textAlign: 'end' }}>{u.email}</span>
                  </span>
                </span>
              </td>
              <td>{u.level}</td>
              <td>{u.games}</td>
              <td><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 800, color: '#FFC83D' }}><Coin size={14} /><span dir="ltr">{fmt(u.balance)}</span></span></td>
              <td>{u.status === 'ACTIVE'
                ? <span className="badge" style={{ background: 'rgba(34,197,94,0.14)', color: '#4ADE80' }}>نشط</span>
                : <span className="badge" title={u.suspendedReason ?? ''} style={{ background: 'rgba(244,63,94,0.14)', color: '#FB7185' }}>موقوف</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.createdAt)}</td>
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
  );
  const txTable = (list: AdminTx[]) => (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>النوع</th><th>اللاعب</th><th>المبلغ</th><th>المصدر</th><th>الوقت</th></tr></thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.id} className="pb-row">
              <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, color: t.amount > 0 ? '#4ADE80' : '#FB7185' }}><span className="ad-dir" style={{ background: t.amount > 0 ? '#16A34A' : '#DC2626' }}>{t.amount > 0 ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />}</span>{TX_LABEL[t.type] ?? t.type}</span></td>
              <td style={{ fontWeight: 700 }}>{t.username}</td>
              <td dir="ltr" style={{ fontWeight: 800, color: t.amount > 0 ? '#4ADE80' : '#FB7185', textAlign: 'end' }}>{signed(t.amount)}</td>
              <td style={{ fontSize: 13, color: '#B8B2C4' }}>{t.reason}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const head = (icon: ReactNode, title: string, more?: View, extra?: ReactNode) => (
    <div className="ad-sec-head">
      <h2>{icon}{title}</h2>
      {extra}
      {more && <button type="button" className="pb-btn pb-ghost pb-sm" onClick={() => go(more)}>عرض الكل</button>}
    </div>
  );
  const search = (
    <label style={{ position: 'relative', width: 'min(280px, 100%)' }}>
      <span style={{ position: 'absolute', insetInlineStart: 14, top: '50%', transform: 'translateY(-50%)', color: '#8C8698', display: 'flex' }}><IconSearch size={16} /></span>
      <input className="pb-input" placeholder="ابحث بالاسم أو البريد…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 42, paddingInlineStart: 40 }} />
    </label>
  );

  return (
    <div className="ad">
      <aside className={'ad-side' + (menu ? ' open' : '')} aria-label="قائمة الإدارة">
        <Link to="/" className="ad-brand">
          <IconCrown size={40} style={{ color: '#F2B232' }} />
          <span><b dir="ltr">Playzino</b><small dir="ltr">ADMIN PANEL</small></span>
        </Link>
        <nav className="ad-nav">
          {NAV.map(([k, icon, label]) => (
            <button key={k} type="button" className={'ad-nav-item' + (view === k ? ' active' : '')} aria-current={view === k ? 'page' : undefined} onClick={() => go(k)}>{icon}<span>{label}</span></button>
          ))}
        </nav>
        <button type="button" className="ad-logout" onClick={async () => { await logout(); navigate('/'); }}><IconLogout size={20} />تسجيل الخروج</button>
        <div className="ad-safe"><IconShield size={22} /><span><b>وضع الأمان</b><small>مفعّل · كل عملية مسجّلة</small></span><IconLock size={18} /></div>
      </aside>
      {menu && <div className="ad-scrim" onClick={() => setMenu(false)} />}

      <div className="ad-main">
        <header className="ad-top">
          <button type="button" className="pb-icon ad-burger" aria-label="القائمة" aria-expanded={menu} onClick={() => setMenu(!menu)}><IconMenu size={22} /></button>
          <span className="ad-status"><span />المنصة تعمل بشكل طبيعي</span>
          <button type="button" className="pb-btn pb-ghost pb-sm" onClick={load}>تحديث</button>
          <Link to="/" className="pb-btn pb-ghost pb-sm pb-hide-sm">الموقع</Link>
          {me && (
            <span className="ad-me">
              <Avatar name={me.username} color={me.profile.avatarColor} size={40} />
              <span><b>{me.username}</b><small>مدير النظام</small></span>
            </span>
          )}
        </header>

        <div className="ad-body">
          {error && <div role="alert" className="alert alert-error">{error}</div>}

          {view === 'dashboard' && (
            <>
              <div className="ad-stats">
                <Stat icon={<IconUsers size={26} />} color="#3B82F6" label="إجمالي المستخدمين" value={fmt(ov?.users ?? 0)} sub={`+${ov?.newUsersWeek ?? 0} هذا الأسبوع · ${ov?.suspended ?? 0} موقوف`} />
                <Stat icon={<IconActivity size={26} />} color="#22C55E" label="متصلون الآن" value={fmt(ov?.online ?? 0)} sub={`${ov?.activeGames ?? 0} مباراة جارية`} />
                <Stat icon={<IconDice size={26} />} color="#EF4444" label="مباريات اليوم" value={fmt(ov?.gamesToday ?? 0)} sub={`${ov?.abandonsToday ?? 0} انسحاب · ${ov?.privateOpen ?? 0} طاولة خاصة`} />
                <Stat icon={<IconCoins size={26} />} color="#8B5CF6" label="عملات متداولة" value={fmt(ov?.creditsInCirculation ?? 0)} sub="افتراضية · غير قابلة للصرف" />
              </div>
              <div className="ad-grid">
                <div className="ad-col">
                  <section className="panel ad-panel">
                    {head(<IconUsers size={22} />, 'أحدث المستخدمين', 'users')}
                    {usersTable([...users].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 5))}
                  </section>
                  <section className="panel ad-panel">
                    {head(<IconCoins size={22} />, 'آخر المعاملات', 'transactions')}
                    {txTable(txs.slice(0, 6))}
                  </section>
                  <QuickStats games={games} txs={txs} />
                </div>
                <div className="ad-col ad-col-side">
                  <CreditControl users={users} onDone={async () => { await load(); await refresh(); }} />
                  <section className="panel">
                    <h2 className="panel-title"><IconShield size={22} style={{ color: '#F2B232' }} />المناطق الحساسة</h2>
                    <div className="ad-links">
                      {([['wheel', <IconWheel size={20} />, 'إعدادات عجلة الحظ'], ['settings', <IconRobot size={20} />, 'مستوى الروبوت'], ['users', <IconLock size={20} />, `الحسابات الموقوفة (${ov?.suspended ?? 0})`], ['audit', <IconClock size={20} />, 'سجل النشاطات']] as [View, ReactNode, string][]).map(([k, icon, label]) => (
                        <button key={k} type="button" onClick={() => go(k)}>{icon}<span>{label}</span><IconChevron size={16} /></button>
                      ))}
                    </div>
                  </section>
                  <section className="panel ad-alert-card">
                    <h2 className="panel-title"><IconShield size={22} />تنبيه أمني</h2>
                    <p>راجع سجل النشاطات بانتظام: كل تعديل في الرصيد أو إيقاف حساب أو تغيير في الإعدادات يُسجَّل باسم المسؤول.</p>
                    <button type="button" className="pb-btn pb-violet pb-sm" onClick={() => go('audit')}>مراجعة الآن</button>
                  </section>
                </div>
              </div>
            </>
          )}

          {view === 'users' && (
            <section className="panel ad-panel">
              {head(<IconUsers size={22} />, `المستخدمون (${users.length})`, undefined, search)}
              {users.length ? usersTable(users) : <div style={{ padding: '0 22px 22px' }}><Empty>لا يوجد مستخدمون.</Empty></div>}
            </section>
          )}

          {view === 'credits' && (
            <div style={{ maxWidth: 520 }}><CreditControl users={users} onDone={async () => { await load(); await refresh(); }} /></div>
          )}

          {view === 'games' && (
            <section className="panel ad-panel">
              {head(<IconDice size={22} />, 'المباريات الأخيرة')}
              {games.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>المباراة</th><th>اللاعبون</th><th>الفائز</th><th>الحركات</th><th>البداية</th><th>الحالة</th><th /></tr></thead>
                    <tbody>
                      {games.map((g) => (
                        <tr key={g.id} className="pb-row">
                          <td><div style={{ fontWeight: 800 }}>{g.room.name}{g.room.gameType && <span style={{ marginInlineStart: 6, fontSize: 11, color: g.room.gameType === 'CONNECT4' ? '#93B4FF' : '#FFC83D' }}>· {GAME_LABEL[g.room.gameType]}</span>}</div><div dir="ltr" style={{ fontSize: 12, color: '#A9A3B5', textAlign: 'end' }}>{g.room.code}{g.room.stake ? ` · ${g.room.stake}` : ''}</div></td>
                          <td>{g.players.map((p) => p.username).join('، ')}</td>
                          <td>{g.winner ?? '—'}</td>
                          <td>{g.moves}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(g.startedAt)}</td>
                          <td><StatusChip status={g.status} /></td>
                          <td>{g.status === 'ACTIVE' && <button type="button" className="pb-btn pb-danger pb-sm" onClick={() => abort(g)}>إلغاء</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div style={{ padding: '0 22px 22px' }}><Empty>لا توجد مباريات بعد.</Empty></div>}
            </section>
          )}

          {view === 'transactions' && (
            <section className="panel ad-panel">
              {head(<IconCoins size={22} />, 'آخر المعاملات الافتراضية')}
              {txTable(txs)}
            </section>
          )}

          {view === 'wheel' && <WheelControl />}

          {view === 'settings' && <div style={{ maxWidth: 520 }}><BotLevelControl onDone={load} /></div>}

          {view === 'audit' && (
            <section className="panel">
              <h2 className="panel-title"><IconClock size={22} />سجل النشاطات</h2>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
                {audit.map((a) => (
                  <li key={a.id} style={{ padding: '10px 0', borderTop: '1px solid rgba(255,222,170,0.08)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#A9A3B5' }}><b style={{ color: '#F7F3EC' }}>{a.actor ?? 'النظام'}</b><span>{fmtDate(a.createdAt)}</span></span>
                    <span style={{ fontSize: 14 }}>
                      {ACTION_LABEL[a.action] ?? a.action}
                      {a.details && 'reason' in a.details ? ` — ${String(a.details.reason)}` : ''}
                      {a.details && 'amount' in a.details && a.action === 'admin.credit_adjust' ? ` (${signed(Number(a.details.amount))})` : ''}
                      {a.details && a.action === 'admin.bot_level' ? ` : ${BOT_LEVEL_LABEL[String(a.details.to)] ?? String(a.details.to)}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
      {dialog && <ReasonDialog title={dialog.title} confirm={dialog.confirm} danger={dialog.danger} onCancel={() => setDialog(null)} onConfirm={dialog.run} />}
    </div>
  );
}

const BOT_LEVEL_LABEL: Record<string, string> = { LOW: 'سهل', MEDIUM: 'متوسط', HIGH: 'صعب' };
const BOT_LEVEL_HINT: Record<string, string> = {
  LOW: 'يلعب حركة عشوائية: مناسب للمبتدئين.',
  MEDIUM: 'يُدخل البيادق ويأسر ويتقدّم، دون حساب الخطر.',
  HIGH: 'يحتمي في الخانات الآمنة ويتجنّب الوقوف أمام الخصم.'
};

/** Niveau de jeu des robots d'entraînement, appliqué dès leur prochain coup. */
function BotLevelControl({ onDone }: { onDone: () => void }) {
  const [level, setLevel] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ level: string }>('/api/admin/settings/bot-level').then((r) => setLevel(r.level), (e) => setMsg({ ok: false, text: errorText(e) }));
  }, []);

  const choose = async (next: string) => {
    if (next === level || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.patch<{ level: string }>('/api/admin/settings/bot-level', { level: next });
      setLevel(r.level);
      setMsg({ ok: true, text: `تم: مستوى الروبوت الآن ${BOT_LEVEL_LABEL[r.level]}` });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 className="panel-title"><IconActivity size={22} style={{ color: '#22D3EE' }} />مستوى الروبوت</h2>
      <div className="seg" data-testid="bot-level">
        {['LOW', 'MEDIUM', 'HIGH'].map((k) => (
          <button key={k} type="button" aria-pressed={level === k} disabled={busy || !level} onClick={() => choose(k)}>{BOT_LEVEL_LABEL[k]}</button>
        ))}
      </div>
      {level && <span className="hint">{BOT_LEVEL_HINT[level]} يُطبَّق على مباريات التدريب، بما فيها الجارية، من الحركة التالية.</span>}
      {msg && <div role="status" className={'alert ' + (msg.ok ? 'alert-ok' : 'alert-error')}>{msg.text}</div>}
    </section>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 14, background: '#110E17' }}>
          <span style={{ color: '#B8B2C4' }}>الرصيد الحالي</span><b dir="ltr" style={{ color: '#FFC83D' }}>{fmt(selected.balance)}</b>
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
