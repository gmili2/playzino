import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '../components/AppShell';
import { Gift } from '../components/Icons';
import { errorText, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth';

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
      <section style={{ width: '100%', maxWidth: 460, padding: 32, borderRadius: 26, background: 'linear-gradient(170deg, #241C5E, #14153A 55%)', border: '1px solid rgba(140,130,255,0.25)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h1 style={{ fontWeight: 900, fontSize: 30 }}>{title}</h1>
          <p style={{ margin: '6px 0 0', color: '#B4B6E4', lineHeight: 1.7 }}>{sub}</p>
        </div>
        {children}
      </section>
    </div>
  );
}

function useNext() {
  const [sp] = useSearchParams();
  const next = sp.get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const next = useNext();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.login, form.password);
      nav(next, { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Card title="تسجيل الدخول" sub="مرحبًا بعودتك! ادخل لمتابعة مبارياتك.">
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <label className="field"><span>البريد الإلكتروني أو اسم المستخدم</span>
            <input className="pb-input" name="login" autoComplete="username" required value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} dir="ltr" />
          </label>
          <label className="field"><span>كلمة المرور</span>
            <input className="pb-input" name="password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} dir="ltr" />
          </label>
          <button className="pb-btn pb-gold" type="submit" disabled={busy || !form.login || !form.password}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
        </form>
        <p style={{ margin: 0, fontSize: 14, color: '#B4B6E4' }}>ليس لديك حساب؟ <Link to={'/register' + (next !== '/' ? '?next=' + encodeURIComponent(next) : '')}>أنشئ حسابًا مجانًا</Link></p>
      </Card>
    </Page>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const nav = useNavigate();
  const next = useNext();
  const [form, setForm] = useState({ email: '', username: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setErrors({ confirm: 'كلمتا المرور غير متطابقتين' });
    setErrors({});
    setBusy(true);
    try {
      await register(form.email, form.username, form.password);
      nav(next, { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const field = (name: keyof typeof form, label: string, type: string, auto: string, hint?: string) => (
    <label className="field"><span>{label}</span>
      <input className="pb-input" name={name} type={type} autoComplete={auto} dir="ltr" required aria-invalid={!!errors[name]} value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} />
      {errors[name] ? <span className="field-error">{errors[name]}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );

  return (
    <Page>
      <Card title="إنشاء حساب" sub="انضم إلى المجتمع وابدأ اللعب فورًا.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: '#1A1430', border: '1px solid rgba(255,200,61,0.35)' }}>
          <Gift size={36} />
          <span style={{ fontSize: 14, color: '#D4D2F2' }}>تحصل على <b style={{ color: '#FFC83D' }}>1,000</b> عملة افتراضية عند التسجيل (بلا قيمة مالية).</span>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          {field('email', 'البريد الإلكتروني', 'email', 'email')}
          {field('username', 'اسم المستخدم', 'text', 'username', 'من 3 إلى 16 حرفًا لاتينيًا أو رقمًا، مع . أو - أو _')}
          {field('password', 'كلمة المرور', 'password', 'new-password', '8 أحرف على الأقل')}
          {field('confirm', 'تأكيد كلمة المرور', 'password', 'new-password')}
          <button className="pb-btn pb-gold" type="submit" disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}</button>
        </form>
        <p style={{ margin: 0, fontSize: 14, color: '#B4B6E4' }}>لديك حساب؟ <Link to="/login">سجّل الدخول</Link></p>
      </Card>
    </Page>
  );
}
