export type SoloState = 'aiming' | 'simulating' | 'result' | 'solo_result';

export interface SoloResult {
  success: boolean;
  shotsUsed: number;
  stars: number;
  hasStyle: boolean; // True if ricochet body
}

/**
 * One solo challenge: three attempts, ending at the first body hit (SPEC §5).
 *
 * Practice [PROPOSED 2026-11-25; SPEC §4.2 "unlimited practice, only if cheap, never overwrites
 * challenge results"]: unlimited shots that never end in a result; hits are only counted.
 */
export class SoloChallengeMachine {
  private _state: SoloState = 'aiming';
  private _attempts = 0;
  private _maxAttempts = 3;
  private _result: SoloResult | null = null;
  private _mapId: string;
  private readonly _practice: boolean;
  private _hits = 0;

  constructor(mapId: string, options: { practice?: boolean } = {}) {
    this._mapId = mapId;
    this._practice = options.practice ?? false;
  }

  get state(): SoloState { return this._state; }
  /** Infinite in practice. */
  get attemptsLeft(): number { return this._practice ? Number.POSITIVE_INFINITY : this._maxAttempts - this._attempts; }
  get isPractice(): boolean { return this._practice; }
  /** Shots fired so far (this run, or this practice session). */
  get shotsTaken(): number { return this._attempts; }
  /** Practice: body hits so far. */
  get hits(): number { return this._hits; }
  get result(): SoloResult | null { return this._result; }
  get mapId(): string { return this._mapId; }

  startAiming(): void {
    if (this._state === 'result' || this._state === 'solo_result') {
      this._state = 'aiming';
    }
  }

  fire(): boolean {
    if (this._state !== 'aiming' || this.attemptsLeft <= 0) return false;
    this._state = 'simulating';
    this._attempts++;
    return true;
  }

  resolveShot(isBodyHit: boolean, isRicochet: boolean): void {
    if (this._state !== 'simulating') return;
    if (this._practice) {
      // Practice never ends: every shot goes back to aiming, hits are just counted.
      if (isBodyHit) this._hits++;
      this._state = 'result';
      return;
    }
    
    if (isBodyHit) {
      this._state = 'solo_result';
      this._result = {
        success: true,
        shotsUsed: this._attempts,
        stars: this._maxAttempts - this._attempts + 1,
        hasStyle: isRicochet
      };
    } else {
      if (this.attemptsLeft > 0) {
        this._state = 'result';
      } else {
        this._state = 'solo_result';
        this._result = {
          success: false,
          shotsUsed: this._attempts,
          stars: 0,
          hasStyle: false
        };
      }
    }
  }

  retry(): void {
    this._state = 'aiming';
    this._attempts = 0;
    this._hits = 0;
    this._result = null;
  }
}
