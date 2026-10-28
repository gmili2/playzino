export type Color = 'red' | 'yellow' | 'green' | 'blue';

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
  stats: { played: number; wins: number; losses: number; winRate: number };
}

export interface RoomPlayer {
  userId: string;
  username: string;
  seat: number;
  color: Color;
  avatarColor: string;
  level: number;
}

export interface Room {
  id: string;
  code: string | null;
  name: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: 'WAITING' | 'PLAYING' | 'FINISHED' | 'CANCELLED';
  maxPlayers: number;
  stake: number;
  turnSeconds: number;
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
  | { type: 'win'; color: Color };

export interface GameSnapshot {
  gameId: string;
  roomId: string;
  room: { name: string; code: string; stake: number; visibility: string; turnSeconds: number };
  status: 'ACTIVE' | 'FINISHED' | 'ABORTED';
  state: {
    colors: Color[];
    turn: number;
    phase: 'roll' | 'move' | 'bonus' | 'finished';
    die: number | null;
    moveValue: number | null;
    pawns: Record<string, number[]>;
    winner: Color | null;
    seq: number;
  };
  turnColor: Color | null;
  legalMoves: Move[];
  players: (RoomPlayer & { online: boolean; offlineUntil: number | null })[];
  deadline: number | null;
  paused: boolean;
  winnerId: string | null;
  endReason: 'COMPLETED' | 'FORFEIT' | 'DISCONNECT' | 'ADMIN' | null;
  payouts: Record<string, number>;
  events: GameEvent[];
  serverTime: number;
}
