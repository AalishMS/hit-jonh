export type SoloState = 'aiming' | 'simulating' | 'result' | 'solo_result';

export interface SoloResult {
  success: boolean;
  shotsUsed: number;
  stars: number;
  hasStyle: boolean; // True if ricochet body
}

export class SoloChallengeMachine {
  private _state: SoloState = 'aiming';
  private _attempts = 0;
  private _maxAttempts = 3;
  private _result: SoloResult | null = null;
  private _mapId: string;

  constructor(mapId: string) {
    this._mapId = mapId;
  }

  get state(): SoloState { return this._state; }
  get attemptsLeft(): number { return this._maxAttempts - this._attempts; }
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
    this._result = null;
  }
}
