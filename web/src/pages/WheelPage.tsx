import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/AppShell';
import { Coin, Loading } from '../components/ui';
import { restAngle, Wheel } from '../components/Wheel';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmt } from '../lib/format';

interface WheelState { segments: number[]; spunToday: boolean; todayIndex: number | null; todayAmount: number | null; nextSpinAt: string }

const SPIN_MS = 5200;

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
  const [won, setWon] = useState<number | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const countdown = useCountdown(state?.spunToday ? state.nextSpinAt : undefined);

  useEffect(() => {
    if (!user) return;
    api.get<WheelState>('/api/wheel').then((s) => {
      setState(s);
      if (s.todayIndex !== null) setRotation(restAngle(s.todayIndex, s.segments.length));
    }, (e) => setError(errorText(e)));
    return () => clearTimeout(timer.current);
  }, [user]);

  const spin = async () => {
    if (!state || spinning) return;
    setError('');
    setSpinning(true);
    try {
      const r = await api.post<{ index: number; amount: number; balance: number; nextSpinAt: string }>('/api/wheel/spin');
      // Plusieurs tours complets, puis arrêt pile sur la case tirée par le serveur.
      const target = restAngle(r.index, state.segments.length);
      const delta = (((target - rotation) % 360) + 360) % 360;
      setRotation(rotation + 6 * 360 + delta);
      timer.current = setTimeout(async () => {
        setSpinning(false);
        setWon(r.amount);
        setState({ ...state, spunToday: true, todayIndex: r.index, todayAmount: r.amount, nextSpinAt: r.nextSpinAt });
        await refresh();
      }, SPIN_MS);
    } catch (e) {
      setSpinning(false);
      setError(errorText(e));
    }
  };

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
            {state.spunToday && !spinning ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#DAD5E2' }}>ربحت اليوم <b style={{ color: '#FFD866' }}>{fmt(state.todayAmount ?? 0)}</b> عملة. الدورة القادمة بعد</span>
                <span dir="ltr" data-testid="wheel-countdown" style={{ fontWeight: 900, fontSize: 34, letterSpacing: '.06em', color: '#FFD866' }}>{countdown}</span>
                <Link to="/" className="pb-btn pb-gold" style={{ marginTop: 8 }}>العب الآن</Link>
              </div>
            ) : (
              <button type="button" className="pb-btn pb-gold pb-lg" style={{ minWidth: 240, height: 62, fontSize: 20 }} onClick={spin} disabled={spinning} data-testid="wheel-spin">
                {spinning ? 'العجلة تدور…' : 'أدر العجلة'}
              </button>
            )}
            {error && <div role="alert" className="alert alert-error">{error}</div>}
          </>
        )}
        <p className="hint" style={{ maxWidth: 520, margin: 0 }}>دورة واحدة لكل لاعب في اليوم (بتوقيت المغرب).</p>
      </section>

      {won !== null && (
        <div role="dialog" aria-modal="true" aria-labelledby="won-title" onClick={() => setWon(null)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(5,4,10,0.75)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="wh-win panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(380px, 100%)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 30, border: '1px solid rgba(242,178,50,0.5)', background: 'radial-gradient(300px 200px at 50% 0%, rgba(242,178,50,0.3), transparent 70%), #1E1A28' }}>
            <Coin size={64} />
            <h2 id="won-title" style={{ fontWeight: 900, fontSize: 30 }}>مبروك!</h2>
            <p style={{ margin: 0, fontSize: 18 }}>ربحت <b dir="ltr" style={{ color: '#FFD866', fontSize: 26 }}>{fmt(won)}</b> عملة</p>
            <button type="button" className="pb-btn pb-gold pb-lg" style={{ width: '100%' }} onClick={() => setWon(null)} autoFocus>رائع!</button>
          </div>
        </div>
      )}
    </Page>
  );
}
