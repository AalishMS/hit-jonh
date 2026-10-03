import type { FixedStepper } from '../sim/fixedStep';

export interface SessionCallbacks {
  onPause: () => void;
  onResume: () => void;
  onQuit: () => void;
}

export class SessionCoordinator {
  private _isPaused = false;

  constructor(
    private callbacks: SessionCallbacks,
    private stepper?: FixedStepper,
  ) {}

  get isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * Evaluates whether gameplay can be paused according to SPEC §12:
   * Pause can overlay Aiming, Simulating, or in-game Result only.
   * Disallowed when no match is active or when an overlay modal is already open.
   */
  canPause(
    activeMode: 'none' | 'solo' | 'multi',
    shotState: 'aiming' | 'simulating' | 'resolved',
    isModalOverlayOpen: boolean,
  ): boolean {
    if (activeMode === 'none') return false;
    if (isModalOverlayOpen) return false;
    return shotState === 'aiming' || shotState === 'simulating' || shotState === 'resolved';
  }

  /**
   * Requests pause. Freezes stepping and resets accumulator at pause boundary.
   * Duplicate requests while already paused are safely ignored without double-triggering.
   */
  requestPause(canPause: boolean): boolean {
    if (this._isPaused || !canPause) return false;
    this._isPaused = true;
    this.stepper?.reset();
    this.callbacks.onPause();
    return true;
  }

  /**
   * Resumes gameplay. Resets accumulator at resume boundary to eliminate catch-up burst.
   */
  resume(): boolean {
    if (!this._isPaused) return false;
    this._isPaused = false;
    this.stepper?.reset();
    this.callbacks.onResume();
    return true;
  }

  /**
   * Quits session back to Main Menu.
   */
  quit(): boolean {
    if (!this._isPaused) return false;
    this._isPaused = false;
    this.stepper?.reset();
    this.callbacks.onQuit();
    return true;
  }

  togglePause(canPause: boolean): void {
    if (this._isPaused) {
      this.resume();
    } else {
      this.requestPause(canPause);
    }
  }

  /**
   * Advances simulation frame time through the fixed stepper ONLY when unpaused.
   * Returns 0 steps and executes nothing while paused.
   */
  advance(deltaSeconds: number, onStep?: (stepIndex: number) => void): number {
    if (this._isPaused || !this.stepper) return 0;
    const steps = this.stepper.advance(deltaSeconds);
    if (onStep) {
      for (let i = 0; i < steps; i++) {
        onStep(i);
      }
    }
    return steps;
  }
}

