import { FLOW } from '../config/tuning';

export type AdvanceAction = 'shot' | 'handover' | 'round';

/** One cancellable presentation timer; independent of physics and browser clocks. */
export class AutoAdvance {
  private pending: { action: AdvanceAction; seconds: number } | null = null;

  schedule(action: AdvanceAction, seconds: number): void {
    this.pending = { action, seconds };
  }

  cancel(): void { this.pending = null; }

  advance(deltaSeconds: number, paused = false): AdvanceAction | null {
    if (paused || !this.pending) return null;
    this.pending.seconds -= Math.max(0, Math.min(FLOW.maxFrameSeconds, deltaSeconds));
    if (this.pending.seconds > Number.EPSILON) return null;
    const action = this.pending.action;
    this.pending = null;
    return action;
  }
}
