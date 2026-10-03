import type { MissReason, ProjectileSnapshot, ShotOutcome, ShotState, StepResult } from './types';

/**
 * Pure state machine managing a single shot attempt.
 * Rules:
 * - Can only fire when in 'aiming' state.
 * - Simulates until hit, settled, out of bounds, or safety timeout.
 * - Reset returns to 'aiming' while preserving angle and power.
 * SPEC §3.1, §8.5, §12.
 */
export class ShotAttemptMachine {
  private _state: ShotState = 'aiming';
  private _outcome: ShotOutcome | null = null;
  private _missReason: MissReason | null = null;
  private _simulatedTime = 0;
  private _settledTime = 0;

  private _angleDeg = 45;
  private _powerPercent = 50;

  constructor(
    readonly worldWidthMetres: number,
    readonly settledSpeedThresholdMs: number = 0.05,
    readonly settledDurationSeconds: number = 0.5,
    readonly safetyTimeoutSeconds: number = 15.0,
    readonly outOfBoundsMarginMetres: number = 1.0,
  ) {}

  get state(): ShotState {
    return this._state;
  }

  get outcome(): ShotOutcome | null {
    return this._outcome;
  }

  get missReason(): MissReason | null {
    return this._missReason;
  }

  get simulatedTime(): number {
    return this._simulatedTime;
  }

  get angleDeg(): number {
    return this._angleDeg;
  }

  get powerPercent(): number {
    return this._powerPercent;
  }

  get canFire(): boolean {
    return this._state === 'aiming';
  }

  setAim(angleDeg: number, powerPercent: number): void {
    if (this._state === 'aiming') {
      this._angleDeg = angleDeg;
      this._powerPercent = powerPercent;
    }
  }

  fire(angleDeg?: number, powerPercent?: number): boolean {
    if (this._state !== 'aiming') return false;
    if (angleDeg !== undefined) this._angleDeg = angleDeg;
    if (powerPercent !== undefined) this._powerPercent = powerPercent;

    this._state = 'simulating';
    this._outcome = null;
    this._missReason = null;
    this._simulatedTime = 0;
    this._settledTime = 0;
    return true;
  }

  step(dtSeconds: number, snapshot: ProjectileSnapshot): StepResult {
    if (this._state !== 'simulating') {
      return { resolved: false };
    }

    this._simulatedTime += dtSeconds;

    // 1. Valid hit
    if (snapshot.hitBody) {
      this._state = 'resolved';
      this._outcome = 'hit';
      return { resolved: true, outcome: 'hit' };
    }

    // 2. Out of bounds (x < -margin or x > width + margin)
    if (
      snapshot.x < -this.outOfBoundsMarginMetres ||
      snapshot.x > this.worldWidthMetres + this.outOfBoundsMarginMetres
    ) {
      this._state = 'resolved';
      this._outcome = 'miss';
      this._missReason = 'out_of_bounds';
      return { resolved: true, outcome: 'miss', reason: 'out_of_bounds' };
    }

    // 3. Settled
    if (snapshot.speed < this.settledSpeedThresholdMs) {
      this._settledTime += dtSeconds;
      if (this._settledTime >= this.settledDurationSeconds) {
        this._state = 'resolved';
        this._outcome = 'miss';
        this._missReason = 'settled';
        return { resolved: true, outcome: 'miss', reason: 'settled' };
      }
    } else {
      this._settledTime = 0;
    }

    // 4. Safety timeout
    if (this._simulatedTime >= this.safetyTimeoutSeconds) {
      this._state = 'resolved';
      this._outcome = 'miss';
      this._missReason = 'timeout';
      return { resolved: true, outcome: 'miss', reason: 'timeout' };
    }

    return { resolved: false };
  }

  reset(): void {
    this._state = 'aiming';
    this._outcome = null;
    this._missReason = null;
    this._simulatedTime = 0;
    this._settledTime = 0;
  }
}
