import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmt, GAME_LABEL } from '../lib/format';
import { getSocket } from '../lib/socket';
import { sfx } from '../lib/sounds';
import type { IncomingChallenge, Room } from '../lib/types';
import { Avatar, Coin } from './ui';

/** Secondes restantes avant `until` (rafraîchi chaque seconde). */
export function useSecondsLeft(until: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until === null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/**
 * Défis reçus, sur tout le site : fenêtre « X يتحداك » avec accepter / refuser. Garde aussi le socket ouvert tant
 * que le joueur est connecté (il apparaît ainsi « en ligne »), et ouvre la partie quand mon défi est accepté.
 */
export function ChallengeInbox() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [inbox, setInbox] = useState<IncomingChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const left = useSecondsLeft(inbox?.expiresAt ?? null);
  const userId = user?.id;
  const soundOn = user?.profile.soundEnabled ?? true;

  useEffect(() => {
    if (!userId) return;
    const s = getSocket();
    const onNew = (c: IncomingChallenge) => {
      setInbox({ ...c, expiresAt: Date.now() + c.ttlMs }); // indépendant de l'heure du téléphone
      setError('');
      if (soundOn) sfx.home();
    };
    const onGone = ({ id }: { id: string }) => setInbox((c) => (c?.id === id ? null : c));
    const onAccepted = async ({ roomId }: { roomId: string }) => {
      await refresh();
      nav('/room/' + roomId);
    };
    s.on('challenge:new', onNew);
    s.on('challenge:cancelled', onGone);
    s.on('challenge:expired', onGone);
    s.on('challenge:accepted', onAccepted);
    return () => {
      s.off('challenge:new', onNew);
      s.off('challenge:cancelled', onGone);
      s.off('challenge:expired', onGone);
      s.off('challenge:accepted', onAccepted);
    };
  }, [userId, soundOn, refresh, nav]);

  if (!inbox || !user) return null;

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ room: Room }>(`/api/challenges/${inbox.id}/accept`);
      setInbox(null);
      await refresh();
      nav('/room/' + r.room.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const decline = () => {
    api.post(`/api/challenges/${inbox.id}/decline`).catch(() => undefined);
    setInbox(null);
  };
  const short = inbox.stake > user.balance;

  return (
    <div className="sp-backdrop">
      <div role="alertdialog" aria-modal="true" aria-labelledby="ch-title" className="sp-dialog ch-incoming" data-testid="challenge-incoming">
        <span className="ch-avatar"><Avatar name={inbox.from.username} color={inbox.from.avatarColor} src={inbox.from.avatarUrl} size={72} ring="#F2B232" /></span>
        <span id="ch-title" className="sp-title"><bdi>{inbox.from.username}</bdi> يتحداك!</span>
        <span className="sp-sub">المستوى {inbox.from.level} · {GAME_LABEL[inbox.gameType]}</span>
        <span className="ch-stake">
          {inbox.stake ? <><Coin size={24} /><b dir="ltr">{fmt(inbox.stake)}</b><small>رهان كل لاعب · الفائز يربح <b dir="ltr">{fmt(inbox.stake * 2)}</b></small></> : <b className="free">مباراة مجانية</b>}
        </span>
        {short && <span className="field-error">رصيدك غير كافٍ لقبول هذا الرهان</span>}
        {error && <span role="alert" className="field-error">{error}</span>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="pb-btn pb-plain" style={{ flex: 1 }} onClick={decline} disabled={busy} data-testid="challenge-decline">رفض</button>
          <button type="button" className="pb-btn pb-gold" style={{ flex: 2 }} onClick={accept} disabled={busy || short} data-testid="challenge-accept" autoFocus>
            {busy ? 'جارٍ البدء…' : 'قبول التحدي'} <span dir="ltr" className="ch-left">{left}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
