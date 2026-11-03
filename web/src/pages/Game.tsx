import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Board, type BoardPawn, type BoardTarget } from '../components/Board';
import { C4_COLS, C4_ROWS, Connect4Board } from '../components/Connect4Board';
import { IconArrowBack, IconCrown, IconLogout, IconMute, IconSmile, IconVolume, IconWifiOff } from '../components/Icons';
import { Avatar, Coin, Die, Loading, Spinner } from '../components/ui';
import { api, ApiError, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { COLOR_HEX, COLOR_NAME, fmt } from '../lib/format';
import { useRoomActions } from '../lib/hooks';
import { diceShake, preloadSfx, sfx, type Sfx } from '../lib/sounds';
import { STICKER_BY_ID, STICKER_COOLDOWN_MS, STICKERS, type StickerId } from '../lib/stickers';
import { emitAck, getSocket } from '../lib/socket';
import type { Color, GameEvent, GameSnapshot, Move, Room } from '../lib/types';

const WIN_XP = 250;
/** Attente maximale d'un adversaire sur une table publique avant de jouer contre le robot. */
const BOT_WAIT_SECONDS = 20;
const LOSS_XP = 60;

/** Effets sonores du jeu, coupés par le bouton haut-parleur. */
function useSound(enabled: boolean) {
  return useCallback((name: Sfx) => { if (enabled) sfx[name](); }, [enabled]);
}

/** Puissance 4 : décrit l'alignement gagnant (grille 6 × 7, ligne 0 en haut, colonnes numérotées de gauche à droite). */
function describeLine(line: number[] | null | undefined): string {
  if (!line || line.length < 2) return '';
  const first = line[0], lastCell = line[line.length - 1];
  const col = (i: number) => (i % C4_COLS) + 1;
  const rowFromBottom = (i: number) => C4_ROWS - Math.floor(i / C4_COLS);
  switch (line[1] - first) {
    case 1: return `أفقيًا في الصف ${rowFromBottom(first)} من الأسفل (من العمود ${col(first)} إلى ${col(lastCell)})`;
    case C4_COLS: return `عموديًا في العمود ${col(first)}`;
    default: return `قطريًا من العمود ${Math.min(col(first), col(lastCell))} إلى العمود ${Math.max(col(first), col(lastCell))}`;
  }
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
    case 'drop': return `${name(ev.color)} لعب في العمود ${ev.column + 1}.`;
    case 'draw': return 'تعادل: امتلأت الشبكة.';
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
  /** Incrémenté à chaque lancer reçu (le mien ou celui d'un adversaire) : le dé 3D roule à chaque fois. */
  const [rollId, setRollId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [gain, setGain] = useState<number | null>(null);
  const [log, setLog] = useState<{ text: string; color: string }[]>([]);
  const [quit, setQuit] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sound, setSound] = useState(user?.profile.soundEnabled ?? true);
  const [skew, setSkew] = useState(0);
  const lastSeq = useRef(-1);
  const play = useSound(sound);
  /** Sticker affiché au-dessus de l'avatar de chaque joueur (userId → sticker), effacé après quelques secondes. */
  const [bubbles, setBubbles] = useState<Record<string, { sticker: StickerId; at: number }>>({});
  const [picker, setPicker] = useState(false);
  const [stickerWait, setStickerWait] = useState(false);
  useEffect(() => { if (sound) preloadSfx(); }, [sound]);

  const gameId = room?.gameId ?? null;
  const me = snap?.players.find((p) => p.userId === user?.id) ?? null;
  const opps = snap ? snap.players.filter((p) => p.userId !== user?.id) : [];
  const winnerP = snap?.players.find((p) => p.userId === snap.winnerId) ?? null;
  const turnP = snap?.players.find((p) => p.color === snap.turnColor) ?? null;
  const offP = opps.find((p) => !p.online && p.offlineUntil && !p.eliminated) ?? null;
  const [dismissed, setDismissed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Puissance 4 gagné sur la grille : on laisse voir l'alignement gagnant avant d'ouvrir la fenêtre de résultat.
  const finished = !!snap && snap.status !== 'ACTIVE';
  const over = finished || (!!me?.eliminated && snap?.status === 'ACTIVE');
  const showLineFirst = finished && snap!.gameType === 'CONNECT4' && snap!.endReason === 'COMPLETED' && !!snap!.winnerId;
  useEffect(() => {
    if (!over) return setRevealed(false);
    setDismissed(false);
    const t = setTimeout(() => setRevealed(true), showLineFirst ? 2500 : 0);
    return () => clearTimeout(t);
  }, [over, finished, showLineFirst]);
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
        // Mon propre lancer sonne dès le clic ; ceux des adversaires à la réception.
        if (s.events.some((e) => e.type === 'roll')) setRollId((n) => n + 1);
        if (s.events.some((e) => e.type === 'roll' && e.color !== myColorRef.current)) play('dice');
        const at = s.events.some((e) => e.type === 'roll') ? 450 : 0;
        const pieceSound: Sfx | null = cap ? (cap.victim === myColorRef.current ? 'captured' : 'capture') : home ? 'home' : s.events.some((e) => e.type === 'exit') ? 'exit'
          : s.events.some((e) => e.type === 'move') ? 'move' : s.events.some((e) => e.type === 'drop') ? 'drop' : null;
        if (pieceSound) setTimeout(() => play(pieceSound), at);
      }
      // Fin de partie vécue en direct (pas au rechargement d'une partie déjà finie).
      if (statusRef.current === 'ACTIVE' && s.status === 'FINISHED' && s.winnerId) {
        setTimeout(() => play(s.winnerId === userIdRef.current ? 'win' : 'lose'), 500);
        const won = userIdRef.current ? s.payouts[userIdRef.current] ?? 0 : 0;
        if (s.winnerId === userIdRef.current && won > 0) setGain(won);
      }
      statusRef.current = s.status;
      lastSeq.current = Math.max(lastSeq.current, s.state.seq);
      if (s.status !== 'ACTIVE') refresh();
    },
    [play, refresh]
  );
  const nameOfRef = useRef(nameOf);
  nameOfRef.current = nameOf;
  const statusRef = useRef<GameSnapshot['status'] | null>(null);
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  const myColorRef = useRef<Color | undefined>(me?.color);
  myColorRef.current = me?.color;

  useEffect(() => {
    if (gain === null) return;
    const t = setTimeout(() => setGain(null), 2600);
    return () => clearTimeout(t);
  }, [gain]);

  // Seul sur une table de partie rapide : sans adversaire au bout de BOT_WAIT_SECONDS, partie contre le robot.
  // Une table créée pour un ami (avec code) attend son invité sans limite.
  const soloWaiting = room?.status === 'WAITING' && !!room.quickMatch && room.players.length === 1 && room.players[0].userId === user?.id;
  const playBot = useCallback(async () => {
    try {
      const r = await api.post<{ room: Room }>(`/api/rooms/${roomId}/play-bot`);
      await refresh();
      nav('/room/' + r.room.id, { replace: true });
    } catch (e) {
      // Un adversaire est arrivé entre-temps : la partie normale démarre, rien à faire.
      if (!(e instanceof ApiError && ['OPPONENT_FOUND', 'ROOM_NOT_WAITING', 'NOT_QUICK_MATCH'].includes(e.code))) setError(errorText(e));
    }
  }, [roomId, refresh, nav]);
  useEffect(() => {
    if (!soloWaiting) return;
    const t = setTimeout(playBot, BOT_WAIT_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [soloWaiting, playBot]);

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
          setLog([{ text: 'بدأت المباراة. حظًا موفقًا!', color: '#A9A3B5' }]);
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

  // Stickers reçus (les miens aussi : le serveur les renvoie à toute la partie).
  useEffect(() => {
    if (!gameId) return;
    const s = getSocket();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const onSticker = (m: { userId: string; sticker: StickerId; at: number }) => {
      if (!STICKER_BY_ID[m.sticker]) return;
      setBubbles((b) => ({ ...b, [m.userId]: { sticker: m.sticker, at: m.at } }));
      play('sticker');
      const t = setTimeout(() => {
        timers.delete(t);
        setBubbles((b) => (b[m.userId]?.at === m.at ? Object.fromEntries(Object.entries(b).filter(([k]) => k !== m.userId)) : b));
      }, 2800);
      timers.add(t);
    };
    s.on('game:sticker', onSticker);
    return () => {
      s.off('game:sticker', onSticker);
      timers.forEach(clearTimeout);
    };
  }, [gameId, play]);

  const sendSticker = async (sticker: StickerId) => {
    if (!gameId || stickerWait) return;
    setPicker(false);
    setStickerWait(true);
    setTimeout(() => setStickerWait(false), STICKER_COOLDOWN_MS);
    try {
      await emitAck('game:sticker', { gameId, sticker });
    } catch (e) {
      setToast(errorText(e));
    }
  };

  // Quitter l'écran de la partie (retour, accueil, solde…) = absent : après le délai de retour, l'adversaire gagne.
  useEffect(() => {
    if (!gameId) return;
    return () => { getSocket().emit('game:leave', gameId); };
  }, [gameId]);

  const now = useNow(!!snap && snap.status === 'ACTIVE');

  // --- actions joueur (toujours validées par le serveur) ---
  const roll = async () => {
    if (!gameId || busy) return;
    setBusy(true);
    setRolling(true);
    // Les dés sont secoués pendant l'attente du résultat, puis lancés : le bruit du dé qui roule accompagne sa chute.
    const stopShake = sound ? diceShake() : () => undefined;
    const started = Date.now();
    try {
      const data = await emitAck<GameSnapshot>('game:roll', gameId);
      await new Promise((r) => setTimeout(r, Math.max(0, 650 - (Date.now() - started))));
      stopShake();
      play('dice');
      applySnap(data);
    } catch (e) {
      stopShake();
      setToast(errorText(e));
    } finally {
      setRolling(false);
      setBusy(false);
    }
  };

  const drop = async (column: number) => {
    if (!gameId || busy) return;
    setBusy(true);
    try {
      applySnap(await emitAck<GameSnapshot>('game:drop', { gameId, column }));
    } catch (e) {
      setToast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const move = async (pawn: number) => {
    if (!gameId || busy) return;
    setBusy(true);
    try {
      applySnap(await emitAck<GameSnapshot>('game:move', { gameId, pawn }));
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
    // Puissance 4 : colonnes jouables par ce joueur.
    const columns = myTurn && snap.gameType === 'CONNECT4' ? snap.legalMoves.map((m) => (m as { column: number }).column) : [];
    const movable = new Map<number, number>();
    if (myTurn && (phase === 'move' || phase === 'bonus')) (snap.legalMoves as Move[]).forEach((m) => movable.set(m.pawn, m.to));
    const pawns: BoardPawn[] = snap.state.colors.flatMap((c) =>
      (snap.state.pawns?.[c] ?? []).map((p, slot) => ({
        color: c, p, slot,
        movable: c === me.color && movable.has(slot),
        onPick: c === me.color && movable.has(slot) && !busy ? () => move(slot) : undefined
      }))
    );
    const targets: BoardTarget[] = [...movable.entries()].map(([slot, to]) => ({ color: me.color, p: to, slot }));
    return { active, myTurn, phase, pawns, targets, columns };
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
  const result = snap && snap.status !== 'ACTIVE'
    ? (snap.status === 'ABORTED' ? 'aborted' : snap.winnerId === user?.id ? 'victory' : snap.winnerId === null ? 'draw' : 'defeat')
    : iAmOut ? 'defeat' : null;
  const practice = !!room.isPractice;
  const c4 = room.gameType === 'CONNECT4';
  const winLineText = c4 && snap?.endReason === 'COMPLETED' ? describeLine(snap.state.winLine) : '';
  // Même ordre que GAME_RULES.seatColors côté serveur.
  const seatColors: Color[] = c4 ? ['red', 'yellow'] : ['blue', 'green', 'yellow', 'red'];
  const playersLabel = (n: number) => (n === 2 ? 'لاعبان' : `${n} لاعبين`);

  // Bandeau d'état (couleurs du design).
  let bannerTitle = '', bannerSub = '', tone = '#22D3EE';
  if (waiting) { bannerTitle = 'في انتظار خصم'; bannerSub = room.code ? `شارك الرمز ${room.code} لدعوة صديق` : 'ستبدأ المباراة عند انضمام لاعب'; }
  else if (!snap || !view) { bannerTitle = 'جارٍ الاتصال…'; bannerSub = 'تحميل حالة المباراة'; tone = '#B9A8FF'; }
  else if (result) {
    bannerTitle = result === 'victory' ? 'فوز!' : result === 'aborted' ? 'أُلغيت المباراة' : result === 'draw' ? 'تعادل' : 'انتهت المباراة';
    bannerSub = winLineText && result !== 'draw' ? `${result === 'victory' ? 'صففت' : `صفّ ${winnerP?.username ?? 'الخصم'}`} أربع قطع ${winnerP?.color === 'red' ? 'حمراء' : 'صفراء'} ${winLineText} — الخط مضاء على اللوحة`
      : result === 'victory' ? (c4 ? 'صففت أربع قطع على التوالي' : 'بيادقك الأربعة في البيت') : result === 'draw' ? 'امتلأت الشبكة دون أربع قطع متتالية' : result === 'aborted' ? (practice ? 'انتهت جلسة التدريب' : 'تمت إعادة الرهانات') : iAmOut ? 'خرجت من المباراة، والآخرون يواصلون اللعب' : `فاز ${winnerP?.username ?? 'الخصم'} بهذه الجولة`;
    tone = result === 'victory' ? '#22C55E' : result === 'draw' ? '#22D3EE' : '#F43F5E';
  } else if (snap.paused) { bannerTitle = 'المباراة متوقفة'; bannerSub = `${offP ? offP.username : 'أنت'} يحاول إعادة الاتصال`; tone = '#F59E0B'; }
  else if (view.myTurn) {
    tone = '#FFC83D';
    bannerTitle = 'دورك!';
    bannerSub = c4 ? 'اختر عمودًا لإسقاط قطعتك'
      : view.phase === 'bonus' ? `مكافأة: اختر بيدقًا للتقدم ${snap.state.moveValue} خانة`
      : view.phase === 'move' ? `اختر بيدقًا مضيئًا للتقدم ${snap.state.moveValue} خانات`
      : rolling ? 'النرد يتدحرج…' : 'ارمِ النرد';
  } else { tone = '#B9A8FF'; bannerTitle = `دور ${turnP?.username ?? 'الخصم'}`; bannerSub = 'يلعب الآن… انتظر قليلًا'; }

  type Seat = { key: string; color: Color; name: string; isMe: boolean; vacant: boolean; isBot: boolean; level: number | null; avatarColor: string; p: GameSnapshot['players'][number] | null };
  const seats: Seat[] = snap
    ? snap.players.map((p) => ({ key: p.color, color: p.color, name: p.username, isMe: p.userId === user?.id, vacant: false, isBot: !!p.isBot, level: p.level, avatarColor: p.avatarColor, p }))
    : Array.from({ length: room.maxPlayers }, (_, seat) => {
        const rp = room.players.find((x) => x.seat === seat);
        const color = rp?.color ?? seatColors[seat];
        return { key: color, color, name: rp ? rp.username : 'مكان شاغر', isMe: rp?.userId === user?.id, vacant: !rp, isBot: !!rp?.isBot, level: rp?.level ?? null, avatarColor: rp?.avatarColor ?? '#3B4A8C', p: null };
      });
  // Chaque joueur est affiché près de son camp sur le plateau ; Puissance 4 : moi en bas, l'adversaire en haut.
  const PARCHIS_CORNER: Record<Color, 'tl' | 'tr' | 'bl' | 'br'> = { yellow: 'tl', green: 'tr', blue: 'bl', red: 'br' };
  const cornerOf = (st: Seat) => (c4 ? (st.isMe ? 'bl' : 'tr') : PARCHIS_CORNER[st.color]);

  const seatCard = (corner: 'tl' | 'tr' | 'bl' | 'br') => {
    const st = seats.find((x) => cornerOf(x) === corner);
    const right = corner === 'tr' || corner === 'br';
    if (!st) return <div className="lg-seat" />;
    const hex = COLOR_HEX[st.color];
    const activeTurn = !!snap && snap.status === 'ACTIVE' && !snap.paused && snap.turnColor === st.color;
    const out = !!st.p?.eliminated;
    const offline = !!st.p && !st.p.online && !out && snap?.status === 'ACTIVE';
    const won = !!snap && snap.winnerId !== null && snap.players.find((x) => x.userId === snap.winnerId)?.color === st.color;
    const arr = snap?.state.pawns?.[st.color] ?? [-1, -1, -1, -1];
    const tokens = snap?.state.board?.filter((c) => c === st.color).length ?? 0;
    const b = st.p ? bubbles[st.p.userId] : undefined;
    const bubble = b ? { at: b.at, s: STICKER_BY_ID[b.sticker] } : null;
    const tag = out ? 'خرج' : st.vacant ? 'في الانتظار…' : waiting ? 'جاهز' : offline ? 'غير متصل' : activeTurn ? (st.isMe ? 'دورك' : 'دوره') : null;
    return (
      <div className={'lg-seat' + (right ? ' right' : '')} data-testid={st.isMe ? 'panel-me' : 'panel-opp'} style={{ opacity: out || st.vacant ? 0.5 : offline ? 0.75 : 1 }}>
        <span className={'lg-av' + (activeTurn ? ' turn' : '')}>
          {(won || activeTurn) && <IconCrown size={24} className="lg-crown" />}
          <Avatar name={st.name} color={st.vacant ? '#3B4A8C' : st.isMe ? hex : st.avatarColor} size={54} style={{ boxShadow: `inset 0 0 0 3px ${hex}` }} />
          {bubble && (
            <span key={bubble.at} className={'lg-sticker' + ('emoji' in bubble.s ? ' emoji' : '') + (right ? ' right' : '')} data-testid="sticker-bubble" style={{ borderColor: hex }}>
              {'emoji' in bubble.s ? bubble.s.emoji : bubble.s.text}
            </span>
          )}
        </span>
        <span className="lg-seat-info">
          <span className="lg-seat-name">{st.isMe ? 'أنت' : st.name}</span>
          <span className="lg-seat-sub">
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: hex, boxShadow: '0 0 0 2px rgba(255,255,255,.6)' }} />
            <span dir="ltr" title={c4 ? 'القطع الملعوبة' : 'بيادق في البيت'}>{c4 ? `${tokens}/21` : `${arr.filter((v) => v === 71).length}/4`}</span>
            {st.level !== null && !st.vacant && <span className="lg-pill pb-hide-sm">المستوى {st.level}</span>}
            {tag && <span className="lg-pill" style={activeTurn ? { background: hex, color: st.color === 'yellow' ? '#2A1E00' : '#fff' } : offline ? { background: 'rgba(245,158,11,.4)' } : undefined}>{tag}</span>}
            {activeTurn && deadlineLeft !== null && view?.active && <span className="lg-pill" data-testid={st.isMe ? 'turn-timer' : undefined} style={{ background: deadlineLeft <= 5 ? '#E5484D' : 'rgba(0,0,0,.35)' }}>{deadlineLeft} ث</span>}
          </span>
        </span>
      </div>
    );
  };

  const canRoll = !!view?.myTurn && view.phase === 'roll' && !busy;
  const face = snap?.state.die ?? 5;
  const myPayout = snap && user ? snap.payouts[user.id] ?? 0 : 0;

  return (
    <div dir="rtl" className="lg-root">
      <div className="lg-frame">
        <header className="lg-top" dir="ltr">
          <div className="lg-top-side">
            {/* Retour pendant l'attente : la table est quittée (mise remboursée) au lieu de rester ouverte. */}
            <button type="button" className="lg-round" aria-label="الرئيسية" onClick={() => (waiting ? leave() : snap?.status === 'ACTIVE' && !iAmOut && !practice ? setQuit(true) : nav('/'))}><IconArrowBack size={26} style={{ transform: 'scaleX(-1)' }} /></button>
            {!result && <button type="button" className="lg-round" aria-label="مغادرة" title="مغادرة" onClick={() => setQuit(true)}><IconLogout size={24} /></button>}
          </div>
          <Link to="/cashier" className="lg-balance" title="رصيدي · إيداع" data-testid="balance">
            <Coin size={28} /><span dir="ltr">{fmt(user?.balance ?? 0)}</span><span className="lg-plus" aria-hidden="true">+</span>
          </Link>
          <div className="lg-top-side">
            {snap?.status === 'ACTIVE' && me && !me.eliminated && (
              <span style={{ position: 'relative' }}>
                <button type="button" className="lg-round" data-testid="sticker-open" aria-expanded={picker} aria-label="ملصقات" title="ملصقات" disabled={stickerWait} onClick={() => setPicker(!picker)} style={stickerWait ? { opacity: 0.5 } : undefined}>
                  <IconSmile size={26} />
                </button>
                {picker && <span style={{ position: 'fixed', inset: 0, zIndex: 59 }} onClick={() => setPicker(false)} />}
                {picker && (
                  <div className="lg-sticker-picker" role="menu" dir="rtl">
                    {STICKERS.map((st) => (
                      <button key={st.id} type="button" role="menuitem" className={'emoji' in st ? 'emoji' : 'text'} data-testid={`sticker-${st.id}`} onClick={() => sendSticker(st.id)}>
                        {'emoji' in st ? st.emoji : st.text}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            )}
            <button type="button" className="lg-round" aria-pressed={sound} aria-label={sound ? 'كتم الصوت' : 'تشغيل الصوت'} onClick={() => setSound(!sound)}>
              {sound ? <IconVolume size={26} /> : <IconMute size={26} />}
            </button>
            <span className="lg-round" data-testid="net-status" title={connected ? 'متصل' : 'جارٍ إعادة الاتصال…'} style={{ cursor: 'default' }}>
              {connected ? <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 10px #4ADE80' }} /> : <IconWifiOff size={24} />}
            </span>
          </div>
        </header>

        <div role="status" aria-live="polite" data-testid="banner" className="lg-banner" style={{ borderColor: tone + '99' }}>
          <span className="pc-pulse" style={{ width: 10, height: 10, borderRadius: '50%', background: tone }} />
          <b>{bannerTitle}</b><span style={{ color: '#DCE6FF' }}>{bannerSub}</span>
          <span style={{ color: '#9FB6F0', fontSize: 12 }}>· {room.name}{room.stake ? ` · رهان ${fmt(room.stake)}` : ''}{practice ? ' · بدون رهان' : ''}</span>
          {result && dismissed && !iAmOut && <button type="button" className="pb-btn pb-gold pb-sm" onClick={() => setDismissed(false)}>النتيجة</button>}
        </div>
        {error && <div role="alert" className="alert alert-error">{error}</div>}

        <div className="lg-row" dir="ltr">{seatCard('tl')}{seatCard('tr')}</div>

        <div className="lg-board" style={c4 ? { background: 'none', boxShadow: 'none', padding: 0 } : undefined}>
          {c4 ? (
            <Connect4Board
              board={snap?.state.board}
              last={snap?.state.last}
              winLine={snap?.state.winLine}
              playable={busy ? [] : view?.columns}
              myColor={me?.color}
              onDrop={drop}
            />
          ) : (
            <Board
              pawns={view?.pawns ?? (['blue', 'yellow', 'red', 'green'] as Color[]).slice(0, room.maxPlayers).flatMap((c) => [0, 1, 2, 3].map((slot) => ({ color: c, p: -1, slot })))}
              targets={view?.targets}
              names={Object.fromEntries((snap?.players ?? room.players).map((p) => [p.color, p.userId === user?.id ? 'أنت' : p.username]))}
              turn={view?.active ? snap?.turnColor : null}
              die={snap?.state.die}
            />
          )}
          {(toast || gain !== null) && (
            <div className="lg-toast" role="status">
              <span className="lg-check"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
              <span className="lg-toast-text">
                {gain !== null ? <>تم جمع الرصيد بنجاح<b dir="ltr">+{fmt(gain)}</b></> : toast}
              </span>
            </div>
          )}
          {(waiting || ended) && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 30, borderRadius: 24, background: 'rgba(4,10,50,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div data-testid="waiting-overlay" style={{ width: '100%', maxWidth: 380, padding: 26, borderRadius: 24, background: 'linear-gradient(180deg,#14307F,#0A1A55)', boxShadow: '0 0 0 3px #4F8BFF, 0 20px 50px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
                {ended ? (
                  <>
                    <span style={{ fontWeight: 900, fontSize: 21 }}>هذه الطاولة مغلقة</span>
                    <Link className="pb-btn pb-gold" to="/">العودة للرئيسية</Link>
                  </>
                ) : (
                  <>
                    <Spinner size={38} />
                    <span style={{ fontWeight: 900, fontSize: 21 }}>البحث عن لاعب…</span>
                    <span style={{ fontSize: 14, color: '#C9D8FF', lineHeight: 1.7 }}>{room.players.length} من {room.maxPlayers} لاعبين. ستبدأ المباراة تلقائيًا عند اكتمال الطاولة.</span>
                    {room.code && (
                      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        <span dir="ltr" data-testid="room-code" style={{ flex: 1, height: 46, borderRadius: 12, background: '#06103A', border: '1px dashed rgba(255,200,61,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, letterSpacing: '0.12em', color: '#FFC83D' }}>{room.code}</span>
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
            <div style={{ position: 'absolute', inset: 0, zIndex: 30, borderRadius: 24, background: 'rgba(4,10,50,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20 }}>
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

        <div className="lg-row" dir="ltr">
          {seatCard('bl')}
          {c4 ? (
            <div className="lg-tray" aria-hidden="true" style={{ cursor: 'default' }}>
              <span style={{ width: '62%', aspectRatio: '1', borderRadius: '50%', background: COLOR_HEX[me?.color ?? 'red'], boxShadow: 'inset 0 -6px 0 rgba(0,0,0,.25), inset 0 4px 0 rgba(255,255,255,.35)', opacity: view?.myTurn ? 1 : 0.45 }} />
            </div>
          ) : (
            <button type="button" data-testid="roll" className={'lg-tray' + (canRoll ? ' ready' : '')} disabled={!canRoll} onClick={roll} aria-label={rolling ? 'جارٍ الرمي…' : view?.myTurn ? 'ارمِ النرد' : 'دور الخصم'}>
              <Die face={face} rolling={rolling} rollId={rollId} size={64} />
            </button>
          )}
          {seatCard('br')}
        </div>
        {!c4 && (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#C9D8FF', marginTop: -2 }}>
            آخر رمية: <b data-testid="die-value" style={{ color: '#FFD54A', fontSize: 16 }}>{snap?.state.die ?? '—'}</b>
            {' · '}{canRoll ? 'اضغط على النرد لرميه' : view?.myTurn && view.phase !== 'roll' ? 'اختر بيدقًا مضيئًا' : 'الرقم 5 يُخرج بيدقًا · الرقم 6 يمنحك رمية إضافية'}
          </div>
        )}

        <details className="lg-log">
          <summary>سجل المباراة</summary>
          <ol data-testid="game-log" style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(log.length ? log : [{ text: waiting ? 'في انتظار الخصم…' : 'بدأت المباراة.', color: '#A9A3B5' }]).map((l, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, color: '#E3EBFF' }}>
                <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', transform: 'translateY(-1px)', background: l.color }} />{l.text}
              </li>
            ))}
          </ol>
        </details>
      </div>

      {result && revealed && !dismissed && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(6,6,20,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="result-title" data-testid="result" style={{ width: '100%', maxWidth: 420, padding: '32px 28px 28px', borderRadius: 26, background: 'linear-gradient(170deg, #241C5E, #1B1824 55%)', border: '1px solid rgba(255,200,61,0.4)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <span style={{ width: 88, height: 88, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(result === 'victory' ? { background: 'rgba(255,200,61,0.18)', color: '#FFC83D', boxShadow: '0 0 0 8px rgba(255,200,61,0.08), 0 0 40px rgba(255,200,61,0.35)' } : { background: 'rgba(255,222,170,0.14)', color: '#B8B2C4' }) }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5z" /></svg>
            </span>
            <span id="result-title" style={{ fontWeight: 900, fontSize: 34 }}>{result === 'victory' ? 'فوز!' : result === 'aborted' ? (practice ? 'انتهى التدريب' : 'أُلغيت') : result === 'draw' ? 'تعادل' : 'خسارة'}</span>
            {practice && <span className="badge" style={{ background: 'rgba(34,197,94,0.14)', color: '#4ADE80' }}>مباراة ودية: بدون رهان ولا خبرة ولا ترتيب</span>}
            <span style={{ fontSize: 15, lineHeight: 1.7, color: '#DAD5E2' }}>
              {result === 'victory'
                ? snap!.endReason === 'COMPLETED' ? (c4 ? `صففت أربع قطع على التوالي ${winLineText} قبل خصمك.` : 'أوصلت بيادقك الأربعة إلى البيت قبل الجميع.') : 'انسحب منافسوك، الفوز لك.'
                : result === 'draw' ? `امتلأت الشبكة دون فائز${room.stake && !practice ? '، وأُعيد رهان كل لاعب' : ''}.`
                : result === 'aborted' ? (practice ? 'انتهت جلسة التدريب.' : 'أُلغيت المباراة وأُعيدت الرهانات.')
                : iAmOut ? 'خرجت من المباراة. يواصل الآخرون اللعب ويحصل الفائز على الرهانات.'
                : snap!.endReason === 'COMPLETED' ? (c4 ? `خسرت لأن ${winnerP?.username} صفّ أربع قطع من لونه ${winLineText} قبلك. تلميح: عندما يصفّ خصمك ثلاث قطع، ضع قطعتك في الخانة التي تكمل خطّه.` : `أوصل ${winnerP?.username} بيادقه الأربعة أولًا. الثأر بانتظارك!`)
                : snap!.endReason === 'DISCONNECT' ? 'خسرت لأنك بقيت غير متصل أكثر من المدة المسموح بها.'
                : me?.eliminated ? 'خسرت لأنك انسحبت من المباراة.' : `فاز ${winnerP?.username} بالانسحاب.`}
            </span>
            {result !== 'aborted' && !practice && (
              <div style={{ display: 'flex', gap: 10, width: '100%', margin: '6px 0' }}>
                <div style={{ flex: 1, padding: 12, borderRadius: 16, background: '#110E17', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span dir="ltr" style={{ fontWeight: 900, fontSize: 22, color: '#FFC83D' }}>+{fmt(myPayout)}</span>
                  <span style={{ fontSize: 12, color: '#A9A3B5' }}>عملة</span>
                </div>
                <div style={{ flex: 1, padding: 12, borderRadius: 16, background: '#110E17', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span dir="ltr" style={{ fontWeight: 900, fontSize: 22, color: '#B9A8FF' }}>+{result === 'victory' ? WIN_XP : LOSS_XP}</span>
                  <span style={{ fontSize: 12, color: '#A9A3B5' }}>نقطة خبرة</span>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, width: '100%', flexWrap: 'wrap' }}>
              <button type="button" className="pb-btn pb-gold" style={{ flex: '1 1 140px' }} disabled={actions.busy} onClick={() => (practice ? actions.practice(room.maxPlayers - 1, room.gameType) : actions.quick(room.stake, room.maxPlayers, room.gameType))}>{result === 'defeat' ? 'مباراة الثأر' : 'العب مجددًا'}</button>
              <Link className="pb-btn pb-ghost" to="/" style={{ flex: '1 1 140px' }}>العودة للرئيسية</Link>
              <button type="button" className="pb-btn pb-plain" style={{ flex: '1 1 100%' }} onClick={() => setDismissed(true)}>{iAmOut ? 'متابعة مشاهدة المباراة' : 'عرض اللوحة'}</button>
            </div>
            {actions.error && <span className="field-error">{actions.error}</span>}
          </div>
        </div>
      )}

      {quit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(6,6,20,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="quit-title" style={{ width: '100%', maxWidth: 400, padding: 26, borderRadius: 24, background: '#1B1824', border: '1px solid rgba(255,222,170,0.25)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span id="quit-title" style={{ fontWeight: 900, fontSize: 23 }}>{waiting ? 'مغادرة الطاولة؟' : 'مغادرة المباراة؟'}</span>
            <span style={{ fontSize: 15, lineHeight: 1.8, color: '#B8B2C4' }}>{practice ? 'ستنتهي جلسة التدريب. لا رهان ولا خسارة في الترتيب.' : waiting ? (room.players.length > 1 ? 'سيُتاح مكانك لِلاعب آخر ويُعاد رهانك.' : 'ستُلغى الطاولة ويُعاد رهانك.') : room.maxPlayers > 2 ? 'ستخرج من المباراة وتخسر رهانك، ويواصل الآخرون اللعب.' : 'ستُحتسب المباراة الجارية خسارةً ويفوز خصمك بالرهان.'}</span>
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
