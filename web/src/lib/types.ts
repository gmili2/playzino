export type Color = 'red' | 'yellow' | 'green' | 'blue';
export type GameType = 'PARCHEESI' | 'CONNECT4';

export interface Me {
  id: string;
  email: string;
  username: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
  balance: number;
  profile: {
    avatarColor: string;
    bio: string | null;
    xp: number;
    level: number;
    xpInLevel: number;
    xpForLevel: number;
    soundEnabled: boolean;
    invitesEnabled: boolean;
    hideOnline: boolean;
  };
  stats: { played: number; wins: number; losses: number; draws?: number; winRate: number };
}

export interface RoomPlayer {
  userId: string;
  username: string;
  seat: number;
  color: Color;
  avatarColor: string;
  level: number;
  isBot?: boolean;
}

export interface Room {
  id: string;
  code: string | null;
  name: string;
  gameType: GameType;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: 'WAITING' | 'PLAYING' | 'FINISHED' | 'CANCELLED';
  maxPlayers: number;
  stake: number;
  turnSeconds: number;
  isPractice?: boolean;
  quickMatch?: boolean;
  hostId: string;
  createdAt: string;
  gameId: string | null;
  players: RoomPlayer[];
}

export interface Move {
  pawn: number;
  from: number;
  to: number;
  capture?: { color: Color; pawn: number };
}

export type GameEvent =
  | { type: 'roll'; color: Color; value: number; moveValue: number }
  | { type: 'exit'; color: Color; pawn: number }
  | { type: 'move'; color: Color; pawn: number; from: number; to: number; bonus?: boolean }
  | { type: 'capture'; color: Color; victim: Color; pawn: number }
  | { type: 'home'; color: Color; pawn: number }
  | { type: 'bonus'; color: Color; amount: number }
  | { type: 'bonus_lost'; color: Color; amount: number }
  | { type: 'three_sixes'; color: Color; pawn: number | null }
  | { type: 'no_move'; color: Color; value: number }
  | { type: 'extra_turn'; color: Color }
  | { type: 'turn'; color: Color }
  | { type: 'eliminated'; color: Color }
  | { type: 'win'; color: Color }
  | { type: 'drop'; color: Color; column: number; row: number }
  | { type: 'draw' };

export interface GameSnapshot {
  gameId: string;
  roomId: string;
  gameType: GameType;
  room: { name: string; code: string; stake: number; visibility: string; turnSeconds: number; isPractice?: boolean };
  status: 'ACTIVE' | 'FINISHED' | 'ABORTED';
  state: {
    colors: Color[];
    turn: number;
    phase: 'roll' | 'move' | 'bonus' | 'play' | 'finished';
    winner: Color | null;
    out?: Color[];
    seq: number;
    // Parchís
    die?: number | null;
    moveValue?: number | null;
    pawns?: Record<string, number[]>;
    // Puissance 4 (grille 6 × 7, ligne 0 en haut)
    board?: (Color | null)[];
    draw?: boolean;
    winLine?: number[] | null;
    last?: number | null;
  };
  turnColor: Color | null;
  legalMoves: (Move | { column: number })[];
  players: (RoomPlayer & { online: boolean; offlineUntil: number | null; eliminated?: boolean })[];
  deadline: number | null;
  paused: boolean;
  winnerId: string | null;
  endReason: 'COMPLETED' | 'FORFEIT' | 'DISCONNECT' | 'ADMIN' | null;
  payouts: Record<string, number>;
  events: GameEvent[];
  serverTime: number;
}

export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Moyen de paiement fixé par la plateforme ; `available` = compte de dépôt renseigné. */
export interface Bank { id: string; name: string; logo: string; kind: 'rib' | 'phone'; accountHolder: string; rib: string; available: boolean }

export interface Deposit {
  id: string;
  username: string;
  userId: string;
  bank: string;
  amount: number;
  creditedAmount: number | null;
  status: PaymentStatus;
  note: string | null;
  receiptMime: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface Withdrawal {
  id: string;
  username: string;
  userId: string;
  amount: number;
  bankName: string;
  accountHolder: string;
  rib: string;
  status: PaymentStatus;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** Joueur connecté (page « اللاعبون المتصلون »). */
export interface OnlinePlayer { id: string; username: string; avatarColor: string; level: number; status: 'available' | 'playing'; acceptsChallenges: boolean }

/** Défi reçu d'un autre joueur, valable jusqu'à `expiresAt`. */
export interface IncomingChallenge {
  id: string;
  stake: number;
  gameType: GameType;
  /** Échéance sur l'horloge de CE navigateur (recalculée à la réception à partir de ttlMs). */
  expiresAt: number;
  ttlMs: number;
  from: { id: string; username: string; avatarColor: string; level: number };
}
