import { ShotAttemptMachine } from './shotAttempt';
import { MultiplayerMatchMachine, normalizeAim } from './multiplayerMatch';
import type { ClassifiedOutcome } from '../sim/classification';

export interface MultiCoordinatorCallbacks {
  onStateChange: () => void;
  onShotFired: (angle: number, power: number) => void;
}

export class MultiCoordinator {
  constructor(
    public attemptMachine: ShotAttemptMachine,
    public multiMachine: MultiplayerMatchMachine,
    private callbacks: MultiCoordinatorCallbacks
  ) {}

  canFire(): boolean {
    return this.attemptMachine.canFire && this.multiMachine.state === 'aiming';
  }

  /** Handover -> Aiming for the player named on the handover screen. */
  beginTurn(currentAngle: number, currentPower: number): void {
    this.multiMachine.startAiming();
    this.reset(currentAngle, currentPower);
  }

  fire(angle: number, power: number): void {
    if (!this.canFire()) return;
    const aim = normalizeAim(angle, power);
    if (!this.multiMachine.fire(aim.angle, aim.power)) return;
    this.attemptMachine.fire(aim.angle, aim.power);
    this.callbacks.onShotFired(aim.angle, aim.power);
    this.callbacks.onStateChange();
  }

  canAdjustAim(): boolean {
    return this.attemptMachine.state === 'aiming' && this.multiMachine.state === 'aiming';
  }

  adjustAim(currentAngle: number, currentPower: number, deltaAngle: number, deltaPower: number): { angle: number, power: number } | null {
    if (!this.canAdjustAim()) return null;
    const aim = normalizeAim(currentAngle + deltaAngle, currentPower + deltaPower);
    this.attemptMachine.setAim(aim.angle, aim.power);
    this.multiMachine.updateAim(aim.angle, aim.power);
    return aim;
  }

  /** Scores a finished shot once; ignored unless the attempt resolved and the match awaits that score. */
  resolveShot(outcome: ClassifiedOutcome): boolean {
    if (this.attemptMachine.state !== 'resolved') return false;
    if (!this.multiMachine.resolveShot(outcome)) return false;
    this.callbacks.onStateChange();
    return true;
  }

  canReset(): boolean {
    return this.attemptMachine.state !== 'simulating';
  }

  reset(currentAngle: number, currentPower: number): void {
    if (!this.canReset()) return;

    // Result -> Handover, or Result -> RoundResult after the round's last shot.
    this.multiMachine.continueFromResult();
    const state = this.multiMachine.state;
    if (state === 'round_result' || state === 'match_result') {
      this.callbacks.onStateChange();
      return;
    }

    this.attemptMachine.reset();
    this.attemptMachine.setAim(currentAngle, currentPower);
    this.callbacks.onStateChange();
  }
}
