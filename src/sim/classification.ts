import { SCORING } from '../config/tuning';

/**
 * Pure shot outcome classification and scoring types (SPEC §7.1, §13.2).
 * Outcomes:
 * - ricochet_body: 125 MP points (body hit after contacting ricochet-eligible surface)
 * - body: 100 MP points (direct body hit)
 * - hat_only: 20 MP points (contacted hat, never body; resolved when shot ends)
 * - miss: 0 MP points
 */
export type ClassifiedOutcome = 'ricochet_body' | 'body' | 'hat_only' | 'miss';

export interface ClassificationResult {
  outcome: ClassifiedOutcome;
  points: number;
  isHit: boolean; // true for body and ricochet_body
  isRicochet: boolean;
  label: string;
}

export interface ClassifyShotParams {
  hasBodyHit: boolean;
  hasHatHit: boolean;
  hadRicochetBeforeBody: boolean;
  shotEnded: boolean;
}

/**
 * Pure function to classify the current shot state.
 * Highest applicable outcome wins once.
 * Hat-only waits until shotEnded = true; hat then body becomes body.
 */
export function classifyShot(params: ClassifyShotParams): ClassificationResult {
  const { hasBodyHit, hasHatHit, hadRicochetBeforeBody, shotEnded } = params;

  if (hasBodyHit) {
    if (hadRicochetBeforeBody) {
      return {
        outcome: 'ricochet_body',
        points: SCORING.ricochetBodyPoints,
        isHit: true,
        isRicochet: true,
        label: 'RICOCHET HIT',
      };
    }
    return {
      outcome: 'body',
      points: SCORING.bodyPoints,
      isHit: true,
      isRicochet: false,
      label: 'DIRECT HIT',
    };
  }

  if (shotEnded && hasHatHit) {
    return {
      outcome: 'hat_only',
      points: SCORING.hatOnlyPoints,
      isHit: false,
      isRicochet: false,
      label: 'HAT HIT',
    };
  }

  return {
    outcome: 'miss',
    points: SCORING.missPoints,
    isHit: false,
    isRicochet: false,
    label: 'MISS',
  };
}

export interface ContactEvent {
  role: 'ground' | 'jonhBody' | 'jonhHat' | 'obstacle';
  id?: string;
  ricochet?: boolean;
}

/**
 * Stateful shot contact tracker enforcing idempotency and scoring rules:
 * - Body contact finalizes scoring once; subsequent collision callbacks cannot change or repeat it.
 * - Ground is never ricochet-eligible.
 * - Hat contact alone does not finalize the shot; waits for shot end.
 * - Hat then body resolves as body (or ricochet body if ricochet surface hit prior).
 * - Obstacle contacts are recorded with IDs and ricochet eligibility.
 */
export class ShotClassifier {
  private _finalized = false;
  private _bodyHit = false;
  private _hatHit = false;
  private _hadRicochetBeforeBody = false;
  private _obstacleContacts: Array<{ id: string; ricochet: boolean }> = [];
  private _passedOverhead = false;

  recordContact(contact: ContactEvent): void {
    if (this._finalized) {
      // Body contact finalises scoring; later collision callbacks cannot change or repeat it (SPEC §7.1).
      return;
    }

    if (contact.role === 'ground') {
      // Ground is never ricochet-eligible (SPEC §7.1).
      return;
    }

    if (contact.role === 'obstacle') {
      const isRicochet = Boolean(contact.ricochet);
      this._obstacleContacts.push({
        id: contact.id ?? 'obstacle',
        ricochet: isRicochet,
      });
      if (isRicochet && !this._bodyHit) {
        this._hadRicochetBeforeBody = true;
      }
      return;
    }

    if (contact.role === 'jonhHat') {
      this._hatHit = true;
      return;
    }

    if (contact.role === 'jonhBody') {
      this._bodyHit = true;
      this._finalized = true;
      return;
    }
  }

  recordOverhead(): void {
    if (!this._bodyHit && !this._hatHit) {
      this._passedOverhead = true;
    }
  }

  get isBodyFinalized(): boolean {
    return this._finalized;
  }

  get hasBodyHit(): boolean {
    return this._bodyHit;
  }

  get hasHatHit(): boolean {
    return this._hatHit;
  }

  get hadRicochetBeforeBody(): boolean {
    return this._hadRicochetBeforeBody;
  }

  get hasPassedOverhead(): boolean {
    return this._passedOverhead;
  }

  get obstacleContacts(): ReadonlyArray<{ id: string; ricochet: boolean }> {
    return this._obstacleContacts;
  }

  classify(shotEnded: boolean): ClassificationResult {
    return classifyShot({
      hasBodyHit: this._bodyHit,
      hasHatHit: this._hatHit,
      hadRicochetBeforeBody: this._hadRicochetBeforeBody,
      shotEnded,
    });
  }

  reset(): void {
    this._finalized = false;
    this._bodyHit = false;
    this._hatHit = false;
    this._hadRicochetBeforeBody = false;
    this._obstacleContacts = [];
    this._passedOverhead = false;
  }
}
