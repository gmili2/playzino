import { randomInt } from 'node:crypto';
import type { GameEndReason, GameType } from '@prisma/client';
import { config } from '../config.js';
import { audit } from '../lib/audit.js';
import { AppError, forbidden, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { getBotLevel } from '../lib/settings.js';
import { upgradeState, type Color, type GameState } from '../game/engine.js';
import { GAME_RULES, type Action, type AnyEvent, type AnyState, type GameRules, type Step } from '../game/rules.js';
import { applyWalletOp } from '../modules/wallet/wallet.service.js';

export const WIN_XP = 250;
export const LOSS_XP = 60;

interface LivePlayer {
  userId: string;
  username: string;
  color: Color;
  avatarColor: string;
  level: number;
  isBot: boolean;
}

/** Délai entre deux actions d'un robot : assez long pour que les joueurs suivent son coup. */
export const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 900);

interface LiveGame {
  id: string;
  roomId: string;
  gameType: GameType;
  rules: GameRules;
  room: { name: string; code: string; stake: number; visibility: string; turnSeconds: number; isPractice: boolean };
  state: AnyState;
  players: LivePlayer[];
  status: 'ACTIVE' | 'FINISHED' | 'ABORTED';
  winnerId: string | null;
  endReason: GameEndReason | null;
  payouts: Record<string, number>;
  deadline: number | null;
  turnTimer: NodeJS.Timeout | null;
  /** userId → horodatage limite de reconnexion. */
  offline: Map<string, { until: number; timer: NodeJS.Timeout }>;
  /** File d'attente : les actions d'une partie sont traitées strictement une par une. */
  queue: Promise<unknown>;
  lastEvents: AnyEvent[];
}

export interface Broadcaster {
  emitGame(gameId: string, event: string, payload: unknown): void;
  emitRoom(roomId: string, event: string, payload: unknown): void;
  emitLobby(): void;
  isOnline(gameId: string, userId: string): boolean;
}

const noopBroadcaster: Broadcaster = {
  emitGame() {},
  emitRoom() {},
  emitLobby() {},
  isOnline: () => false
};

export class GameManager {
  private games = new Map<string, LiveGame>();
  private bc: Broadcaster = noopBroadcaster;
  /** Générateur du dé — remplaçable uniquement dans les tests. */
  rollDie: () => number = () => randomInt(1, 7);

  /** Joueur éliminé (abandon/déconnexion dans une partie à 3 ou 4) : ne joue plus, ne met plus la partie en pause. */
  private isOut(live: LiveGame, userId: string) {
    const p = live.players.find((x) => x.userId === userId);
    return !!p && (live.state.out ?? []).includes(p.color);
  }

  private humanStillPlaying(live: LiveGame) {
    const active = live.rules.active(live.state);
    return live.players.some((p) => !p.isBot && active.includes(p.color));
  }

  setBroadcaster(bc: Broadcaster) {
    this.bc = bc;
  }

  /** Charge une partie depuis MariaDB (après création ou redémarrage du serveur). */
  async load(gameId: string): Promise<LiveGame> {
    const cached = this.games.get(gameId);
    if (cached) return cached;
    const g = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        room: true,
        players: { include: { user: { select: { username: true, isBot: true, profile: { select: { avatarColor: true, xp: true } } } } } }
      }
    });
    if (!g) throw notFound('Partie introuvable');
    const parsed = JSON.parse(g.state) as AnyState;
    const state = g.room.gameType === 'PARCHEESI' ? upgradeState(parsed as GameState) : parsed;
    const live: LiveGame = {
      id: g.id,
      roomId: g.roomId,
      gameType: g.room.gameType,
      rules: GAME_RULES[g.room.gameType],
      room: { name: g.room.name, code: g.room.code, stake: g.room.stake, visibility: g.room.visibility, turnSeconds: g.room.turnSeconds, isPractice: g.room.isPractice },
      state,
      players: state.colors.map((c) => {
        const p = g.players.find((x) => x.color === c)!;
        return {
          userId: p.userId,
          username: p.user.username,
          color: c,
          avatarColor: p.user.profile?.avatarColor ?? '#2F6BFF',
          level: Math.floor((p.user.profile?.xp ?? 0) / 1000) + 1,
          isBot: p.user.isBot
        };
      }),
      status: g.status,
      winnerId: g.winnerId,
      endReason: g.endReason,
      payouts: Object.fromEntries(g.players.map((p) => [p.userId, p.payout])),
      deadline: null,
      turnTimer: null,
      offline: new Map(),
      queue: Promise.resolve(),
      lastEvents: []
    };
    const again = this.games.get(gameId);
    if (again) return again;
    this.games.set(gameId, live);
    if (live.status === 'ACTIVE') {
      // Personne n'est encore connecté : chacun dispose du délai de reconnexion.
      for (const p of live.players) {
        if (!p.isBot && !this.bc.isOnline(gameId, p.userId) && !this.isOut(live, p.userId)) this.markOffline(live, p.userId);
      }
      this.scheduleTurn(live);
    }
    return live;
  }

  /** Reprise après redémarrage : toutes les parties actives en base repassent en mémoire. */
  async recoverActiveGames() {
    const active = await prisma.game.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const g of active) await this.load(g.id);
    return active.length;
  }

  snapshot(live: LiveGame) {
    const paused = live.offline.size > 0 && live.status === 'ACTIVE';
    return {
      gameId: live.id,
      roomId: live.roomId,
      gameType: live.gameType,
      room: live.room,
      status: live.status,
      state: live.state,
      turnColor: live.status === 'ACTIVE' ? live.rules.current(live.state) : null,
      legalMoves: live.status === 'ACTIVE' ? live.rules.legalMoves(live.state) : [],
      players: live.players.map((p) => ({
        ...p,
        online: p.isBot || this.bc.isOnline(live.id, p.userId),
        eliminated: (live.state.out ?? []).includes(p.color),
        offlineUntil: live.offline.get(p.userId)?.until ?? null
      })),
      deadline: paused ? null : live.deadline,
      paused,
      winnerId: live.winnerId,
      endReason: live.endReason,
      payouts: live.payouts,
      events: live.lastEvents,
      serverTime: Date.now()
    };
  }

  async getSnapshotFor(gameId: string, userId: string) {
    const live = await this.load(gameId);
    if (!live.players.some((p) => p.userId === userId)) throw forbidden('Vous ne participez pas à cette partie');
    return this.snapshot(live);
  }

  private enqueue<T>(live: LiveGame, fn: () => Promise<T>): Promise<T> {
    const run = live.queue.then(fn, fn);
    live.queue = run.catch(() => undefined);
    return run;
  }

  private assertTurn(live: LiveGame, userId: string) {
    if (live.status !== 'ACTIVE') throw new AppError(409, 'GAME_OVER', 'La partie est terminée');
    const player = live.players.find((p) => p.userId === userId);
    if (!player) throw forbidden('Vous ne participez pas à cette partie');
    if (live.offline.size > 0) throw new AppError(409, 'GAME_PAUSED', 'Partie en pause : un joueur est déconnecté');
    if (live.rules.current(live.state) !== player.color) throw new AppError(409, 'NOT_YOUR_TURN', 'Ce n’est pas votre tour');
  }

  /** Action d'un joueur (lancer, déplacer un pion, lâcher un jeton), validée par les règles du jeu de la partie. */
  async act(gameId: string, userId: string, action: Action) {
    const live = await this.load(gameId);
    return this.enqueue(live, async () => {
      this.assertTurn(live, userId);
      const r = live.rules.apply(live.state, action, this.rollDie);
      await this.commit(live, r.state, r.events, userId, action.type.toUpperCase());
      return this.snapshot(live);
    });
  }

  roll(gameId: string, userId: string) {
    return this.act(gameId, userId, { type: 'roll' });
  }

  move(gameId: string, userId: string, pawn: number) {
    return this.act(gameId, userId, { type: 'move', pawn });
  }

  drop(gameId: string, userId: string, column: number) {
    return this.act(gameId, userId, { type: 'drop', column });
  }

  async forfeit(gameId: string, userId: string, reason: GameEndReason = 'FORFEIT') {
    const live = await this.load(gameId);
    return this.enqueue(live, async () => {
      if (live.status !== 'ACTIVE') return this.snapshot(live);
      const loser = live.players.find((p) => p.userId === userId);
      if (!loser) throw forbidden('Vous ne participez pas à cette partie');
      if (this.isOut(live, userId)) return this.snapshot(live);
      // À 3 ou 4 joueurs, seul le joueur qui part est éliminé ; le dernier joueur restant gagne.
      const entry = live.offline.get(userId);
      if (entry) {
        clearTimeout(entry.timer);
        live.offline.delete(userId);
      }
      const r = live.rules.eliminate(live.state, loser.color);
      await this.commit(live, r.state, r.events, userId, reason === 'FORFEIT' ? 'FORFEIT' : 'ELIMINATE', reason);
      if (live.status === 'ACTIVE' && !this.humanStillPlaying(live)) {
        // Plus aucun humain en jeu (entraînement abandonné) : les robots ne jouent pas seuls.
        await prisma.gamePlayer.update({ where: { gameId_userId: { gameId: live.id, userId } }, data: { result: 'LOSS' } });
        await this.abortNow(live, reason);
        return this.snapshot(live);
      }
      if (live.status === 'ACTIVE') {
        // Résultat enregistré dès l'élimination : le joueur peut rejoindre une autre table sans attendre la fin.
        await prisma.gamePlayer.update({ where: { gameId_userId: { gameId: live.id, userId } }, data: { result: 'LOSS' } });
        this.bc.emitLobby();
      }
      return this.snapshot(live);
    });
  }

  /** Persiste l'état (verrou optimiste sur stateVersion) puis diffuse. */
  private async commit(
    live: LiveGame, next: AnyState, events: AnyEvent[], userId: string | null, type: string,
    endReason: GameEndReason = 'COMPLETED'
  ) {
    const prevVersion = live.state.seq;
    await prisma.$transaction(async (tx) => {
      const r = await tx.game.updateMany({
        where: { id: live.id, stateVersion: prevVersion, status: 'ACTIVE' },
        data: { state: JSON.stringify(next), stateVersion: next.seq }
      });
      if (r.count !== 1) throw new AppError(409, 'STALE_STATE', 'État de partie obsolète');
      await tx.gameMove.create({
        data: { gameId: live.id, seq: next.seq, userId, type, payload: JSON.stringify(events) }
      });
    });
    live.state = next;
    live.lastEvents = events;
    if (next.phase === 'finished') {
      // Sans vainqueur (grille pleine au Puissance 4) : match nul.
      const winner = live.players.find((p) => p.color === next.winner);
      await this.finish(live, winner?.userId ?? null, endReason, events);
      return;
    }
    this.scheduleTurn(live);
    this.bc.emitGame(live.id, 'game:state', this.snapshot(live));
  }

  /**
   * Fin de partie atomique : statut, résultats, XP et gain du vainqueur.
   * La clé d'idempotence win:<gameId> garantit un seul versement.
   * Match nul (winnerId null) : chacun récupère sa mise et reçoit l'XP de participation.
   */
  private async finish(live: LiveGame, winnerId: string | null, reason: GameEndReason, events: AnyEvent[]) {
    const draw = winnerId === null;
    const pot = live.room.stake * live.players.length;
    const payoutOf = (userId: string) => (draw ? live.room.stake : userId === winnerId ? pot : 0);
    await prisma.$transaction(async (tx) => {
      const r = await tx.game.updateMany({
        where: { id: live.id, status: 'ACTIVE' },
        data: { status: 'FINISHED', winnerId, endReason: reason, endedAt: new Date(), state: JSON.stringify(live.state) }
      });
      if (r.count !== 1) return; // déjà terminée
      for (const p of live.players) {
        const won = p.userId === winnerId;
        await tx.gamePlayer.update({
          where: { gameId_userId: { gameId: live.id, userId: p.userId } },
          data: { result: draw ? 'DRAW' : won ? 'WIN' : 'LOSS', payout: payoutOf(p.userId) }
        });
        if (!live.room.isPractice) {
          await tx.profile.update({ where: { userId: p.userId }, data: { xp: { increment: won ? WIN_XP : LOSS_XP } } });
        }
        if (draw && live.room.stake > 0) {
          await applyWalletOp(tx, {
            userId: p.userId,
            amount: live.room.stake,
            type: 'REFUND',
            reason: `Match nul — mise rendue (table ${live.room.code})`,
            idempotencyKey: `draw:${live.id}:${p.userId}`,
            gameId: live.id,
            roomId: live.roomId
          });
        }
      }
      if (!draw && pot > 0) {
        await applyWalletOp(tx, {
          userId: winnerId!,
          amount: pot,
          type: 'WIN',
          reason: `Gain — table ${live.room.code}`,
          idempotencyKey: `win:${live.id}`,
          gameId: live.id,
          roomId: live.roomId
        });
      }
      await tx.room.update({ where: { id: live.roomId }, data: { status: 'FINISHED' } });
      await audit({ action: 'game.finish', targetType: 'game', targetId: live.id, details: { winnerId, reason, pot, draw } }, tx);
    });
    live.status = 'FINISHED';
    live.winnerId = winnerId;
    live.endReason = reason;
    live.payouts = Object.fromEntries(live.players.map((p) => [p.userId, payoutOf(p.userId)]));
    live.lastEvents = events;
    this.clearTimers(live);
    this.bc.emitGame(live.id, 'game:state', this.snapshot(live));
    this.bc.emitLobby();
    this.evictLater(live);
  }

  /** Abandon sans vainqueur (aucun joueur revenu, ou décision admin) : mises remboursées. */
  async abort(gameId: string, reason: GameEndReason, actorId?: string) {
    const live = await this.load(gameId);
    return this.enqueue(live, () => this.abortNow(live, reason, actorId));
  }

  /** Corps de l'annulation, à appeler depuis une action déjà placée dans la file de la partie. */
  private async abortNow(live: LiveGame, reason: GameEndReason, actorId?: string) {
      if (live.status !== 'ACTIVE') return this.snapshot(live);
      await prisma.$transaction(async (tx) => {
        const r = await tx.game.updateMany({
          where: { id: live.id, status: 'ACTIVE' },
          data: { status: 'ABORTED', endReason: reason, endedAt: new Date() }
        });
        if (r.count !== 1) return;
        if (live.room.stake > 0) {
          for (const p of live.players) {
            await applyWalletOp(tx, {
              userId: p.userId,
              amount: live.room.stake,
              type: 'REFUND',
              reason: `Remboursement — partie annulée (table ${live.room.code})`,
              idempotencyKey: `refund:game:${live.id}:${p.userId}`,
              gameId: live.id,
              roomId: live.roomId
            });
          }
        }
        await tx.room.update({ where: { id: live.roomId }, data: { status: 'CANCELLED' } });
        await audit({ actorId, action: 'game.abort', targetType: 'game', targetId: live.id, details: { reason } }, tx);
      });
      live.status = 'ABORTED';
      live.endReason = reason;
      this.clearTimers(live);
      this.bc.emitGame(live.id, 'game:state', this.snapshot(live));
      this.bc.emitLobby();
      this.evictLater(live);
      return this.snapshot(live);
  }

  // ---------- minuterie de tour ----------

  private scheduleTurn(live: LiveGame) {
    if (live.turnTimer) clearTimeout(live.turnTimer);
    live.turnTimer = null;
    if (live.status !== 'ACTIVE' || live.offline.size > 0) {
      live.deadline = null;
      return;
    }
    const turnPlayer = live.players.find((p) => p.color === live.rules.current(live.state));
    if (turnPlayer?.isBot) {
      live.deadline = null;
      live.turnTimer = setTimeout(() => {
        this.enqueue(live, () => this.botStep(live)).catch((e) => console.error('[bot]', live.id, e));
      }, BOT_DELAY_MS);
      live.turnTimer.unref();
      return;
    }
    const ms = live.room.turnSeconds * 1000;
    live.deadline = Date.now() + ms;
    live.turnTimer = setTimeout(() => {
      this.enqueue(live, () => this.autoPlay(live)).catch((e) => console.error('[autoplay]', live.id, e));
    }, ms);
    live.turnTimer.unref();
  }

  /** Une action de robot, validée par les règles du jeu comme pour un humain. */
  private async botStep(live: LiveGame) {
    if (live.status !== 'ACTIVE' || live.offline.size > 0) return;
    const player = live.players.find((p) => p.color === live.rules.current(live.state));
    if (!player?.isBot) return;
    const r = live.rules.bot(live.state, await getBotLevel(), this.rollDie);
    await this.commit(live, r.state, r.events, player.userId, 'BOT');
  }

  /** Temps écoulé : le serveur joue le tour à la place du joueur. */
  private async autoPlay(live: LiveGame) {
    if (live.status !== 'ACTIVE' || live.offline.size > 0) return;
    const player = live.players.find((p) => p.color === live.rules.current(live.state))!;
    const r: Step | null = live.rules.auto(live.state, this.rollDie);
    if (!r) return;
    await this.commit(live, r.state, r.events, player.userId, 'AUTO');
  }

  // ---------- présence / reconnexion ----------

  private markOffline(live: LiveGame, userId: string) {
    if (live.offline.has(userId)) return;
    const until = Date.now() + config.RECONNECT_GRACE_SECONDS * 1000;
    const timer = setTimeout(() => this.onGraceExpired(live, userId), config.RECONNECT_GRACE_SECONDS * 1000);
    timer.unref();
    live.offline.set(userId, { until, timer });
    this.scheduleTurn(live); // met la minuterie en pause
  }

  private onGraceExpired(live: LiveGame, userId: string) {
    if (live.status !== 'ACTIVE' || !live.offline.has(userId)) return;
    const othersOnline = live.players.some((p) => p.userId !== userId && !p.isBot && !live.offline.has(p.userId) && !this.isOut(live, p.userId));
    const job = othersOnline ? this.forfeit(live.id, userId, 'DISCONNECT') : this.abort(live.id, 'DISCONNECT');
    job.catch((e) => console.error('[grace]', live.id, e));
  }

  /** Appelé par la couche Socket.IO à chaque connexion/déconnexion d'un joueur. */
  async presenceChanged(gameId: string, userId: string, online: boolean) {
    const live = await this.load(gameId);
    if (live.status !== 'ACTIVE' || !live.players.some((p) => p.userId === userId)) return;
    if (this.isOut(live, userId)) return; // un joueur éliminé peut regarder sans bloquer la partie
    if (online) {
      const entry = live.offline.get(userId);
      if (!entry) return;
      clearTimeout(entry.timer);
      live.offline.delete(userId);
      this.scheduleTurn(live);
    } else {
      this.markOffline(live, userId);
    }
    this.bc.emitGame(live.id, 'game:state', this.snapshot(live));
  }

  private clearTimers(live: LiveGame) {
    if (live.turnTimer) clearTimeout(live.turnTimer);
    live.turnTimer = null;
    live.deadline = null;
    for (const o of live.offline.values()) clearTimeout(o.timer);
    live.offline.clear();
  }

  private evictLater(live: LiveGame) {
    setTimeout(() => {
      if (this.games.get(live.id) === live && live.status !== 'ACTIVE') this.games.delete(live.id);
    }, 10 * 60 * 1000).unref();
  }

  activeGameCount() {
    return [...this.games.values()].filter((g) => g.status === 'ACTIVE').length;
  }

  /** Arrêt propre (tests, SIGTERM). */
  shutdown() {
    for (const g of this.games.values()) this.clearTimers(g);
    this.games.clear();
  }
}

export const gameManager = new GameManager();
