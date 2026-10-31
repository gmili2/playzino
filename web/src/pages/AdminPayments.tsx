import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { IconArrowDown, IconArrowUp, IconBank, IconCopy, IconPlus } from '../components/Icons';
import { Empty } from '../components/ui';
import { api, errorText, fieldErrors } from '../lib/api';
import { fmt, fmtDate, fmtRib } from '../lib/format';
import type { Bank, Deposit, PaymentStatus, Withdrawal } from '../lib/types';
import { PaymentBadge } from './Cashier';

type Filter = PaymentStatus | '';
type Ask = (d: { title: string; confirm: string; danger?: boolean; run: (reason: string) => Promise<void> }) => void;

function StatusFilter({ value, onChange, paid }: { value: Filter; onChange: (v: Filter) => void; paid?: boolean }) {
  const items: [Filter, string][] = [['PENDING', 'قيد المراجعة'], ['APPROVED', paid ? 'تم التحويل' : 'مقبولة'], ['REJECTED', 'مرفوضة'], ['', 'الكل']];
  return (
    <div className="seg">
      {items.map(([k, label]) => <button key={k || 'all'} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
}

function usePaymentList<T>(path: string) {
  const [status, setStatus] = useState<Filter>('PENDING');
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    return api.get<{ items: T[] }>(path + (status ? '?status=' + status : '')).then((r) => setItems(r.items), (e) => setError(errorText(e)));
  }, [path, status]);
  useEffect(() => { load(); }, [load]);
  return { status, setStatus, items, error, setError, load };
}

/** Dépôts : l'admin ouvre le reçu, vérifie le virement sur son relevé, puis valide (montant corrigeable) ou refuse. */
export function DepositsAdmin({ ask, onChange }: { ask: Ask; onChange: () => void }) {
  const { status, setStatus, items, error, setError, load } = usePaymentList<Deposit>('/api/admin/payments/deposits');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const approve = async (d: Deposit) => {
    const amount = Number(amounts[d.id] ?? d.amount);
    if (!Number.isInteger(amount) || amount < 1) return setError('مبلغ غير صالح');
    if (!confirm(`تأكيد إيداع ${fmt(amount)} درهم في حساب ${d.username}؟ تحقّق أولًا من وصول التحويل إلى حسابك البنكي.`)) return;
    setBusy(d.id);
    try {
      await api.post(`/api/admin/payments/deposits/${d.id}/approve`, amount === d.amount ? {} : { amount });
      await load();
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const reject = (d: Deposit) =>
    ask({ title: `رفض إيداع ${d.username} (${fmt(d.amount)} درهم)`, confirm: 'رفض', danger: true, run: async (reason) => { await api.post(`/api/admin/payments/deposits/${d.id}/reject`, { reason }); await load(); onChange(); } });

  return (
    <section className="panel ad-panel">
      <div className="ad-sec-head">
        <h2><IconArrowDown size={22} />طلبات الإيداع</h2>
        <StatusFilter value={status} onChange={setStatus} />
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ margin: '0 20px 14px' }}>{error}</div>}
      {items?.length ? (
        <div className="table-wrap">
          <table className="table" data-testid="admin-deposits">
            <thead><tr><th>اللاعب</th><th>البنك</th><th>المبلغ المصرّح</th><th>الوصل</th><th>التاريخ</th><th>الحالة</th><th>إجراءات</th></tr></thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="pb-row">
                  <td style={{ fontWeight: 800 }}>{d.username}</td>
                  <td>{d.bank}</td>
                  <td dir="ltr" style={{ fontWeight: 900, color: '#FFD866', textAlign: 'end' }}>{fmt(d.amount)}</td>
                  <td>
                    <a href={`/api/payments/deposits/${d.id}/receipt`} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
                      {d.receiptMime.startsWith('image/')
                        ? <img src={`/api/payments/deposits/${d.id}/receipt`} alt={`وصل ${d.username}`} loading="lazy" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,222,170,0.25)' }} />
                        : <span className="badge" style={{ background: 'rgba(47,107,255,0.2)', color: '#93B4FF' }}>PDF</span>}
                    </a>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(d.createdAt)}</td>
                  <td>
                    <PaymentBadge status={d.status} />
                    {d.status !== 'PENDING' && <div style={{ fontSize: 12, color: '#A9A3B5', marginTop: 4 }}>{d.reviewedBy}{d.creditedAmount !== null && d.creditedAmount !== d.amount ? ` · مُودَع: ${fmt(d.creditedAmount)}` : ''}{d.note ? ` · ${d.note}` : ''}</div>}
                  </td>
                  <td>
                    {d.status === 'PENDING' && (
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input className="pb-input" type="number" dir="ltr" aria-label="المبلغ المودَع" value={amounts[d.id] ?? String(d.amount)} onChange={(e) => setAmounts({ ...amounts, [d.id]: e.target.value })} style={{ height: 38, width: 100 }} />
                        <button type="button" className="pb-btn pb-gold pb-sm" disabled={busy === d.id} onClick={() => approve(d)}>قبول</button>
                        <button type="button" className="pb-btn pb-danger pb-sm" disabled={busy === d.id} onClick={() => reject(d)}>رفض</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div style={{ padding: '0 22px 22px' }}><Empty>{items === null ? 'جارٍ التحميل…' : 'لا توجد طلبات.'}</Empty></div>}
    </section>
  );
}

/** Retraits : le montant est déjà bloqué ; l'admin fait le virement vers le RIB du joueur puis le marque exécuté. */
export function WithdrawalsAdmin({ ask, onChange }: { ask: Ask; onChange: () => void }) {
  const { status, setStatus, items, error, load } = usePaymentList<Withdrawal>('/api/admin/payments/withdrawals');
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (w: Withdrawal) => {
    try {
      await navigator.clipboard.writeText(w.rib);
      setCopied(w.id);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* presse-papiers indisponible */ }
  };
  const paid = (w: Withdrawal) =>
    ask({ title: `تأكيد تحويل ${fmt(w.amount)} درهم إلى ${w.accountHolder}`, confirm: 'تم التحويل', run: async (reference) => { await api.post(`/api/admin/payments/withdrawals/${w.id}/paid`, { reference }); await load(); onChange(); } });
  const reject = (w: Withdrawal) =>
    ask({ title: `رفض سحب ${w.username} (يُعاد المبلغ إلى رصيده)`, confirm: 'رفض وإرجاع المبلغ', danger: true, run: async (reason) => { await api.post(`/api/admin/payments/withdrawals/${w.id}/reject`, { reason }); await load(); onChange(); } });

  return (
    <section className="panel ad-panel">
      <div className="ad-sec-head">
        <h2><IconArrowUp size={22} />طلبات السحب</h2>
        <StatusFilter value={status} onChange={setStatus} paid />
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ margin: '0 20px 14px' }}>{error}</div>}
      {items?.length ? (
        <div className="table-wrap">
          <table className="table" data-testid="admin-withdrawals">
            <thead><tr><th>اللاعب</th><th>المبلغ</th><th>الحساب البنكي</th><th>التاريخ</th><th>الحالة</th><th>إجراءات</th></tr></thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id} className="pb-row">
                  <td style={{ fontWeight: 800 }}>{w.username}</td>
                  <td dir="ltr" style={{ fontWeight: 900, color: '#FFD866', textAlign: 'end' }}>{fmt(w.amount)}</td>
                  <td>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <b>{w.bankName} · <span dir="auto">{w.accountHolder}</span></b>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span dir="ltr" style={{ fontSize: 13, letterSpacing: '.04em', color: '#DAD5E2', userSelect: 'all' }}>{fmtRib(w.rib)}</span>
                        <button type="button" className="pb-icon" aria-label="نسخ RIB" title="نسخ RIB" onClick={() => copy(w)} style={{ width: 30, height: 30 }}><IconCopy size={14} /></button>
                        {copied === w.id && <small style={{ color: '#4ADE80' }}>تم النسخ</small>}
                      </span>
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(w.createdAt)}</td>
                  <td>
                    <PaymentBadge status={w.status} paid />
                    {w.status !== 'PENDING' && <div style={{ fontSize: 12, color: '#A9A3B5', marginTop: 4 }}>{w.reviewedBy}{w.note ? ` · ${w.note}` : ''}</div>}
                  </td>
                  <td>
                    {w.status === 'PENDING' && (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="pb-btn pb-gold pb-sm" onClick={() => paid(w)}>تم التحويل</button>
                        <button type="button" className="pb-btn pb-danger pb-sm" onClick={() => reject(w)}>رفض</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div style={{ padding: '0 22px 22px' }}><Empty>{items === null ? 'جارٍ التحميل…' : 'لا توجد طلبات.'}</Empty></div>}
      <p className="hint" style={{ padding: '0 20px 18px', margin: 0 }}>المبلغ يُخصم من رصيد اللاعب عند الطلب. «تم التحويل»: سجّل مرجع التحويل. «رفض»: يُعاد المبلغ إلى رصيد اللاعب.</p>
    </section>
  );
}

const EMPTY_BANK = { name: '', accountHolder: '', rib: '' };

/** Comptes bancaires de la plateforme affichés aux joueurs pour le dépôt. */
export function BanksAdmin() {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [form, setForm] = useState(EMPTY_BANK);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api.get<{ items: Bank[] }>('/api/admin/payments/banks').then((r) => setBanks(r.items), (e) => setMsg({ ok: false, text: errorText(e) }));
  useEffect(() => { load(); }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErrors({});
    try {
      if (editing) await api.patch(`/api/admin/payments/banks/${editing}`, form);
      else await api.post('/api/admin/payments/banks', form);
      setMsg({ ok: true, text: editing ? 'تم تحديث الحساب' : 'تمت إضافة الحساب' });
      setForm(EMPTY_BANK);
      setEditing(null);
      await load();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMsg({ ok: false, text: errorText(err) });
    }
  };
  const toggle = async (b: Bank) => {
    try {
      await api.patch(`/api/admin/payments/banks/${b.id}`, { active: !b.active });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  };

  return (
    <div className="ad-grid">
      <section className="panel ad-panel ad-col">
        <div className="ad-sec-head"><h2><IconBank size={22} />حسابات الإيداع</h2></div>
        {banks?.length ? (
          <div className="table-wrap">
            <table className="table" data-testid="admin-banks">
              <thead><tr><th>البنك</th><th>صاحب الحساب</th><th>RIB</th><th>الحالة</th><th /></tr></thead>
              <tbody>
                {banks.map((b) => (
                  <tr key={b.id} className="pb-row">
                    <td style={{ fontWeight: 800 }}>{b.name}</td>
                    <td dir="auto">{b.accountHolder}</td>
                    <td dir="ltr" style={{ fontSize: 13, letterSpacing: '.04em' }}>{fmtRib(b.rib)}</td>
                    <td>{b.active
                      ? <span className="badge" style={{ background: 'rgba(34,197,94,0.14)', color: '#4ADE80' }}>ظاهر للاعبين</span>
                      : <span className="badge" style={{ background: 'rgba(255,222,170,0.14)', color: '#B8B2C4' }}>مخفي</span>}</td>
                    <td>
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="pb-btn pb-ghost pb-sm" onClick={() => { setEditing(b.id); setForm({ name: b.name, accountHolder: b.accountHolder, rib: b.rib }); setMsg(null); }}>تعديل</button>
                        <button type="button" className={'pb-btn pb-sm ' + (b.active ? 'pb-danger' : 'pb-ghost')} onClick={() => toggle(b)}>{b.active ? 'إخفاء' : 'إظهار'}</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ padding: '0 22px 22px' }}><Empty>{banks === null ? 'جارٍ التحميل…' : 'أضف حسابًا بنكيًا ليتمكن اللاعبون من الإيداع.'}</Empty></div>}
      </section>
      <form className="panel ad-col ad-col-side" onSubmit={save} style={{ gap: 14 }}>
        <h2 className="panel-title"><IconPlus size={22} style={{ color: '#F2B232' }} />{editing ? 'تعديل الحساب' : 'إضافة حساب'}</h2>
        <label className="field"><span>اسم البنك</span>
          <input className="pb-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} placeholder="CIH Bank" />
        </label>
        <label className="field"><span>صاحب الحساب</span>
          <input className="pb-input" dir="auto" value={form.accountHolder} onChange={(e) => setForm({ ...form, accountHolder: e.target.value })} aria-invalid={!!errors.accountHolder} />
        </label>
        <label className="field"><span>RIB (24 رقمًا)</span>
          <input className="pb-input" dir="ltr" inputMode="numeric" value={form.rib} onChange={(e) => setForm({ ...form, rib: e.target.value })} aria-invalid={!!errors.rib} />
          {errors.rib && <span className="field-error">رقم RIB يتكون من 24 رقمًا</span>}
        </label>
        <span className="hint">كل تعديل على RIB يُسجَّل في سجل النشاطات (القديم والجديد).</span>
        {msg && <div role="status" className={'alert ' + (msg.ok ? 'alert-ok' : 'alert-error')}>{msg.text}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          {editing && <button type="button" className="pb-btn pb-ghost" style={{ flex: 1 }} onClick={() => { setEditing(null); setForm(EMPTY_BANK); }}>إلغاء</button>}
          <button type="submit" className="pb-btn pb-gold" style={{ flex: 1 }}>{editing ? 'حفظ' : 'إضافة'}</button>
        </div>
      </form>
    </div>
  );
}
