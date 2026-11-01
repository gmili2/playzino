import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/AppShell';
import { Coin, Loading } from '../components/ui';
import { restAngle, Wheel } from '../components/Wheel';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmt } from '../lib/format';
import { sfx } from '../lib/sounds';

interface PaidState { enabled: boolean; spinsToday: number; maxSpins: number; price: number | null; step: number }
interface WheelState { segments: number[]; spunToday: boolean; todayIndex: number | null; todayAmount: number | null; nextSpinAt: string; paid: PaidState }

const SPIN_MS = 5200;

/** Courbe CSS cubic-bezier(x1, y1, x2, y2) : progression de l'animation à l'instant x ∈ [0, 1]. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 30; i++) {
      t = (lo + hi) / 2;
      if (at(x1, x2, t) < x) lo = t; else hi = t;
    }
    return at(y1, y2, t);
  };
}
// Même courbe que .wh-rotor dans styles.css.
const SPIN_EASE = cubicBezier(0.12, 0.6, 0.06, 1);

/** Un « clic » à chaque case qui passe sous l'aiguille, calé sur la courbe de l'animation (ralentit avec elle). */
function tickWhileSpinning(from: number, to: number, segments: number) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = reduced ? 600 : SPIN_MS;
  const step = 360 / segments;
  const t0 = performance.now();
  let passed = 0;
  let frame = 0;
  let last = t0;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const loop = () => {
    const now = performance.now();
    const x = Math.min(1, (now - t0) / ms);
    const n = Math.floor((SPIN_EASE(x) * (to - from)) / step);
    // Appareil lent : plusieurs cases passées depuis l'image précédente, leurs clics sont étalés sur l'intervalle.
    const count = n - passed;
    for (let k = 0; k < count; k++) timers.push(setTimeout(sfx.tick, ((now - last) * k) / count));
    passed = n;
    last = now;
    if (x < 1) frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(frame); timers.forEach(clearTimeout); };
}

function useCountdown(to: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!to) return '';
  const s = Math.max(0, Math.round((new Date(to).getTime() - now) / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, '0')).join(':');
}

export function WheelPage() {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<WheelState | null>(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<{ amount: number; price?: number } | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const stopTicks = useRef<() => void>(() => {});
  const soundOn = user?.profile.soundEnabled ?? true;
  const countdown = useCountdown(state?.spunToday ? state.nextSpinAt : undefined);

  useEffect(() => {
    if (!user) return;
    api.get<WheelState>('/api/wheel').then((s) => {
      setState(s);
      if (s.todayIndex !== null) setRotation(restAngle(s.todayIndex, s.segments.length));
    }, (e) => setError(errorText(e)));
    return () => { clearTimeout(timer.current); stopTicks.current(); };
  }, [user?.id]);

  /** Anime la roue jusqu'à la case tirée par le serveur, puis affiche le gain. */
  const animate = (index: number, done: () => void) => {
    if (!state) return;
    // Plusieurs tours complets, puis arrêt pile sur la case tirée par le serveur.
    const target = restAngle(index, state.segments.length);
    const delta = (((target - rotation) % 360) + 360) % 360;
    setRotation(rotation + 6 * 360 + delta);
    if (soundOn) stopTicks.current = tickWhileSpinning(rotation, rotation + 6 * 360 + delta, state.segments.length);
    timer.current = setTimeout(async () => {
      stopTicks.current();
      if (soundOn) sfx.jackpot();
      setSpinning(false);
      done();
      await refresh();
    }, SPIN_MS);
  };

  const spin = async () => {
    if (!state || spinning) return;
    setError('');
    setSpinning(true);
    try {
      const r = await api.post<{ index: number; amount: number; balance: number; nextSpinAt: string }>('/api/wheel/spin');
      animate(r.index, () => {
        setWon({ amount: r.amount });
        setState((s) => s && { ...s, spunToday: true, todayIndex: r.index, todayAmount: r.amount, nextSpinAt: r.nextSpinAt });
      });
    } catch (e) {
      setSpinning(false);
      setError(errorText(e));
    }
  };

  const paidSpin = async () => {
    if (!state || spinning || state.paid.price === null) return;
    setError('');
    setSpinning(true);
    try {
      const r = await api.post<{ index: number; amount: number; price: number; balance: number; spinsToday: number; nextPrice: number | null }>('/api/wheel/paid-spin');
      // Le solde baisse tout de suite du prix ; le gain s'affiche à l'arrêt de la roue.
      await refresh();
      animate(r.index, () => {
        setWon({ amount: r.amount, price: r.price });
        setState((s) => s && { ...s, paid: { ...s.paid, spinsToday: r.spinsToday, price: r.nextPrice } });
      });
    } catch (e) {
      setSpinning(false);
      setError(errorText(e));
    }
  };

  const paid = state?.paid;
  const canPay = !!paid?.enabled && paid.price !== null;
  const paidButton = state && paid?.enabled && (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button type="button" className="pb-btn pb-violet pb-lg" style={{ minWidth: 240, height: 58, fontSize: 18 }} onClick={paidSpin} disabled={spinning || !canPay || (user?.balance ?? 0) < (paid.price ?? 0)} data-testid="wheel-paid-spin">
        {spinning ? 'العجلة تدور…' : canPay ? <>أدر مقابل <Coin size={20} /><b dir="ltr">{fmt(paid.price!)}</b></> : 'انتهت الدورات المدفوعة لليوم'}
      </button>
      <span className="hint" style={{ fontSize: 13 }}>
        {canPay && (user?.balance ?? 0) < paid.price! ? 'رصيدك غير كافٍ · ' : ''}
        الدورات المدفوعة اليوم: <b dir="ltr">{paid.spinsToday}/{paid.maxSpins}</b>
        {canPay && paid.step > 0 ? ` · يرتفع السعر ${fmt(paid.step)} عملة بعد كل دورة` : ''}
      </span>
    </div>
  );

  return (
    <Page width={1100}>
      <section className="panel" style={{ position: 'relative', overflow: 'hidden', padding: '28px 20px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center', background: 'radial-gradient(600px 360px at 50% 0%, rgba(139,92,246,0.35), transparent 70%), linear-gradient(180deg,#221A33,#15111D)' }}>
        <h1 style={{ fontWeight: 900, fontSize: 'clamp(34px, 6vw, 54px)', lineHeight: 1.1, background: 'linear-gradient(180deg,#FFE9A8,#F2B232)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>عجلة الحظ</h1>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#EFEAF5' }}>دورة مجانية كل يوم · اربح عملات لتلعب بها!</p>

        {!user ? (
          <>
            <Wheel segments={[10, 50, 20, 100, 25, 200, 15, 500]} label="عجلة الحظ" />
            <Link to="/register?next=/wheel" className="pb-btn pb-gold pb-lg">أنشئ حسابك وأدر العجلة</Link>
          </>
        ) : !state ? (
          error ? <div role="alert" className="alert alert-error">{error}</div> : <Loading />
        ) : (
          <>
            <Wheel segments={state.segments} rotation={rotation} label={state.todayAmount !== null ? `نتيجة اليوم: ${state.todayAmount} عملة` : 'عجلة الحظ'} />
            {state.spunToday ? (
              <>
                {paidButton}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#DAD5E2' }}>ربحت في الدورة المجانية اليوم <b style={{ color: '#FFD866' }}>{fmt(state.todayAmount ?? 0)}</b> عملة. الدورة المجانية القادمة بعد</span>
                  <span dir="ltr" data-testid="wheel-countdown" style={{ fontWeight: 900, fontSize: 30, letterSpacing: '.06em', color: '#FFD866' }}>{countdown}</span>
                  {!paid?.enabled && <Link to="/" className="pb-btn pb-gold" style={{ marginTop: 8 }}>العب الآن</Link>}
                </div>
              </>
            ) : (
              <>
                <button type="button" className="pb-btn pb-gold pb-lg" style={{ minWidth: 240, height: 62, fontSize: 20 }} onClick={spin} disabled={spinning} data-testid="wheel-spin">
                  {spinning ? 'العجلة تدور…' : 'أدر العجلة مجانًا'}
                </button>
                {paidButton}
              </>
            )}
            {error && <div role="alert" className="alert alert-error">{error}</div>}
          </>
        )}
        <p className="hint" style={{ maxWidth: 520, margin: 0 }}>دورة مجانية واحدة لكل لاعب في اليوم، ثم دورات مدفوعة يرتفع سعرها بعد كل دورة. يعود السعر إلى بدايته كل يوم عند منتصف الليل (بتوقيت المغرب).</p>
      </section>

      {won !== null && (
        <div role="dialog" aria-modal="true" aria-labelledby="won-title" onClick={() => setWon(null)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(5,4,10,0.75)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="wh-win panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(380px, 100%)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 30, border: '1px solid rgba(242,178,50,0.5)', background: 'radial-gradient(300px 200px at 50% 0%, rgba(242,178,50,0.3), transparent 70%), #1E1A28' }}>
            <Coin size={64} />
            <h2 id="won-title" style={{ fontWeight: 900, fontSize: 30 }}>{won.price !== undefined && won.amount < won.price ? 'حظ أوفر!' : 'مبروك!'}</h2>
            <p style={{ margin: 0, fontSize: 18 }}>ربحت <b dir="ltr" style={{ color: '#FFD866', fontSize: 26 }}>{fmt(won.amount)}</b> عملة</p>
            {won.price !== undefined && <span className="hint" style={{ fontSize: 14 }}>سعر الدورة: <b dir="ltr">{fmt(won.price)}</b> · الصافي: <b dir="ltr" style={{ color: won.amount >= won.price ? '#4ADE80' : '#FB7185' }}>{won.amount - won.price > 0 ? '+' : ''}{fmt(won.amount - won.price)}</b></span>}
            <button type="button" className="pb-btn pb-gold pb-lg" style={{ width: '100%' }} onClick={() => setWon(null)} autoFocus>رائع!</button>
          </div>
        </div>
      )}
    </Page>
  );
}
