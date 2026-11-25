/**
 * Input management and coordination for Hit Jonh.
 *
 * Enforces accidental-action rules (SPEC §3.2):
 * - Fire is accepted only in aiming state.
 * - Fire requires a fresh press (no repeat, must release space after entering aiming).
 * - Shortcuts are ignored while a text/form element has focus (range sliders are not text fields).
 * - Key releases are tracked unconditionally across menus, pauses, and text focus.
 * - Native menu button activation is preserved; game shortcuts do not fire behind overlays.
 */

import { DEFAULT_KEYS, type KeyBindings } from './keyBindings';

export interface InputCallbacks {
  onFire: () => void;
  onReset: () => void;
  onContinue?: () => void;
  onToggleMute?: () => void;
  onAimChange: (deltaAngle: number, deltaPower: number) => void;
  onEscape?: () => void;
  /** A fresh Space press while firing isn't allowed: skip what's on screen (rolling ball, result). */
  onSkip?: () => void;
}

/**
 * Detects whether an element is an actual text input/form control where typing must be preserved.
 * Range sliders (<input type="range">) are explicitly NOT text fields (SPEC §3.2).
 */
export function isTextInputElement(el: unknown): boolean {
  if (!el || typeof el !== 'object') return false;
  const element = el as HTMLElement;
  if (element.isContentEditable) return true;
  const tagName = element.tagName?.toLowerCase();
  if (tagName === 'textarea' || tagName === 'select') return true;
  if (tagName === 'input') {
    const inputType = (element as HTMLInputElement).type?.toLowerCase() || 'text';
    const nonTextTypes = ['range', 'button', 'submit', 'reset', 'checkbox', 'radio', 'color', 'file', 'image'];
    return !nonTextTypes.includes(inputType);
  }
  return false;
}

export class InputCoordinator {
  private canFire = false;
  private isSpaceDown = false;
  private spaceReleasedSinceAiming = true;
  private isPaused = false;
  private isOverlayVisible = false;
  /** Remappable gameplay keys (input/keyBindings.ts); "Space" below means the fire key. */
  private keys: KeyBindings = DEFAULT_KEYS;

  constructor(private readonly callbacks: InputCallbacks) {}

  /** Uses new key bindings; a held fire key must still be released before it can fire. */
  setKeys(keys: KeyBindings): void {
    if (keys.fire !== this.keys.fire) {
      this.isSpaceDown = false;
      this.spaceReleasedSinceAiming = true;
    }
    this.keys = keys;
  }

  /** The fire key is physically held down. */
  get isPhysicalSpaceDown(): boolean {
    return this.isSpaceDown;
  }

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

  setOverlayVisible(visible: boolean): void {
    this.isOverlayVisible = visible;
  }

  /**
   * Processes keydown events. Returns true if the game handled the shortcut and
   * requests preventDefault(), false otherwise.
   */
  handleKeyDown(code: string, repeat: boolean, isTextInputFocused: boolean, isActionButtonFocused = false): boolean {
    const keys = this.keys;
    // Physical state is ALWAYS tracked, even during text focus, pause, or overlays.
    if (code === keys.fire) {
      this.isSpaceDown = true;
    }

    // Escape toggles/resumes pause even when paused or in game, but ignores repeats and text inputs.
    if (code === 'Escape') {
      if (repeat || isTextInputFocused) return false;
      this.callbacks.onEscape?.();
      return true;
    }

    // Text inputs retain full typing access for all keys.
    if (isTextInputFocused) return false;

    // When an overlay is visible or the game is paused, gameplay shortcuts must NOT fire.
    // Native keyboard activation (e.g. Enter or Space on focused menu buttons) must work.
    if (this.isPaused || this.isOverlayVisible) {
      return false;
    }

    // Navigation/audio buttons retain native activation; Fire still uses the fresh-press guard.
    if (isActionButtonFocused && (code === 'Enter' || code === 'Space')) return false;

    // Active gameplay controls
    if (code === keys.fire) {
      if (!repeat && this.canFire && this.spaceReleasedSinceAiming) {
        this.spaceReleasedSinceAiming = false;
        this.callbacks.onFire();
      } else if (!repeat && !this.canFire) {
        // Skipping never fires: aiming then waits for this Space to be released (setCanFire).
        this.callbacks.onSkip?.();
      }
      // Consumed in gameplay so native button focus doesn't bypass coordinator
      return true;
    }

    if (code === keys.next) {
      if (!repeat) {
        if (this.callbacks.onContinue) {
          this.callbacks.onContinue();
        } else {
          this.callbacks.onReset();
        }
      }
      return true;
    }

    if (code === keys.mute) {
      if (!repeat) this.callbacks.onToggleMute?.();
      return true;
    }

    if (!this.canFire) return false;

    switch (code) {
      case keys.angleDown:
        this.callbacks.onAimChange(-1, 0);
        return true;
      case keys.angleUp:
        this.callbacks.onAimChange(1, 0);
        return true;
      case keys.powerDown:
        this.callbacks.onAimChange(0, -1);
        return true;
      case keys.powerUp:
        this.callbacks.onAimChange(0, 1);
        return true;
      case keys.retry:
        if (!repeat) this.callbacks.onReset();
        return true;
    }

    return false;
  }

  handleKeyUp(code: string): void {
    if (code === this.keys.fire) {
      this.isSpaceDown = false;
      this.spaceReleasedSinceAiming = true;
    }
  }
}
