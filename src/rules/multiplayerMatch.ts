export type MPState = 'handover' | 'aiming' | 'simulating' | 'result' | 'round_result' | 'match_result';

export interface MPPlayerSetup {
  name: string;
  color: number;
  pattern: string;
  lastAngle: number;
  lastPower: number;
}

export interface MPPlayerRecord extends MPPlayerSetup {
  id: number;
  totalScore: number;
  bodyHits: number; // for tie breaking
  roundScores: number[];
}

export interface ShotOutcome {
  score: number;
  isBodyHit: boolean;
}

// We use SCORING from config/tuning.ts

export const MP_MAPS = ['backyard', 'fence', 'rooftop'];
const SHOTS_PER_ROUND = 3;

export class MultiplayerMatchMachine {
  private _state: MPState = 'handover';
  private _players: MPPlayerRecord[] = [];
  
  private _roundIndex = 0;
  private _shotIndex = 0; // 0 to (shotsPerRound * players - 1)
  
  constructor(setups: MPPlayerSetup[]) {
    this._players = setups.map((s, i) => ({
      ...s,
      id: i,
      totalScore: 0,
      bodyHits: 0,
      roundScores: [0, 0, 0]
    }));
  }

  get state(): MPState { return this._state; }
  get players(): MPPlayerRecord[] { return this._players; }
  get roundIndex(): number { return this._roundIndex; }
  get currentMapId(): string { return MP_MAPS[this._roundIndex] ?? 'backyard'; }
  
  // Who is currently shooting?
  get activePlayerIndex(): number {
    const N = this._players.length;
    if (N === 0) return 0;
    const startPlayer = this._roundIndex % N;
    return (startPlayer + this._shotIndex) % N;
  }
  
  get activePlayer(): MPPlayerRecord {
    return this._players[this.activePlayerIndex]!;
  }
  
  // Which shot attempt is the current player taking in this round? (0, 1, 2)
  get activePlayerShotNumber(): number {
    const N = this._players.length;
    return Math.floor(this._shotIndex / N);
  }

  // To allow checking if round is over
  get isRoundComplete(): boolean {
    return this._shotIndex >= SHOTS_PER_ROUND * this._players.length;
  }
  
  get isMatchComplete(): boolean {
    return this._roundIndex >= MP_MAPS.length;
  }

  startAiming(): void {
    if (this._state === 'handover') {
      this._state = 'aiming';
    }
  }
  
  updateAim(angle: number, power: number): void {
    const player = this.activePlayer;
    player.lastAngle = angle;
    player.lastPower = power;
  }

  fire(): boolean {
    if (this._state !== 'aiming') return false;
    this._state = 'simulating';
    return true;
  }

  resolveShot(outcomePoints: number, isBodyHit: boolean): void {
    if (this._state !== 'simulating') return;
    
    const player = this.activePlayer;
    player.roundScores[this._roundIndex] = (player.roundScores[this._roundIndex] || 0) + outcomePoints;
    player.totalScore += outcomePoints;
    if (isBodyHit) {
      player.bodyHits += 1;
    }
    
    this._shotIndex++;
    
    if (this.isRoundComplete) {
      this._state = 'round_result';
    } else {
      this._state = 'result';
    }
  }
  
  nextTurn(): void {
    if (this._state === 'result') {
      this._state = 'handover';
    }
  }

  nextRound(): void {
    if (this._state === 'round_result') {
      this._roundIndex++;
      this._shotIndex = 0;
      if (this.isMatchComplete) {
        this._state = 'match_result';
      } else {
        this._state = 'handover';
      }
    }
  }

  getWinners(): MPPlayerRecord[] {
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
    return highestScorers.filter(p => p.bodyHits === maxBodyHits);
  }

  rematch(): void {
    this._state = 'handover';
    this._roundIndex = 0;
    this._shotIndex = 0;
    for (const p of this._players) {
      p.totalScore = 0;
      p.bodyHits = 0;
      p.roundScores = [0, 0, 0];
    }
  }
}
