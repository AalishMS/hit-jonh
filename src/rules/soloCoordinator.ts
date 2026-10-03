import { ShotAttemptMachine } from './shotAttempt';
import { SoloChallengeMachine, type SoloResult } from './soloChallenge';

export interface CoordinatorCallbacks {
  onStateChange: () => void;
  onShotFired: (angle: number, power: number) => void;
  onShowResult: (result: SoloResult) => void;
}

export class SoloCoordinator {
  constructor(
    public attemptMachine: ShotAttemptMachine,
    public soloMachine: SoloChallengeMachine,
    private callbacks: CoordinatorCallbacks
  ) {}

  canFire(): boolean {
    return this.attemptMachine.canFire && this.soloMachine.state === 'aiming';
  }

  fire(angle: number, power: number): void {
    if (!this.canFire()) return;
    this.attemptMachine.fire(angle, power);
    this.soloMachine.fire();
    this.callbacks.onShotFired(angle, power);
    this.callbacks.onStateChange();
  }

  canAdjustAim(): boolean {
    return this.attemptMachine.state === 'aiming';
  }

  adjustAim(currentAngle: number, currentPower: number, deltaAngle: number, deltaPower: number): { angle: number, power: number } | null {
    if (!this.canAdjustAim()) return null;
    const angle = Math.max(5, Math.min(85, currentAngle + deltaAngle));
    const power = Math.max(0, Math.min(100, currentPower + deltaPower));
    this.attemptMachine.setAim(angle, power);
    return { angle, power };
  }

  resolveShot(isHit: boolean, isRicochet: boolean): void {
    this.soloMachine.resolveShot(isHit, isRicochet);
    this.callbacks.onStateChange();
  }

  canReset(): boolean {
    return this.attemptMachine.state !== 'simulating';
  }

  reset(currentAngle: number, currentPower: number): void {
    if (!this.canReset()) return;
    
    if (this.soloMachine.state === 'solo_result') {
      this.callbacks.onShowResult(this.soloMachine.result!);
      return;
    }
    
    this.attemptMachine.reset();
    this.attemptMachine.setAim(currentAngle, currentPower);
    
    if (this.soloMachine.state === 'result') {
      this.soloMachine.startAiming();
    }
    this.callbacks.onStateChange();
  }
}
