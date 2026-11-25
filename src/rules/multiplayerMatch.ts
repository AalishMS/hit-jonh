import { AIM, MULTIPLAYER, SCORING } from '../config/tuning';
import type { ClassifiedOutcome } from '../sim/classification';
import { MAP_IDS, MAPS } from '../levels';

export type MPState = 'handover' | 'aiming' | 'simulating' | 'result' | 'round_result' | 'match_result';

export interface MPPlayerSetup {
  name: string;
  color: number;
  pattern: string;
  lastAngle: number;
  lastPower: number;
}

interface MPPlayerRecord extends MPPlayerSetup {
  id: number;
  totalScore: number;
  bodyHits: number; // for tie breaking
  roundScores: number[];
}

/** Read-only copy of a player; mutating it never changes the match. */
export interface MPPlayerView extends Readonly<MPPlayerSetup> {
  readonly id: number;
  readonly totalScore: number;
  readonly bodyHits: number;
  readonly roundScores: readonly number[];
}

// Points per outcome come from SCORING in config/tuning.ts.
export const OUTCOME_POINTS: Record<ClassifiedOutcome, number> = {
  ricochet_body: SCORING.ricochetBodyPoints,
  body: SCORING.bodyPoints,
  hat_only: SCORING.hatOnlyPoints,
  miss: SCORING.missPoints,
};

/** Every map can be played in multiplayer; a match plays any distinct subset, one map per round. */
export const MP_MAPS: readonly string[] = MAP_IDS;

/** Clamps aim to the supported integer range. */
export function normalizeAim(angle: number, power: number): { angle: number; power: number } {
  return {
    angle: Math.max(AIM.minAngleDeg, Math.min(AIM.maxAngleDeg, Math.round(angle))),
    power: Math.max(0, Math.min(100, Math.round(power))),
  };
}

function toView(p: MPPlayerRecord): MPPlayerView {
  return { ...p, roundScores: [...p.roundScores] };
}

export interface MatchOptions {
  /**
   * Hot-seat sudden death [DECIDED request 2026-11-25; rules PROPOSED]: players still level after the
   * tie-break (equal points and body hits) each take one shot on the last map, with Jonh at a fresh spot.
   * The best outcome wins; those still level go again, up to MULTIPLAYER.suddenDeathRounds, after which
   * the win is shared. Shoot-out shots never change totals. Off for online (the server's rules apply).
   */
  suddenDeath?: boolean;
}

/** The shoot-out, for presentation. */
export interface SuddenDeathView {
  /** 1-based shoot-out round. */
  readonly round: number;
  /** Player ids still in it, in this round's shooting order. */
  readonly contenders: readonly number[];
  /** This round's outcomes so far (a contender who has not shot yet is missing). */
  readonly outcomes: ReadonlyMap<number, ClassifiedOutcome>;
  /** Set once decided: the winner (or the players sharing it after the last round). */
  readonly winners: readonly number[] | null;
}

interface SuddenDeathState {
  round: number;
  contenders: number[];
  next: number;
  outcomes: Map<number, ClassifiedOutcome>;
  winners: number[] | null;
}

export class MultiplayerMatchMachine {
  private _state: MPState = 'handover';
  private _players: MPPlayerRecord[] = [];

  private _roundIndex = 0;
  private _shotIndex = 0; // 0 to (shotsPerRound * players - 1)
  private _shooterIndex: number | null = null;
  private positionSchedules: string[][] = [];
  private _moveCount = 0;
  private _movePending = false; // the last shot hit Jonh; he moves when the result is dismissed
  private readonly suddenDeathEnabled: boolean;
  private sd: SuddenDeathState | null = null;

  constructor(setups: readonly MPPlayerSetup[], private readonly maps: readonly string[] = MP_MAPS,
    private readonly random: () => number = Math.random, options: MatchOptions = {}) {
    this.suddenDeathEnabled = options.suddenDeath ?? false;
    if (maps.length === 0 || maps.length > MP_MAPS.length ||
      new Set(maps).size !== maps.length || maps.some(id => !MP_MAPS.includes(id))) {
      throw new RangeError('Choose one or more distinct supported maps');
    }
    this.maps = [...maps];
    this.shufflePositions();
    if (setups.length < MULTIPLAYER.minPlayers || setups.length > MULTIPLAYER.maxPlayers) {
      throw new RangeError(
        `Multiplayer needs ${MULTIPLAYER.minPlayers}..${MULTIPLAYER.maxPlayers} players, got ${setups.length}`,
      );
    }
    this._players = setups.map((s, i) => {
      const aim = normalizeAim(s.lastAngle, s.lastPower);
      return {
        name: s.name,
        color: s.color,
        pattern: s.pattern,
        lastAngle: aim.angle,
        lastPower: aim.power,
        id: i,
        totalScore: 0,
        bodyHits: 0,
        roundScores: this.maps.map(() => 0),
      };
    });
  }

  get state(): MPState { return this._state; }
  get players(): readonly MPPlayerView[] { return this._players.map(toView); }
  /** Name, appearance and saved aim of every player, for persistence. */
  get setups(): MPPlayerSetup[] {
    return this._players.map(p => ({
      name: p.name, color: p.color, pattern: p.pattern, lastAngle: p.lastAngle, lastPower: p.lastPower,
    }));
  }
  get roundIndex(): number { return this._roundIndex; }
  get currentMapId(): string { return this.maps[this._roundIndex] ?? this.maps[0]!; }
  get roundCount(): number { return this.maps.length; }

  /** Resolution advances the turn counter; keep the finished cycle until handover. */
  get activeCycleIndex(): number {
    const shotIndex = this._state === 'result' ? this._shotIndex - 1 : this._shotIndex;
    return Math.min(MULTIPLAYER.shotsPerRound - 1, Math.floor(shotIndex / this._players.length));
  }

  /** Jonh stays put until he is hit; the move is applied on leaving the result, so results keep the old spot. */
  get activePositionId(): string {
    const round = Math.min(this._roundIndex, this.maps.length - 1);
    const schedule = this.positionSchedules[round]!;
    return schedule[this._moveCount % schedule.length]!;
  }

  /** How many times Jonh has moved this round (0 = still at his starting spot). */
  get moveCount(): number { return this._moveCount; }

  private shufflePositions(): void {
    this.positionSchedules = this.maps.map(mapId => {
      const ids = MAPS.find(level => level.id === mapId)?.multiplayerPositions.map(p => p.id);
      if (!ids || ids.length !== MULTIPLAYER.shotsPerRound || new Set(ids).size !== ids.length) {
        throw new RangeError(`Map ${mapId} needs one distinct position per shot cycle`);
      }
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j]!, ids[i]!];
      }
      return ids;
    });
  }

  /** The shoot-out after a level match, or null (rules in MatchOptions.suddenDeath). */
  get suddenDeath(): SuddenDeathView | null {
    const sd = this.sd;
    return sd ? { round: sd.round, contenders: [...sd.contenders], outcomes: new Map(sd.outcomes), winners: sd.winners ? [...sd.winners] : null } : null;
  }

  // Who is currently shooting?
  get activePlayerIndex(): number {
    if (this.sd) return this.sd.contenders[Math.min(this.sd.next, this.sd.contenders.length - 1)]!;
    const N = this._players.length;
    const startPlayer = this._roundIndex % N;
    return (startPlayer + this._shotIndex) % N;
  }

  get activePlayer(): MPPlayerView {
    return toView(this._players[this.activePlayerIndex]!);
  }

  /** Who fired the latest shot (set at Fire; stays valid after the turn advances). */
  get lastShooterIndex(): number | null { return this._shooterIndex; }

  /** Shots already taken this round, by all players (0 .. shotsPerRound × players). */
  get shotIndexInRound(): number { return this._shotIndex; }

  // Which shot attempt is the current player taking in this round? (0, 1, 2; always 0 in a shoot-out)
  get activePlayerShotNumber(): number {
    if (this.sd) return 0;
    return Math.floor(this._shotIndex / this._players.length);
  }

  // To allow checking if round is over
  get isRoundComplete(): boolean {
    return this._shotIndex >= MULTIPLAYER.shotsPerRound * this._players.length;
  }

  get isMatchComplete(): boolean {
    return this._state === 'match_result' || this._roundIndex >= this.maps.length;
  }

  startAiming(): void {
    if (this._state === 'handover') {
      this._state = 'aiming';
    }
  }

  /** Saves the active player's aim; only accepted while aiming. */
  updateAim(angle: number, power: number): boolean {
    if (this._state !== 'aiming') return false;
    const aim = normalizeAim(angle, power);
    const player = this._players[this.activePlayerIndex]!;
    player.lastAngle = aim.angle;
    player.lastPower = aim.power;
    return true;
  }

  /** Saves the aim, records the shooter, then enters simulating. */
  fire(angle: number, power: number): boolean {
    if (!this.updateAim(angle, power)) return false;
    this._shooterIndex = this.activePlayerIndex;
    this._state = 'simulating';
    return true;
  }

  /** Scores the shot once for the player recorded at Fire; ignored unless a shot is simulating. */
  resolveShot(outcome: ClassifiedOutcome): boolean {
    if (this._state !== 'simulating' || this._shooterIndex === null) return false;

    if (this.sd) {
      // Shoot-out: recorded for the decision only; totals, hits and round scores stay as they were.
      this.sd.outcomes.set(this._shooterIndex, outcome);
      this.sd.next++;
      this._state = 'result';
      return true;
    }

    const player = this._players[this._shooterIndex]!;
    const points = OUTCOME_POINTS[outcome];
    player.roundScores[this._roundIndex] = (player.roundScores[this._roundIndex] ?? 0) + points;
    player.totalScore += points;
    if (outcome === 'ricochet_body' || outcome === 'body') {
      player.bodyHits += 1;
      this._movePending = true;
    }

    this._shotIndex++;
    this._state = 'result';
    return true;
  }

  /** Result -> Handover (shots remain) or Result -> RoundResult (round complete). */
  continueFromResult(): void {
    if (this._state === 'result' && this.sd) {
      this.continueSuddenDeath(this.sd);
      return;
    }
    if (this._state === 'result') {
      if (this._movePending) {
        this._movePending = false;
        this._moveCount++;
      }
      this._state = this.isRoundComplete ? 'round_result' : 'handover';
    }
  }

  nextRound(): void {
    if (this._state === 'round_result') {
      const level = this._roundIndex + 1 >= this.maps.length ? this.levelLeaders() : [];
      if (this.suddenDeathEnabled && level.length > 1) {
        // Still level after the tie-break: a shoot-out on this (the last) map, Jonh at a fresh spot.
        this.sd = { round: 1, contenders: level, next: 0, outcomes: new Map(), winners: null };
        this._shotIndex = 0;
        this._moveCount++;
        this._state = 'handover';
        return;
      }
      this._roundIndex++;
      this._shotIndex = 0;
      this._moveCount = 0;
      if (this.isMatchComplete) {
        this._state = 'match_result';
      } else {
        this._state = 'handover';
      }
    }
  }

  /** Players level on points and body hits at the top (more than one means still tied). */
  private levelLeaders(): number[] {
    const top = Math.max(...this._players.map(p => p.totalScore));
    const scorers = this._players.filter(p => p.totalScore === top);
    const hits = Math.max(...scorers.map(p => p.bodyHits));
    return scorers.filter(p => p.bodyHits === hits).map(p => p.id);
  }

  /** After a shoot-out shot: next contender, a decision, or another round among those still level. */
  private continueSuddenDeath(sd: SuddenDeathState): void {
    if (sd.next < sd.contenders.length) {
      this._state = 'handover';
      return;
    }
    const points = (id: number) => OUTCOME_POINTS[sd.outcomes.get(id) ?? 'miss'];
    const best = Math.max(...sd.contenders.map(points));
    const leaders = sd.contenders.filter(id => points(id) === best);
    if (leaders.length === 1 || sd.round >= MULTIPLAYER.suddenDeathRounds) {
      sd.winners = leaders;
      this._state = 'match_result';
      return;
    }
    // Still level: those players go again from a fresh spot, the order rotating each round.
    sd.round++;
    sd.contenders = [...leaders.slice(1), leaders[0]!];
    sd.next = 0;
    sd.outcomes = new Map();
    this._moveCount++;
    this._state = 'handover';
  }

  getWinners(): MPPlayerView[] {
    if (this.sd?.winners) return this.sd.winners.map(id => toView(this._players[id]!));
    let maxScore = -1;
    for (const p of this._players) {
      if (p.totalScore > maxScore) {
        maxScore = p.totalScore;
      }
    }
    const highestScorers = this._players.filter(p => p.totalScore === maxScore);

    let maxBodyHits = -1;
    for (const p of highestScorers) {
      if (p.bodyHits > maxBodyHits) {
        maxBodyHits = p.bodyHits;
      }
    }
    return highestScorers.filter(p => p.bodyHits === maxBodyHits).map(toView);
  }

  /** MatchResult -> Handover: clears scores, keeps names, colours and aim. */
  rematch(): void {
    if (this._state !== 'match_result') return;
    this._state = 'handover';
    this._roundIndex = 0;
    this._shotIndex = 0;
    this._shooterIndex = null;
    this._moveCount = 0;
    this._movePending = false;
    this.sd = null;
    this.shufflePositions();
    for (const p of this._players) {
      p.totalScore = 0;
      p.bodyHits = 0;
      p.roundScores = this.maps.map(() => 0);
    }
  }
}
