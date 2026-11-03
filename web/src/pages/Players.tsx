import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/AppShell';
import { useSecondsLeft } from '../components/ChallengeInbox';
import { IconUsers } from '../components/Icons';
import { STAKES } from '../components/StakePicker';
import { Avatar, Coin, Empty, Loading, Spinner } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmt, GAME_LABEL } from '../lib/format';
import { getSocket } from '../lib/socket';
import type { GameType, OnlinePlayer } from '../lib/types';

const REFRESH_MS = 8000;

/** Défi envoyé en attente de réponse. */
interface Outgoing { id: string; to: OnlinePlayer; expiresAt: number }

/** Choix du jeu et de la mise avant d'envoyer le défi. */
function ChallengeDialog({ to, balance, onSent, onClose }: { to: OnlinePlayer; balance: number; onSent: (o: Outgoing) => void; onClose: () => void }) {
  const [game, setGame] = useState<GameType>('PARCHEESI');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async (stake: number) => {
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ id: string; ttlMs: number }>('/api/challenges', { toUserId: to.id, stake, gameType: game });
      onSent({ id: r.id, to, expiresAt: Date.now() + r.ttlMs });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <div className="sp-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="cd-title" className="sp-dialog" data-testid="challenge-dialog" onClick={(e) => e.stopPropagation()}>
        <span className="ch-avatar"><Avatar name={to.username} color={to.avatarColor} size={60} /></span>
        <span id="cd-title" className="sp-title">تحدَّ <bdi>{to.username}</bdi></span>
        <div className="seg" role="group" aria-label="اللعبة" style={{ alignSelf: 'center' }}>
          {(['PARCHEESI', 'CONNECT4'] as GameType[]).map((g) => (
            <button key={g} type="button" aria-pressed={game === g} onClick={() => setGame(g)}>{GAME_LABEL[g]}</button>
          ))}
        </div>
        <span className="sp-sub">اختر الرهان · الفائز يربح الرهانين</span>
        <div className="sp-grid">
          {STAKES.map((s) => (
            <button key={s} type="button" className={'sp-opt' + (s === 0 ? ' free' : '')} data-testid={`challenge-stake-${s}`} disabled={busy || s > balance} onClick={() => send(s)}>
              {s === 0 ? <b>مجانية</b> : <><Coin size={22} /><b dir="ltr">{fmt(s)}</b></>}
              <small>{s === 0 ? 'بدون رهان' : s > balance ? 'رصيد غير كافٍ' : 'عملة'}</small>
            </button>
          ))}
        </div>
        {error && <span role="alert" className="field-error">{error}</span>}
        <button type="button" className="pb-btn pb-plain pb-sm" onClick={onClose}>إلغاء</button>
      </div>
    </div>
  );
}

/** Attente de la réponse du joueur défié (l'ouverture de la partie est gérée par ChallengeInbox). */
function Waiting({ out, onCancel }: { out: Outgoing; onCancel: () => void }) {
  const left = useSecondsLeft(out.expiresAt);
  return (
    <div className="sp-backdrop">
      <div role="dialog" aria-modal="true" className="sp-dialog" data-testid="challenge-waiting">
        <span className="ch-avatar"><Avatar name={out.to.username} color={out.to.avatarColor} size={72} ring="#F2B232" /></span>
        <Spinner size={30} />
        <span className="sp-title" style={{ fontSize: 20 }}>في انتظار رد <bdi>{out.to.username}</bdi>…</span>
        <span className="sp-sub">ينتهي التحدي بعد <b dir="ltr">{left}</b> ث</span>
        <button type="button" className="pb-btn pb-plain pb-sm" onClick={onCancel}>إلغاء التحدي</button>
      </div>
    </div>
  );
}

export function PlayersPage() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<OnlinePlayer[] | null>(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<OnlinePlayer | null>(null);
  const [out, setOut] = useState<Outgoing | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setPlayers((await api.get<{ players: OnlinePlayer[] }>('/api/challenges/online')).players);
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [user?.id, load]);

  // Réponse au défi envoyé (l'acceptation ouvre directement la partie).
  useEffect(() => {
    if (!out) return;
    const s = getSocket();
    const end = (text: string) => ({ id }: { id: string }) => {
      if (id !== out.id) return;
      setOut(null);
      setNotice({ ok: false, text });
      load();
    };
    const onDeclined = end(`رفض ${out.to.username} التحدي.`);
    const onExpired = end(`لم يرد ${out.to.username} على التحدي.`);
    const onFailed = ({ id, code }: { id: string; code: string }) => {
      if (id !== out.id) return;
      setOut(null);
      setNotice({ ok: false, text: code === 'INSUFFICIENT_FUNDS' ? `رصيد ${out.to.username} غير كافٍ لهذا الرهان. لم يُخصم منك شيء.` : errorText({ code }) });
    };
    s.on('challenge:declined', onDeclined);
    s.on('challenge:expired', onExpired);
    s.on('challenge:failed', onFailed);
    return () => {
      s.off('challenge:declined', onDeclined);
      s.off('challenge:expired', onExpired);
      s.off('challenge:failed', onFailed);
    };
  }, [out, load]);

  const cancel = () => {
    if (out) api.post(`/api/challenges/${out.id}/cancel`).catch(() => undefined);
    setOut(null);
  };

  if (!user) return <Page><Loading /></Page>;
  const available = players?.filter((p) => p.status === 'available').length ?? 0;

  return (
    <Page width={900}>
      <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="panel-title" style={{ margin: 0, marginInlineEnd: 'auto', fontSize: 24 }}><IconUsers size={24} style={{ color: '#F2B232' }} />اللاعبون المتصلون</h1>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#A9A3B5' }}>
            <span className="pl-dot" /><b dir="ltr">{players?.length ?? 0}</b> متصل · <b dir="ltr">{available}</b> متاح للتحدي
          </span>
        </div>
        <p style={{ margin: 0, color: '#B8B2C4', fontSize: 14 }}>اختر لاعبًا متاحًا وأرسل له تحديًا: تختار اللعبة والرهان، وتبدأ المباراة فور قبوله.</p>
        {notice && <div role="status" className={'alert ' + (notice.ok ? 'alert-ok' : 'alert-error')}>{notice.text}</div>}
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        {players === null ? <Loading /> : players.length === 0 ? (
          <Empty>لا يوجد لاعبون متصلون غيرك الآن. <Link to="/">العب مباراة سريعة</Link></Empty>
        ) : (
          <ul className="pl-list" data-testid="online-players">
            {players.map((p) => (
              <li key={p.id} className="pl-row">
                <span style={{ position: 'relative', flex: 'none' }}>
                  <Avatar name={p.username} color={p.avatarColor} size={46} />
                  <span className={'pl-dot pl-dot-av' + (p.status === 'playing' ? ' busy' : '')} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <b className="pl-name"><bdi>{p.username}</bdi></b>
                  <small style={{ color: '#A9A3B5' }}>المستوى {p.level} · {p.status === 'playing' ? 'في مباراة الآن' : p.acceptsChallenges ? 'متاح' : 'لا يقبل التحديات'}</small>
                </span>
                <button type="button" className="pb-btn pb-gold pb-sm" data-testid={`challenge-${p.username}`} disabled={p.status === 'playing' || !p.acceptsChallenges || !!out} onClick={() => { setNotice(null); setTarget(p); }}>
                  تحدَّ
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {target && (
        <ChallengeDialog to={target} balance={user.balance} onClose={() => setTarget(null)} onSent={(o) => { setTarget(null); setOut(o); }} />
      )}
      {out && <Waiting out={out} onCancel={cancel} />}
    </Page>
  );
}
