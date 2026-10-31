import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Page } from '../components/AppShell';
import { IconArrowDown, IconArrowUp, IconBank, IconCopy, IconList, IconUpload } from '../components/Icons';
import { Coin, Empty, Loading } from '../components/ui';
import { api, errorText, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmt, fmtDate, fmtRib } from '../lib/format';
import { getSocket } from '../lib/socket';
import type { Bank, Deposit, PaymentStatus, Withdrawal } from '../lib/types';

interface Limits { depositMin: number; depositMax: number; withdrawalMin: number; withdrawalMax: number; maxPendingDeposits: number }
interface Payments { banks: Bank[]; deposits: Deposit[]; withdrawals: Withdrawal[]; limits: Limits }

const MAX_RECEIPT = 5 * 1024 * 1024;
const BANKS = ['Attijariwafa bank', 'Banque Populaire', 'BMCE Bank of Africa', 'CIH Bank', 'Crédit Agricole du Maroc', 'Société Générale', 'BMCI', 'Al Barid Bank', 'CDM', 'Umnia Bank'];

export function PaymentBadge({ status, paid }: { status: PaymentStatus; paid?: boolean }) {
  const [label, fg, bg] = {
    PENDING: ['قيد المراجعة', '#FFC83D', 'rgba(255,200,61,0.14)'],
    APPROVED: [paid ? 'تم التحويل' : 'مقبول', '#4ADE80', 'rgba(34,197,94,0.14)'],
    REJECTED: ['مرفوض', '#FB7185', 'rgba(244,63,94,0.14)']
  }[status];
  return <span className="badge" style={{ color: fg, background: bg }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: fg }} />{label}</span>;
}

const readAsDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

export function CashierPage() {
  const { user, refresh } = useAuth();
  const [data, setData] = useState<Payments | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');

  const load = useCallback(() => api.get<Payments>('/api/payments').then(setData, (e) => setError(errorText(e))), []);

  useEffect(() => {
    load();
    // Une validation par l'admin met à jour le solde et l'historique sans recharger la page.
    const s = getSocket();
    const onUpdate = () => { load(); refresh(); };
    s.on('wallet:update', onUpdate);
    return () => { s.off('wallet:update', onUpdate); };
  }, [load, refresh]);

  if (!user) return null;
  const done = async () => { await Promise.all([load(), refresh()]); };

  return (
    <Page width={1100}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, background: 'radial-gradient(500px 220px at 100% 0%, rgba(242,178,50,0.18), transparent 70%), linear-gradient(180deg,#1E1A28,#17141F)' }}>
          <span style={{ display: 'flex', flexDirection: 'column', marginInlineEnd: 'auto' }}>
            <h1 style={{ fontWeight: 900, fontSize: 28 }}>الإيداع والسحب</h1>
            <span className="hint" style={{ fontSize: 14 }}>بالتحويل البنكي · 1 درهم = 1 عملة · كل عملية تراجعها الإدارة</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderRadius: 18, background: '#110E17', border: '1px solid rgba(255,200,61,0.35)' }}>
            <Coin size={34} />
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, color: '#B8B2C4' }}>رصيدي</span>
              <b dir="ltr" data-testid="cashier-balance" style={{ fontSize: 24, color: '#FFC83D' }}>{fmt(user.balance)}</b>
            </span>
          </span>
        </section>

        <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" role="tab" className="pb-chip" aria-selected={tab === 'deposit'} onClick={() => setTab('deposit')}><IconArrowDown size={16} />إيداع</button>
          <button type="button" role="tab" className="pb-chip" aria-selected={tab === 'withdraw'} onClick={() => setTab('withdraw')}><IconArrowUp size={16} />سحب</button>
          <button type="button" role="tab" className="pb-chip" aria-selected={tab === 'history'} onClick={() => setTab('history')}><IconList size={16} />السجل</button>
        </div>

        {error && <div role="alert" className="alert alert-error">{error}</div>}
        {!data ? !error && <Loading /> : (
          <>
            {tab === 'deposit' && <DepositForm banks={data.banks} limits={data.limits} onDone={done} onHistory={() => setTab('history')} />}
            {tab === 'withdraw' && <WithdrawForm balance={user.balance} limits={data.limits} last={data.withdrawals[0]} onDone={done} onHistory={() => setTab('history')} />}
            {tab === 'history' && <History deposits={data.deposits} withdrawals={data.withdrawals} />}
          </>
        )}
      </div>
    </Page>
  );
}

function DepositForm({ banks, limits, onDone, onHistory }: { banks: Bank[]; limits: Limits; onDone: () => Promise<void>; onHistory: () => void }) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sent, setSent] = useState(false);
  // Un identifiant par demande : un double clic n'envoie jamais deux dépôts.
  const requestId = useRef(crypto.randomUUID());

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | null) => {
    setMsg(null);
    if (f && f.size > MAX_RECEIPT) return setMsg({ ok: false, text: 'حجم الوصل كبير جدًا (5 ميغابايت كحد أقصى)' });
    setFile(f);
    setPreview(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  };

  const copy = async () => {
    if (!bank) return;
    try {
      await navigator.clipboard.writeText(bank.rib);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* presse-papiers indisponible : le RIB reste sélectionnable */ }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!bank) return;
    if (!Number.isInteger(n) || n < limits.depositMin || n > limits.depositMax) return setMsg({ ok: false, text: `المبلغ بين ${fmt(limits.depositMin)} و${fmt(limits.depositMax)} درهم` });
    if (!file) return setMsg({ ok: false, text: 'ارفع صورة وصل التحويل' });
    setBusy(true);
    setMsg(null);
    try {
      await api.post('/api/payments/deposits', { bankId: bank.id, amount: n, receipt: await readAsDataUrl(file), requestId: requestId.current });
      requestId.current = crypto.randomUUID();
      setSent(true);
      await onDone();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setSent(false); setBank(null); setAmount(''); pick(null); };

  if (sent) {
    return (
      <section className="panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center', padding: 32 }}>
        <span style={{ width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,0.16)', color: '#4ADE80' }}><IconUpload size={30} /></span>
        <h2 style={{ fontWeight: 900, fontSize: 24 }}>تم إرسال طلب الإيداع</h2>
        <p style={{ margin: 0, color: '#DAD5E2', maxWidth: 460 }}>ستتحقق الإدارة من وصول التحويل، ثم يُضاف المبلغ إلى رصيدك. يمكنك متابعة حالة الطلب في السجل.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="pb-btn pb-ghost" onClick={onHistory}>عرض السجل</button>
          <button type="button" className="pb-btn pb-gold" onClick={reset}>إيداع جديد</button>
        </div>
      </section>
    );
  }

  if (!bank) {
    return (
      <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 className="panel-title"><IconBank size={22} style={{ color: '#F2B232' }} />1. اختر البنك</h2>
        {banks.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }} data-testid="deposit-banks">
            {banks.map((b) => (
              <button key={b.id} type="button" onClick={() => setBank(b)} className="pb-btn pb-ghost" style={{ height: 'auto', padding: '18px 16px', justifyContent: 'flex-start', gap: 12, borderRadius: 18, whiteSpace: 'normal', textAlign: 'start' }}>
                <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg,#FFDA5C,#F2B232)', color: '#2B1A00' }}><IconBank size={22} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 16 }}>{b.name}</b><small style={{ color: '#A9A3B5', fontWeight: 600 }}>تحويل بنكي</small></span>
              </button>
            ))}
          </div>
        ) : <Empty>الإيداع غير متاح حاليًا. حاول لاحقًا.</Empty>}
      </section>
    );
  }

  return (
    <form className="panel" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 className="panel-title" style={{ margin: 0, marginInlineEnd: 'auto' }}><IconBank size={22} style={{ color: '#F2B232' }} />2. حوّل المبلغ إلى هذا الحساب</h2>
        <button type="button" className="pb-btn pb-ghost pb-sm" onClick={() => setBank(null)}>تغيير البنك</button>
      </div>

      <div style={{ padding: 18, borderRadius: 18, background: '#110E17', border: '1px solid rgba(255,200,61,0.35)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><span style={{ color: '#B8B2C4' }}>البنك</span><b>{bank.name}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><span style={{ color: '#B8B2C4' }}>صاحب الحساب</span><b dir="auto">{bank.accountHolder}</b></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: '#B8B2C4' }}>رقم الحساب (RIB)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b dir="ltr" data-testid="deposit-rib" style={{ flex: '1 1 260px', fontSize: 20, letterSpacing: '.06em', color: '#FFD866', userSelect: 'all', overflowWrap: 'anywhere' }}>{fmtRib(bank.rib)}</b>
            <button type="button" className="pb-btn pb-gold pb-sm" onClick={copy}><IconCopy size={16} />{copied ? 'تم النسخ' : 'نسخ'}</button>
          </div>
        </div>
      </div>

      <h2 className="panel-title" style={{ margin: '6px 0 0' }}><IconUpload size={22} style={{ color: '#F2B232' }} />3. أرسل وصل التحويل</h2>
      <label className="field"><span>المبلغ المحوَّل (درهم)</span>
        <input className="pb-input" type="number" inputMode="numeric" dir="ltr" min={limits.depositMin} max={limits.depositMax} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(limits.depositMin)} style={{ fontSize: 20, fontWeight: 900, textAlign: 'center' }} data-testid="deposit-amount" />
        <span className="hint">من {fmt(limits.depositMin)} إلى {fmt(limits.depositMax)} درهم. يجب أن يطابق المبلغ ما في الوصل.</span>
      </label>
      <label className="field"><span>صورة الوصل</span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20, borderRadius: 18, border: '2px dashed rgba(255,222,170,0.3)', background: '#110E17', cursor: 'pointer', textAlign: 'center', fontSize: 15, color: '#EFEAF5' }}>
          {preview ? <img src={preview} alt="معاينة الوصل" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 12 }} /> : <IconUpload size={30} style={{ color: '#F2B232' }} />}
          <b>{file ? file.name : 'اضغط لاختيار صورة أو ملف PDF'}</b>
          <small className="hint">JPG أو PNG أو WEBP أو PDF · 5 ميغابايت كحد أقصى</small>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} data-testid="deposit-receipt" />
        </span>
      </label>
      {msg && <div role="status" className={'alert ' + (msg.ok ? 'alert-ok' : 'alert-error')}>{msg.text}</div>}
      <button type="submit" className="pb-btn pb-gold pb-lg" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'إرسال'}</button>
    </form>
  );
}

function WithdrawForm({ balance, limits, last, onDone, onHistory }: { balance: number; limits: Limits; last?: Withdrawal; onDone: () => Promise<void>; onHistory: () => void }) {
  // Pré-rempli avec le dernier compte utilisé : le joueur n'a qu'à saisir le montant.
  const [form, setForm] = useState({ amount: '', bankName: last?.bankName ?? '', accountHolder: last?.accountHolder ?? '', rib: last?.rib ? fmtRib(last.rib) : '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(form.amount);
    if (!Number.isInteger(n) || n < limits.withdrawalMin || n > limits.withdrawalMax) return setMsg({ ok: false, text: `المبلغ بين ${fmt(limits.withdrawalMin)} و${fmt(limits.withdrawalMax)} درهم` });
    if (n > balance) return setMsg({ ok: false, text: 'رصيدك غير كافٍ' });
    if (form.rib.replace(/[\s-]/g, '').length !== 24) return setErrors({ rib: 'رقم RIB يتكون من 24 رقمًا' });
    setBusy(true);
    setMsg(null);
    setErrors({});
    try {
      await api.post('/api/payments/withdrawals', { amount: n, bankName: form.bankName.trim(), accountHolder: form.accountHolder.trim(), rib: form.rib, requestId: requestId.current });
      requestId.current = crypto.randomUUID();
      setForm({ ...form, amount: '' });
      setMsg({ ok: true, text: `تم إرسال طلب سحب ${fmt(n)} درهم. خُصم المبلغ من رصيدك وسيصلك التحويل بعد معالجة الإدارة (يُعاد إليك إذا رُفض الطلب).` });
      await onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 620 }}>
      <h2 className="panel-title"><IconArrowUp size={22} style={{ color: '#F2B232' }} />طلب سحب إلى حسابك البنكي</h2>
      <label className="field"><span>المبلغ (درهم)</span>
        <input className="pb-input" type="number" inputMode="numeric" dir="ltr" min={limits.withdrawalMin} max={Math.min(limits.withdrawalMax, balance)} value={form.amount} onChange={(e) => set('amount', e.target.value)} style={{ fontSize: 20, fontWeight: 900, textAlign: 'center' }} data-testid="withdraw-amount" />
        <span className="hint">الحد الأدنى {fmt(limits.withdrawalMin)} درهم · المتاح للسحب: <b dir="ltr" style={{ color: '#FFD866' }}>{fmt(balance)}</b></span>
      </label>
      <label className="field"><span>البنك</span>
        <input className="pb-input" list="ma-banks" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} aria-invalid={!!errors.bankName} required minLength={2} maxLength={60} />
        <datalist id="ma-banks">{BANKS.map((b) => <option key={b} value={b} />)}</datalist>
      </label>
      <label className="field"><span>الاسم الكامل لصاحب الحساب</span>
        <input className="pb-input" dir="auto" value={form.accountHolder} onChange={(e) => set('accountHolder', e.target.value)} aria-invalid={!!errors.accountHolder} required minLength={2} maxLength={100} />
      </label>
      <label className="field"><span>رقم الحساب (RIB)</span>
        <input className="pb-input" dir="ltr" inputMode="numeric" autoComplete="off" placeholder="000 000 0000000000000000 00" value={form.rib} onChange={(e) => set('rib', e.target.value)} aria-invalid={!!errors.rib} style={{ letterSpacing: '.05em' }} data-testid="withdraw-rib" />
        <span className={errors.rib ? 'field-error' : 'hint'}>{errors.rib ?? '24 رقمًا، كما يظهر في شهادة RIB الخاصة بك'}</span>
      </label>
      {msg && <div role="status" className={'alert ' + (msg.ok ? 'alert-ok' : 'alert-error')}>{msg.text} {msg.ok && <button type="button" className="pb-btn pb-ghost pb-sm" onClick={onHistory}>عرض السجل</button>}</div>}
      <button type="submit" className="pb-btn pb-gold pb-lg" disabled={busy || balance < limits.withdrawalMin}>{busy ? 'جارٍ الإرسال…' : 'إرسال طلب السحب'}</button>
      {balance < limits.withdrawalMin && <span className="hint">رصيدك أقل من الحد الأدنى للسحب.</span>}
    </form>
  );
}

function History({ deposits, withdrawals }: { deposits: Deposit[]; withdrawals: Withdrawal[] }) {
  return (
    <>
      <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <h2 className="panel-title" style={{ padding: '18px 22px 0' }}><IconArrowDown size={22} style={{ color: '#4ADE80' }} />الإيداعات</h2>
        {deposits.length ? (
          <div className="table-wrap">
            <table className="table" data-testid="deposits">
              <thead><tr><th>التاريخ</th><th>البنك</th><th>المبلغ</th><th>الحالة</th><th>ملاحظة</th></tr></thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id} className="pb-row">
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(d.createdAt)}</td>
                    <td>{d.bank}</td>
                    <td dir="ltr" style={{ fontWeight: 800, textAlign: 'end' }}>{fmt(d.creditedAmount ?? d.amount)}</td>
                    <td><PaymentBadge status={d.status} /></td>
                    <td style={{ fontSize: 13, color: '#B8B2C4' }}>{d.note ?? (d.creditedAmount !== null && d.creditedAmount !== d.amount ? `المبلغ المصرّح به: ${fmt(d.amount)}` : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ padding: '0 22px 22px' }}><Empty>لا توجد إيداعات.</Empty></div>}
      </section>
      <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <h2 className="panel-title" style={{ padding: '18px 22px 0' }}><IconArrowUp size={22} style={{ color: '#FB7185' }} />السحوبات</h2>
        {withdrawals.length ? (
          <div className="table-wrap">
            <table className="table" data-testid="withdrawals">
              <thead><tr><th>التاريخ</th><th>إلى</th><th>المبلغ</th><th>الحالة</th><th>ملاحظة</th></tr></thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="pb-row">
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(w.createdAt)}</td>
                    <td><span style={{ display: 'flex', flexDirection: 'column' }}><b>{w.bankName}</b><small dir="ltr" style={{ color: '#A9A3B5', textAlign: 'end' }}>•••• {w.rib.slice(-6)}</small></span></td>
                    <td dir="ltr" style={{ fontWeight: 800, textAlign: 'end' }}>{fmt(w.amount)}</td>
                    <td><PaymentBadge status={w.status} paid /></td>
                    <td style={{ fontSize: 13, color: '#B8B2C4' }}>{w.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ padding: '0 22px 22px' }}><Empty>لا توجد سحوبات.</Empty></div>}
      </section>
    </>
  );
}
