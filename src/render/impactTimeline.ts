import { JUICE } from '../config/tuning';

/** Active real-time clock; integrates boundaries rather than sampling a frame's scale. */
export class ImpactTimeline {
  private elapsed: number | null = null;
  private triggered = false;

  get age(): number | null { return this.elapsed; }

  bodyImpact(reducedMotion = false): boolean {
    if (this.triggered) return false;
    this.triggered = true;
    this.elapsed = reducedMotion ? null : 0;
    return true;
  }

  advance(seconds: number, paused = false, reducedMotion = false): number {
    const dt = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    if (paused) return 0;
    if (reducedMotion) this.elapsed = null;
    if (this.elapsed === null) return dt;
    const start = this.elapsed;
    const end = start + dt;
    const overlap = (lo: number, hi: number) => Math.max(0, Math.min(end, hi) - Math.max(start, lo));
    const frozen = overlap(0, JUICE.freezeSeconds);
    const slowed = overlap(JUICE.freezeSeconds, JUICE.freezeSeconds + JUICE.slowSeconds);
    this.elapsed = end;
    return dt - frozen - slowed * (1 - JUICE.slowScale);
  }

  reset(): void { this.elapsed = null; this.triggered = false; }
}
