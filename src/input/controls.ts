/**
 * Input management and coordination for Hit Jonh.
 *
 * Enforces accidental-action rules (SPEC §3.2):
 * - Fire is accepted only in aiming state.
 * - Fire requires a fresh press (no repeat, must release space after entering aiming).
 * - Shortcuts are ignored while a text/form element has focus.
 */

export interface InputCallbacks {
  onFire: () => void;
  onReset: () => void;
  onContinue?: () => void;
  onToggleMute?: () => void;
  onAimChange: (deltaAngle: number, deltaPower: number) => void;
  onEscape?: () => void;
}

export class InputCoordinator {
  private canFire = false;
  private isSpaceDown = false;
  private spaceReleasedSinceAiming = true;
  private isPaused = false;

  constructor(private readonly callbacks: InputCallbacks) {}

  setCanFire(allowed: boolean): void {
    if (this.canFire !== allowed) {
      this.canFire = allowed;
      if (allowed) {
        // If space is already physically pressed when entering aiming state,
        // it must be released first before it can fire.
        this.spaceReleasedSinceAiming = !this.isSpaceDown;
      }
    }
  }

  setPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  handleKeyDown(code: string, repeat: boolean, isTextInputFocused: boolean): void {
    if (code === 'Space') {
      this.isSpaceDown = true;
    }

    if (this.isPaused || isTextInputFocused) return;

    if (code === 'Space') {
      if (!repeat && this.canFire && this.spaceReleasedSinceAiming) {
        this.spaceReleasedSinceAiming = false;
        this.callbacks.onFire();
      }
      return;
    }

    if (code === 'Escape') {
      this.callbacks.onEscape?.();
      return;
    }

    if (code === 'Enter') {
      if (this.callbacks.onContinue) {
        this.callbacks.onContinue();
      } else {
        this.callbacks.onReset();
      }
      return;
    }

    if (code === 'KeyM') {
      this.callbacks.onToggleMute?.();
      return;
    }

    if (!this.canFire) return;

    switch (code) {
      case 'ArrowLeft':
        this.callbacks.onAimChange(-1, 0);
        break;
      case 'ArrowRight':
        this.callbacks.onAimChange(1, 0);
        break;
      case 'ArrowDown':
        this.callbacks.onAimChange(0, -1);
        break;
      case 'ArrowUp':
        this.callbacks.onAimChange(0, 1);
        break;
      case 'KeyR':
        this.callbacks.onReset();
        break;
    }
  }

  handleKeyUp(code: string): void {
    if (code === 'Space') {
      this.isSpaceDown = false;
      this.spaceReleasedSinceAiming = true;
    }
  }
}
