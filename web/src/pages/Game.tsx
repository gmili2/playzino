import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Board, type BoardPawn, type BoardTarget } from '../components/Board';
import { IconArrowBack, IconDice, IconLogout, IconMute, IconVolume, IconWifiOff } from '../components/Icons';
import { Avatar, Die, Loading, Spinner } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { COLOR_HEX, COLOR_NAME, fmt } from '../lib/format';
import { useRoomActions } from '../lib/hooks';
import { emitAck, getSocket } from '../lib/socket';
import type { Color, GameEvent, GameSnapshot, Room } from '../lib/types';

const WIN_XP = 250;
const LOSS_XP = 60;

/** Petits sons synthétisés (aucun fichier externe). */
function useSound(enabled: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  return useCallback(
    (freq: number, ms = 90) => {
      if (!enabled) return;
      try {
        ctx.current ??= new AudioContext();
        const o = ctx.current.createOscillator();
        const g = ctx.current.createGain();
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.08, ctx.current.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.current.currentTime + ms / 1000);
        o.connect(g).connect(ctx.current.destination);
        o.start();
        o.stop(ctx.current.currentTime + ms / 1000);
      } catch {
        /* audio indisponible */
      }
    },
    [enabled]
  );
}

function eventText(ev: GameEvent, name: (c: Color) => string): string | null {
  switch (ev.type) {
    case 'roll': return `${name(ev.color)} رمى ${ev.value}${ev.moveValue === 7 ? ' (تُحتسب 7)' : ''}.`;
    case 'exit': return `${name(ev.color)} أخرج بيدقًا.`;
    case 'move': return ev.bonus ? `${name(ev.color)} تقدّم بالمكافأة إلى ${ev.to}.` : null;
    case 'capture': return `أسر! ${name(ev.color)} أعاد بيدقًا ${COLOR_NAME[ev.victim]} إلى بيته.`;
    case 'home': return `وصل بيدق ${COLOR_NAME[ev.color]} إلى البيت.`;
    case 'bonus': return `مكافأة ${ev.amount} خانة لـ ${name(ev.color)}.`;
    case 'bonus_lost': return `ضاعت مكافأة ${ev.amount} خانة (لا حركة ممكنة).`;
    case 'three_sixes': return `ثلاث ستات متتالية: عاد آخر بيدق لـ ${name(ev.color)} إلى البيت.`;
    case 'no_move': return `لا توجد حركة ممكنة بـ ${ev.value}.`;
    case 'extra_turn': return `${name(ev.color)} يلعب مجددًا (6).`;
    case 'eliminated': return `${name(ev.color)} خرج من المباراة.`;
    case 'win': return `${name(ev.color)} فاز بالمباراة!`;
    default: return null;
  }
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function GamePage() {
  const { roomId = '' } = useParams();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const actions = useRoomActions();
  const [room, setRoom] = useState<Room | null>(null);
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(getSocket().connected);
  const [rolling, setRolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [log, setLog] = useState<{ text: string; color: string }[]>([]);
  const [quit, setQuit] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sound, setSound] = useState(user?.profile.soundEnabled ?? true);
  const [skew, setSkew] = useState(0);
  const lastSeq = useRef(-1);
  const play = useSound(sound);

  const gameId = room?.gameId ?? null;
  const me = snap?.players.find((p) => p.userId === user?.id) ?? null;
  const opps = snap ? snap.players.filter((p) => p.userId !== user?.id) : [];
  const winnerP = snap?.players.find((p) => p.userId === snap.winnerId) ?? null;
  const turnP = snap?.players.find((p) => p.color === snap.turnColor) ?? null;
  const offP = opps.find((p) => !p.online && p.offlineUntil && !p.eliminated) ?? null;
  const [dismissed, setDismissed] = useState(false);
  const nameOf = useCallback(
    (c: Color) => (c === me?.color ? 'أنت' : snap?.players.find((p) => p.color === c)?.username ?? COLOR_NAME[c]),
    [me?.color, snap?.players]
  );

  // --- salle : chargement et attente du second joueur ---
  const loadRoom = useCallback(async () => {
    try {
      const r = await api.get<{ room: Room }>('/api/rooms/' + roomId);
      setRoom(r.room);
    } catch (e) {
      setError(errorText(e));
    }
  }, [roomId]);

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    const s = getSocket();
    const onUpdate = (r: Room | null) => (r ? setRoom((prev) => ({ ...(prev ?? r), ...r })) : loadRoom());
    const watch = () => s.emit('room:watch', roomId);
    s.on('room:update', onUpdate);
    s.on('connect', watch);
    if (s.connected) watch();
    // Filet de sécurité si un événement temps réel est manqué.
    const t = setInterval(() => room?.status === 'WAITING' && loadRoom(), 5000);
    return () => {
      s.off('room:update', onUpdate);
      s.off('connect', watch);
      clearInterval(t);
    };
  }, [roomId, loadRoom, room?.status]);

  // --- partie : abonnement, synchronisation et reconnexion ---
  const applySnap = useCallback(
    (s: GameSnapshot) => {
      setSkew(Date.now() - s.serverTime);
      setSnap((prev) => (prev && prev.state.seq > s.state.seq && prev.status === s.status ? prev : s));
      if (s.state.seq > lastSeq.current && lastSeq.current >= 0) {
        const lines = s.events
          .map((ev) => ({ text: eventText(ev, nameOfRef.current), color: COLOR_HEX[('color' in ev ? ev.color : 'blue') as Color] }))
          .filter((l): l is { text: string; color: string } => !!l.text);
        if (lines.length) setLog((prev) => [...lines.reverse(), ...prev].slice(0, 8));
        const cap = s.events.find((e) => e.type === 'capture');
        const home = s.events.find((e) => e.type === 'home');
        const extra = s.events.find((e) => e.type === 'extra_turn');
        const t = cap ? (cap.color === myColorRef.current ? 'أسر! البيدق يعود إلى بيته' : 'للأسف، أُسر بيدقك')
          : home ? 'بيدق وصل إلى البيت!'
          : extra ? (extra.color === myColorRef.current ? 'رميت 6: العب مرة أخرى!' : 'الخصم يلعب مجددًا (6)') : null;
        if (t) setToast(t);
        if (s.events.some((e) => e.type === 'roll')) play(cap ? 220 : 520);
        if (cap) play(180, 220);
      }
      lastSeq.current = Math.max(lastSeq.current, s.state.seq);
      if (s.status !== 'ACTIVE') refresh();
    },
    [play, refresh]
  );
  const nameOfRef = useRef(nameOf);
  nameOfRef.current = nameOf;
  const myColorRef = useRef<Color | undefined>(me?.color);
  myColorRef.current = me?.color;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!gameId) return;
    const s = getSocket();
    const join = async () => {
      try {
        const data = await emitAck<GameSnapshot>('game:join', gameId);
        if (lastSeq.current < 0) {
          lastSeq.current = data.state.seq;
          setLog([{ text: 'بدأت المباراة. حظًا موفقًا!', color: '#A6A8D6' }]);
        }
        applySnap(data);
        setError('');
      } catch (e) {
        setError(errorText(e));
      }
    };
    const onConnect = () => {
      setConnected(true);
      join(); // reconnexion : on se réabonne et on récupère l'état complet
    };
    const onDisconnect = () => setConnected(false);
    s.on('game:state', applySnap);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    if (s.connected) join();
    return () => {
      s.off('game:state', applySnap);
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, [gameId, applySnap]);

  const now = useNow(!!snap && snap.status === 'ACTIVE');

  // --- actions joueur (toujours validées par le serveur) ---
  const roll = async () => {
    if (!gameId || busy) return;
    setBusy(true);
    setRolling(true);
    const started = Date.now();
    try {
      const data = await emitAck<GameSnapshot>('game:roll', gameId);
      await new Promise((r) => setTimeout(r, Math.max(0, 550 - (Date.now() - started))));
      applySnap(data);
    } catch (e) {
      setToast(errorText(e));
    } finally {
      setRolling(false);
      setBusy(false);
    }
  };

  const move = async (pawn: number) => {
    if (!gameId || busy) return;
    setBusy(true);
    try {
      applySnap(await emitAck<GameSnapshot>('game:move', { gameId, pawn }));
      play(660, 60);
    } catch (e) {
      setToast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setQuit(false);
    try {
      if (snap?.status === 'ACTIVE' && gameId) await emitAck('game:forfeit', gameId);
      else if (room?.status === 'WAITING') {
        await api.post(`/api/rooms/${roomId}/leave`);
        await refresh();
        nav('/');
      } else nav('/');
    } catch (e) {
      setError(errorText(e));
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room?.code ?? '');
    } catch {
      /* presse-papiers indisponible */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // --- valeurs dérivées pour l'affichage ---
  const view = useMemo(() => {
    if (!snap || !me) return null;
    const active = snap.status === 'ACTIVE';
    const myTurn = active && !snap.paused && snap.turnColor === me.color;
    const phase = snap.state.phase;
    const movable = new Map<number, number>();
    if (myTurn && (phase === 'move' || phase === 'bonus')) snap.legalMoves.forEach((m) => movable.set(m.pawn, m.to));
    const pawns: BoardPawn[] = snap.state.colors.flatMap((c) =>
      snap.state.pawns[c].map((p, slot) => ({
        color: c, p, slot,
        movable: c === me.color && movable.has(slot),
        onPick: c === me.color && movable.has(slot) && !busy ? () => move(slot) : undefined
      }))
    );
    const targets: BoardTarget[] = [...movable.entries()].map(([slot, to]) => ({ color: me.color, p: to, slot }));
    return { active, myTurn, phase, pawns, targets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, me, busy]);

  if (error && !room) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div role="alert" className="alert alert-error" style={{ maxWidth: 480, margin: '0 auto 16px' }}>{error}</div>
        <Link className="pb-btn pb-ghost" to="/">العودة للرئيسية</Link>
      </div>
    );
  }
  if (!room) return <Loading />;

  const waiting = room.status === 'WAITING';
  const ended = room.status === 'CANCELLED' || (room.status === 'FINISHED' && !gameId);
  const deadlineLeft = snap?.deadline ? Math.max(0, Math.ceil((snap.deadline - (now - skew)) / 1000)) : null;
  const offlineOpp = offP?.offlineUntil ? Math.max(0, Math.ceil((offP.offlineUntil - (now - skew)) / 1000)) : null;
  const iAmOut = !!me?.eliminated && snap?.status === 'ACTIVE';
  const result = snap && snap.status !== 'ACTIVE' ? (snap.status === 'ABORTED' ? 'aborted' : snap.winnerId === user?.id ? 'victory' : 'defeat') : iAmOut ? 'defeat' : null;
  const practice = !!room.isPractice;
  const playersLabel = (n: number) => (n === 2 ? 'لاعبان' : `${n} لاعبين`);

  // Bandeau d'état (couleurs du design).
  let bannerTitle = '', bannerSub = '', tone = '#22D3EE';
  if (waiting) { bannerTitle = 'في انتظار خصم'; bannerSub = room.code ? `شارك الرمز ${room.code} لدعوة صديق` : 'ستبدأ المباراة عند انضمام لاعب'; }
  else if (!snap || !view) { bannerTitle = 'جارٍ الاتصال…'; bannerSub = 'تحميل حالة المباراة'; tone = '#B9A8FF'; }
  else if (result) {
    bannerTitle = result === 'victory' ? 'فوز!' : result === 'aborted' ? 'أُلغيت المباراة' : 'انتهت المباراة';
    bannerSub = result === 'victory' ? 'بيادقك الأربعة في البيت' : result === 'aborted' ? (practice ? 'انتهت جلسة التدريب' : 'تمت إعادة الرهانات') : iAmOut ? 'خرجت من المباراة، والآخرون يواصلون اللعب' : `فاز ${winnerP?.username ?? 'الخصم'} بهذه الجولة`;
    tone = result === 'victory' ? '#22C55E' : '#F43F5E';
  } else if (snap.paused) { bannerTitle = 'المباراة متوقفة'; bannerSub = `${offP ? offP.username : 'أنت'} يحاول إعادة الاتصال`; tone = '#F59E0B'; }
  else if (view.myTurn) {
    tone = '#FFC83D';
    bannerTitle = 'دورك!';
    bannerSub = view.phase === 'bonus' ? `مكافأة: اختر بيدقًا للتقدم ${snap.state.moveValue} خانة`
      : view.phase === 'move' ? `اختر بيدقًا مضيئًا للتقدم ${snap.state.moveValue} خانات`
      : rolling ? 'النرد يتدحرج…' : 'ارمِ النرد';
  } else { tone = '#B9A8FF'; bannerTitle = `دور ${turnP?.username ?? 'الخصم'}`; bannerSub = 'يلعب الآن… انتظر قليلًا'; }

  const panel = (p: GameSnapshot['players'][number] | null, isMe: boolean, fallbackName: string, fallbackColor: Color = isMe ? 'blue' : 'yellow') => {
    const color = p?.color ?? fallbackColor;
    const hex = COLOR_HEX[color];
    const arr = snap?.state.pawns[color] ?? [-1, -1, -1, -1];
    const activeTurn = !!snap && snap.status === 'ACTIVE' && !snap.paused && snap.turnColor === color;
    const out = !!p?.eliminated;
    const offline = !!p && !p.online && !out && snap?.status === 'ACTIVE';
    const vacant = waiting && !isMe && fallbackName === 'مكان شاغر';
    const tag = out ? 'خرج' : vacant ? 'مكان شاغر' : waiting ? 'جاهز' : offline ? 'غير متصل' : activeTurn ? (isMe ? 'دورك' : 'دوره') : 'في الانتظار';
    return (
      <div key={isMe ? 'me' : color} data-testid={isMe ? 'panel-me' : 'panel-opp'} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 20, background: '#14153A', transition: 'box-shadow .2s,border-color .2s', border: activeTurn ? `2px solid ${hex}` : '1px solid rgba(140,130,255,0.14)', boxShadow: activeTurn ? `0 0 0 4px ${hex}26, 0 12px 30px rgba(0,0,0,0.3)` : undefined, opacity: out ? 0.45 : offline ? 0.7 : 1 }}>
        <Avatar name={p?.username ?? fallbackName} color={hex} size={54} style={{ boxShadow: `0 0 0 3px #14153A, 0 0 0 5px ${activeTurn ? '#FFC83D' : 'rgba(140,130,255,0.3)'}` }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800 }}>{p?.username ?? fallbackName}</span>
            {(p?.isBot || room.players.find((x) => x.username === fallbackName)?.isBot) && <span className="badge" style={{ padding: '2px 9px', fontSize: 11, background: 'rgba(34,197,94,0.16)', color: '#4ADE80' }}>روبوت</span>}
            <span style={{ fontSize: 12, color: '#A6A8D6' }}>{isMe ? 'أنت · ' : p ? `المستوى ${p.level} · ` : ''}{COLOR_NAME[color]}</span>
            <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, ...(offline ? { background: 'rgba(245,158,11,0.18)', color: '#FCD34D' } : activeTurn ? { background: hex, color: color === 'yellow' ? '#2A1E00' : '#fff' } : { background: 'rgba(140,130,255,0.14)', color: '#B4B6E4' }) }}>{tag}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {arr.map((v, i) => (
              <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', boxSizing: 'border-box', ...(v === 63 ? { background: hex } : v >= 0 ? { background: hex + '80', border: `2px solid ${hex}` } : { border: '2px solid rgba(140,130,255,0.4)' }) }} />
            ))}
            <span style={{ fontSize: 12, color: '#B4B6E4', marginInlineStart: 4 }}>{arr.filter((v) => v === 63).length}/4 في البيت</span>
          </div>
        </div>
      </div>
    );
  };

  const canRoll = !!view?.myTurn && view.phase === 'roll' && !busy;
  const face = snap?.state.die ?? 5;
  const myPayout = snap && user ? snap.payouts[user.id] ?? 0 : 0;

  return (
    <div dir="rtl" style={{ position: 'relative', minHeight: '100vh', background: '#0A0B1E', color: '#F4F3FF' }}>
      <header style={{ borderBottom: '1px solid rgba(140,130,255,0.12)', background: '#0D0E28' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link className="pb-btn pb-plain pb-sm" to="/"><IconArrowBack size={18} />الرئيسية</Link>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>{room.name}</span>
            <span style={{ fontSize: 12, color: '#A6A8D6' }}><span dir="ltr">{room.code ?? ''}</span> · {room.visibility === 'PUBLIC' ? 'عامة' : 'خاصة'} · {practice ? 'تدريب ضد الروبوت' : playersLabel(room.maxPlayers)}{room.stake ? ` · رهان ${fmt(room.stake)}` : ''}</span>
          </div>
          <span className="pb-hide-sm" data-testid="net-status" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, ...(connected ? { color: '#4ADE80', background: 'rgba(34,197,94,0.14)' } : { color: '#FCD34D', background: 'rgba(245,158,11,0.14)' }) }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#22C55E' : '#F59E0B' }} />{connected ? 'متصل' : 'جارٍ إعادة الاتصال…'}
          </span>
          <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {deadlineLeft !== null && view?.active && (
              <span data-testid="turn-timer" style={{ fontSize: 13, fontWeight: 800, color: deadlineLeft <= 5 ? '#FB7185' : '#A6A8D6', border: '1px dashed rgba(140,130,255,0.4)', padding: '5px 12px', borderRadius: 999 }}>
                {deadlineLeft} ث
              </span>
            )}
            <button type="button" className="pb-btn pb-plain pb-sm" aria-pressed={sound} aria-label={sound ? 'كتم الصوت' : 'تشغيل الصوت'} onClick={() => setSound(!sound)} style={{ width: 42, padding: 0 }}>
              {sound ? <IconVolume size={18} /> : <IconMute size={18} />}
            </button>
            {!result && <button type="button" className="pb-btn pb-danger pb-sm" onClick={() => setQuit(true)}><IconLogout size={16} style={{ transform: 'scaleX(-1)' }} />مغادرة</button>}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1360, margin: '0 auto', padding: 20, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', justifyContent: 'center' }}>
        <section aria-label="اللوحة" style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div role="status" aria-live="polite" data-testid="banner" style={{ width: 'min(100%,720px)', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 18, background: tone + '1F', border: `1px solid ${tone}66` }}>
            <span className="pc-pulse" style={{ flex: 'none', width: 14, height: 14, borderRadius: '50%', background: tone, boxShadow: `0 0 0 5px ${tone}33` }} />
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.4 }}>
              <span style={{ fontWeight: 900, fontSize: 19 }}>{bannerTitle}</span>
              <span style={{ fontSize: 13, color: '#D4D2F2' }}>{bannerSub}</span>
            </span>
          </div>
          {error && <div role="alert" className="alert alert-error" style={{ width: 'min(100%,720px)' }}>{error}</div>}

          <div style={{ position: 'relative', width: 'min(100%, 720px, calc(100vh - 190px))', minWidth: 'min(100%, 320px)' }}>
            <Board
              pawns={view?.pawns ?? (['blue', 'yellow', 'red', 'green'] as Color[]).slice(0, room.maxPlayers).flatMap((c) => [0, 1, 2, 3].map((slot) => ({ color: c, p: -1, slot })))}
              targets={view?.targets}
            />
            {toast && (
              <div className="pc-toast" role="status" style={{ position: 'absolute', left: '50%', top: 16, transform: 'translateX(-50%)', zIndex: 20, padding: '10px 20px', borderRadius: 999, background: 'linear-gradient(180deg,#FFDA5C,#FFB21E)', color: '#2B1A00', fontWeight: 800, fontSize: 15, boxShadow: '0 12px 30px rgba(0,0,0,0.45)', whiteSpace: 'nowrap' }}>{toast}</div>
            )}
            {(waiting || ended) && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 30, borderRadius: 22, background: 'rgba(10,11,30,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <div data-testid="waiting-overlay" style={{ width: '100%', maxWidth: 380, padding: 28, borderRadius: 22, background: '#14153A', border: '1px solid rgba(140,130,255,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
                  {ended ? (
                    <>
                      <span style={{ fontWeight: 900, fontSize: 21 }}>هذه الطاولة مغلقة</span>
                      <Link className="pb-btn pb-gold" to="/">العودة للرئيسية</Link>
                    </>
                  ) : (
                    <>
                      <Spinner size={38} />
                      <span style={{ fontWeight: 900, fontSize: 21 }}>في انتظار لاعب ثانٍ</span>
                      <span style={{ fontSize: 14, color: '#B4B6E4', lineHeight: 1.7 }}>{room.players.length} من {room.maxPlayers} لاعبين. ستبدأ المباراة تلقائيًا عند اكتمال الطاولة.</span>
                      {room.code && (
                        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                          <span dir="ltr" data-testid="room-code" style={{ flex: 1, height: 46, borderRadius: 12, background: '#0F1030', border: '1px dashed rgba(255,200,61,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, letterSpacing: '0.12em', color: '#FFC83D' }}>{room.code}</span>
                          <button type="button" className="pb-btn pb-violet pb-sm" onClick={copyCode} style={{ height: 46 }}>{copied ? 'تم النسخ ✓' : 'نسخ'}</button>
                        </div>
                      )}
                      <button type="button" className="pb-btn pb-plain pb-sm" onClick={leave}>إلغاء والعودة للرئيسية{room.stake ? ' (استرداد الرهان)' : ''}</button>
                    </>
                  )}
                </div>
              </div>
            )}
            {snap?.paused && offlineOpp !== null && !result && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 30, borderRadius: 22, background: 'rgba(10,11,30,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24 }}>
                <div role="alert" style={{ width: '100%', maxWidth: 440, padding: '18px 20px', borderRadius: 18, background: '#241A0E', border: '1px solid rgba(245,158,11,0.5)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <IconWifiOff size={24} style={{ color: '#FCD34D', flex: 'none', marginTop: 4 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <span style={{ fontWeight: 800, color: '#FCD34D' }}>انقطع اتصال {offP?.username}</span>
                    <span style={{ fontSize: 14, color: '#E7DCC4', lineHeight: 1.7 }}>المباراة متوقفة مؤقتًا. أمامه {offlineOpp} ثانية للعودة، وإلا يخرج من المباراة.</span>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(245,158,11,0.2)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, (offlineOpp / 60) * 100)}%`, height: '100%', marginInlineStart: 'auto', background: '#F59E0B' }} /></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside style={{ flex: '1 1 320px', maxWidth: 440, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {snap
            ? opps.map((p) => panel(p, false, p.username))
            : Array.from({ length: room.maxPlayers }, (_, seat) => room.players.find((p) => p.seat === seat) ?? seat)
                .filter((x) => typeof x === 'number' || x.userId !== user?.id)
                .map((x) => (typeof x === 'number'
                  ? panel(null, false, 'مكان شاغر', (['blue', 'yellow', 'red', 'green'] as Color[])[x])
                  : panel(null, false, x.username, x.color)))}

          <div style={{ padding: 20, borderRadius: 22, background: 'linear-gradient(160deg, #1E1A52, #14153A 60%)', border: '1px solid rgba(140,130,255,0.22)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, width: '100%' }}>
              <Die face={face} rolling={rolling} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#8A8CC0' }}>آخر رمية</span>
                <span data-testid="die-value" style={{ fontWeight: 900, fontSize: 32, lineHeight: 1.2, color: '#FFC83D' }}>{snap?.state.die ?? '—'}</span>
                <span style={{ fontSize: 13, lineHeight: 1.6, color: '#B4B6E4' }}>
                  {waiting ? 'سيتفعّل النرد عند اكتمال الطاولة.'
                    : result ? 'انتهت المباراة.'
                    : snap?.paused ? 'متوقف أثناء إعادة الاتصال.'
                    : !view?.myTurn ? 'انتظر حتى ينتهي دور الخصم.'
                    : view.phase !== 'roll' ? 'اختر بيدقًا: الدوائر المنقّطة تُظهر خانة الوصول.'
                    : 'الرقم 5 يُخرج بيدقًا · الرقم 6 يمنحك رمية إضافية.'}
                </span>
              </div>
            </div>
            <button type="button" data-testid="roll" className="pb-btn pb-gold pc-roll" disabled={!canRoll} onClick={roll}>
              <IconDice size={22} />
              {rolling ? 'جارٍ الرمي…' : view?.myTurn ? 'ارمِ النرد' : 'دور الخصم'}
            </button>
          </div>

          {panel(me, true, user?.username ?? '')}

          <div style={{ padding: '18px 20px', borderRadius: 22, background: '#14153A', border: '1px solid rgba(140,130,255,0.14)' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: '#A6A8D6' }}>سجل المباراة</h2>
            <ol data-testid="game-log" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(log.length ? log : [{ text: waiting ? 'في انتظار الخصم…' : 'بدأت المباراة.', color: '#A6A8D6' }]).map((l, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 14, color: '#D4D2F2' }}>
                  <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', transform: 'translateY(-1px)', background: l.color }} />{l.text}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </main>

      {result && !(iAmOut && dismissed) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(6,6,20,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="result-title" data-testid="result" style={{ width: '100%', maxWidth: 420, padding: '32px 28px 28px', borderRadius: 26, background: 'linear-gradient(170deg, #241C5E, #14153A 55%)', border: '1px solid rgba(255,200,61,0.4)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <span style={{ width: 88, height: 88, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(result === 'victory' ? { background: 'rgba(255,200,61,0.18)', color: '#FFC83D', boxShadow: '0 0 0 8px rgba(255,200,61,0.08), 0 0 40px rgba(255,200,61,0.35)' } : { background: 'rgba(140,130,255,0.14)', color: '#B4B6E4' }) }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5z" /></svg>
            </span>
            <span id="result-title" style={{ fontWeight: 900, fontSize: 34 }}>{result === 'victory' ? 'فوز!' : result === 'aborted' ? (practice ? 'انتهى التدريب' : 'أُلغيت') : 'خسارة'}</span>
            {practice && <span className="badge" style={{ background: 'rgba(34,197,94,0.14)', color: '#4ADE80' }}>تدريب: بدون عملات ولا خبرة ولا ترتيب</span>}
            <span style={{ fontSize: 15, lineHeight: 1.7, color: '#D4D2F2' }}>
              {result === 'victory'
                ? snap!.endReason === 'COMPLETED' ? 'أوصلت بيادقك الأربعة إلى البيت قبل الجميع.' : 'انسحب منافسوك، الفوز لك.'
                : result === 'aborted' ? (practice ? 'انتهت جلسة التدريب.' : 'أُلغيت المباراة وأُعيدت الرهانات.')
                : iAmOut ? 'خرجت من المباراة. يواصل الآخرون اللعب ويحصل الفائز على الرهانات.'
                : snap!.endReason === 'COMPLETED' ? `أوصل ${winnerP?.username} بيادقه الأربعة أولًا. الثأر بانتظارك!`
                : me?.eliminated ? 'خرجت من المباراة.' : `فاز ${winnerP?.username} بالانسحاب.`}
            </span>
            {result !== 'aborted' && !practice && (
              <div style={{ display: 'flex', gap: 10, width: '100%', margin: '6px 0' }}>
                <div style={{ flex: 1, padding: 12, borderRadius: 16, background: '#0F1030', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span dir="ltr" style={{ fontWeight: 900, fontSize: 22, color: '#FFC83D' }}>+{fmt(myPayout)}</span>
                  <span style={{ fontSize: 12, color: '#A6A8D6' }}>عملة افتراضية</span>
                </div>
                <div style={{ flex: 1, padding: 12, borderRadius: 16, background: '#0F1030', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span dir="ltr" style={{ fontWeight: 900, fontSize: 22, color: '#B9A8FF' }}>+{result === 'victory' ? WIN_XP : LOSS_XP}</span>
                  <span style={{ fontSize: 12, color: '#A6A8D6' }}>نقطة خبرة</span>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, width: '100%', flexWrap: 'wrap' }}>
              <button type="button" className="pb-btn pb-gold" style={{ flex: '1 1 140px' }} disabled={actions.busy} onClick={() => (practice ? actions.practice(room.maxPlayers - 1) : actions.quick(room.stake, room.maxPlayers))}>{result === 'defeat' ? 'مباراة الثأر' : 'العب مجددًا'}</button>
              <Link className="pb-btn pb-ghost" to="/" style={{ flex: '1 1 140px' }}>العودة للرئيسية</Link>
              {iAmOut && <button type="button" className="pb-btn pb-plain" style={{ flex: '1 1 100%' }} onClick={() => setDismissed(true)}>متابعة مشاهدة المباراة</button>}
            </div>
            {actions.error && <span className="field-error">{actions.error}</span>}
          </div>
        </div>
      )}

      {quit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(6,6,20,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="quit-title" style={{ width: '100%', maxWidth: 400, padding: 26, borderRadius: 24, background: '#14153A', border: '1px solid rgba(140,130,255,0.25)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span id="quit-title" style={{ fontWeight: 900, fontSize: 23 }}>{waiting ? 'مغادرة الطاولة؟' : 'مغادرة المباراة؟'}</span>
            <span style={{ fontSize: 15, lineHeight: 1.8, color: '#B4B6E4' }}>{practice ? 'ستنتهي جلسة التدريب. لا رهان ولا خسارة في الترتيب.' : waiting ? (room.players.length > 1 ? 'سيُتاح مكانك لِلاعب آخر ويُعاد رهانك.' : 'ستُلغى الطاولة ويُعاد رهانك.') : room.maxPlayers > 2 ? 'ستخرج من المباراة وتخسر رهانك، ويواصل الآخرون اللعب.' : 'ستُحتسب المباراة الجارية خسارةً ويفوز خصمك بالرهان.'}</span>
            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" className="pb-btn pb-ghost" onClick={() => setQuit(false)} style={{ flex: '1 1 140px' }}>متابعة اللعب</button>
              <button type="button" className="pb-btn pb-solid-danger" data-testid="confirm-quit" onClick={leave} style={{ flex: '1 1 140px' }}>مغادرة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
