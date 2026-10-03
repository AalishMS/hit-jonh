import { ShotAttemptMachine } from './shotAttempt';
import { MultiplayerMatchMachine } from './multiplayerMatch';
import { AIM } from '../config/tuning';

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

  fire(angle: number, power: number): void {
    if (!this.canFire()) return;
    this.attemptMachine.fire(angle, power);
    this.multiMachine.fire();
    this.callbacks.onShotFired(angle, power);
    this.callbacks.onStateChange();
  }

  canAdjustAim(): boolean {
    return this.attemptMachine.state === 'aiming' && this.multiMachine.state === 'aiming';
  }

  adjustAim(currentAngle: number, currentPower: number, deltaAngle: number, deltaPower: number): { angle: number, power: number } | null {
    if (!this.canAdjustAim()) return null;
    const angle = Math.max(AIM.minAngleDeg, Math.min(AIM.maxAngleDeg, Math.round(currentAngle + deltaAngle)));
    const power = Math.max(0, Math.min(100, Math.round(currentPower + deltaPower)));
    this.attemptMachine.setAim(angle, power);
    return { angle, power };
  }

  resolveShot(outcomePoints: number, isBodyHit: boolean): void {
    this.multiMachine.resolveShot(outcomePoints, isBodyHit);
    this.callbacks.onStateChange();
  }

  canReset(): boolean {
    return this.attemptMachine.state !== 'simulating';
  }

  reset(currentAngle: number, currentPower: number): void {
    if (!this.canReset()) return;
    
    if (this.multiMachine.state === 'result') {
      this.multiMachine.nextTurn();
    }
    
    this.attemptMachine.reset();
    this.attemptMachine.setAim(currentAngle, currentPower);
    this.callbacks.onStateChange();
  }
}

