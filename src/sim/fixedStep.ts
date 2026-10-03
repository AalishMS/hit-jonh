/**
 * Fixed-timestep accumulator. Decouples simulation from display frame rate:
 * the caller feeds real elapsed time; `advance` returns how many fixed steps
 * to run. Backlog beyond `maxStepsPerFrame` is discarded (e.g. after a
 * hidden tab) instead of being simulated in a burst.
 */
export class FixedStepper {
  private accumulator = 0;

  constructor(
    readonly stepSeconds: number,
    readonly maxStepsPerFrame: number,
  ) {
    if (!(stepSeconds > 0)) throw new Error('stepSeconds must be > 0');
    if (!(maxStepsPerFrame >= 1)) throw new Error('maxStepsPerFrame must be >= 1');
  }

  /** Returns the number of fixed steps to simulate for this frame. */
  advance(frameSeconds: number): number {
    if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) return 0;
    this.accumulator += frameSeconds;

    // Small epsilon guards against float drift (e.g. 3 × (1/120) ≠ 0.025 exactly).
    let steps = Math.floor(this.accumulator / this.stepSeconds + 1e-9);
    if (steps > this.maxStepsPerFrame) {
      steps = this.maxStepsPerFrame;
      this.accumulator = 0;
    } else {
      this.accumulator = Math.max(0, this.accumulator - steps * this.stepSeconds);
    }
    return steps;
  }

  /** Fraction (0–1) of a step remaining, for optional render interpolation. */
  get alpha(): number {
    return Math.min(this.accumulator / this.stepSeconds, 1);
  }

  reset(): void {
    this.accumulator = 0;
  }
}
