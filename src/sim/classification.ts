import { SCORING } from '../config/tuning';

/**
 * Pure shot outcome classification and scoring types (SPEC §7.1, §13.2).
 * Outcomes:
 * - ricochet_body: 125 MP points, the trick shot: a body hit after contacting a ricochet-eligible
 *   surface or after going through a portal hoop [DECIDED by owner 2026-11-25]
 * - body: 100 MP points (direct body hit)
 * - hat_only: 20 MP points (contacted hat, never body; resolved when shot ends)
 * - miss: 0 MP points
 */
export type ClassifiedOutcome = 'ricochet_body' | 'body' | 'hat_only' | 'miss';

/** What made a trick shot: a bank off a ricochet surface or a pass through a portal hoop. */
export type TrickKind = 'ricochet' | 'portal';

export interface ClassificationResult {
  outcome: ClassifiedOutcome;
  points: number;
  isHit: boolean; // true for body and ricochet_body
  /** A trick shot (outcome `ricochet_body`), whichever way it was earned. */
  isRicochet: boolean;
  /** How the trick was earned; null unless the outcome is `ricochet_body`. */
  trick: TrickKind | null;
  label: string;
}

export interface ClassifyShotParams {
  hasBodyHit: boolean;
  hasHatHit: boolean;
  hadRicochetBeforeBody: boolean;
  /** The ball went through a portal hoop before the body hit. */
  hadPortalBeforeBody?: boolean;
  shotEnded: boolean;
}

/**
 * Pure function to classify the current shot state.
 * Highest applicable outcome wins once.
 * Hat-only waits until shotEnded = true; hat then body becomes body.
 */
export function classifyShot(params: ClassifyShotParams): ClassificationResult {
  const { hasBodyHit, hasHatHit, hadRicochetBeforeBody, hadPortalBeforeBody = false, shotEnded } = params;

  if (hasBodyHit) {
    if (hadRicochetBeforeBody || hadPortalBeforeBody) {
      const trick: TrickKind = hadRicochetBeforeBody ? 'ricochet' : 'portal';
      return {
        outcome: 'ricochet_body',
        points: SCORING.ricochetBodyPoints,
        isHit: true,
        isRicochet: true,
        trick,
        label: trick === 'ricochet' ? 'RICOCHET HIT' : 'HOOP HIT',
      };
    }
    return {
      outcome: 'body',
      points: SCORING.bodyPoints,
      isHit: true,
      isRicochet: false,
      trick: null,
      label: 'DIRECT HIT',
    };
  }

  if (shotEnded && hasHatHit) {
    return {
      outcome: 'hat_only',
      points: SCORING.hatOnlyPoints,
      isHit: false,
      isRicochet: false,
      trick: null,
      label: 'HAT HIT',
    };
  }

  return {
    outcome: 'miss',
    points: SCORING.missPoints,
    isHit: false,
    isRicochet: false,
    trick: null,
    label: 'MISS',
  };
}

export interface ContactEvent {
  /** `portal`: the ball went through a portal hoop (not a surface; it counts toward a trick shot). */
  role: 'ground' | 'jonhBody' | 'jonhHat' | 'obstacle' | 'portal';
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
 * - A portal pass before the body hit makes it a trick shot, like a ricochet [DECIDED by owner 2026-11-25].
 */
export class ShotClassifier {
  private _finalized = false;
  private _bodyHit = false;
  private _hatHit = false;
  private _hadRicochetBeforeBody = false;
  private _hadPortalBeforeBody = false;
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

    if (contact.role === 'portal') {
      if (!this._bodyHit) this._hadPortalBeforeBody = true;
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

  get hadPortalBeforeBody(): boolean {
    return this._hadPortalBeforeBody;
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
      hadPortalBeforeBody: this._hadPortalBeforeBody,
      shotEnded,
    });
  }

  reset(): void {
    this._finalized = false;
    this._bodyHit = false;
    this._hatHit = false;
    this._hadRicochetBeforeBody = false;
    this._hadPortalBeforeBody = false;
    this._obstacleContacts = [];
    this._passedOverhead = false;
  }
}
