import { JUICE } from '../config/tuning';

/** Time-scale shape of one impact, in real (unscaled) seconds. */
export interface TimeScaleProfile {
  freeze: number;
  slow: number;
  slowScale: number;
  /** Seconds to ease linearly from slowScale back to full speed after the slow segment. */
  ramp?: number;
}

const DEFAULT_PROFILE: TimeScaleProfile = { freeze: JUICE.freezeSeconds, slow: JUICE.slowSeconds, slowScale: JUICE.slowScale, ramp: 0 };

/**
 * Active real-time clock that scales the time fed to the fixed-step accumulator (never the step).
 * Integrates segment boundaries exactly, so the result is frame-rate independent.
 * Also holds a short cannon wind-up during which simulation time does not advance.
 */
export class ImpactTimeline {
  private elapsed: number | null = null;
  private triggered = false;
  private profile: TimeScaleProfile = DEFAULT_PROFILE;
  private holdRemaining = 0;

  get age(): number | null { return this.elapsed; }
  get isHolding(): boolean { return this.holdRemaining > 0; }
  get holdRemainingSeconds(): number { return this.holdRemaining; }

  bodyImpact(reducedMotion = false, profile: TimeScaleProfile = DEFAULT_PROFILE): boolean {
    if (this.triggered) return false;
    this.triggered = true;
    this.profile = profile;
    this.elapsed = reducedMotion ? null : 0;
    return true;
  }

  /** A lighter hit-stop (e.g. the hat) that a later body impact may still replace. */
  pulse(profile: TimeScaleProfile, reducedMotion = false): void {
    if (this.triggered || reducedMotion) return;
    this.profile = profile;
    this.elapsed = 0;
  }

  /** Freezes simulation time for `seconds` of real time (cannon anticipation). */
  hold(seconds: number): void {
    this.holdRemaining = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  }

  advance(seconds: number, paused = false, reducedMotion = false): number {
    let dt = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    if (paused) return 0;
    if (reducedMotion) { this.elapsed = null; this.holdRemaining = 0; }
    if (this.holdRemaining > 0) {
      const used = Math.min(this.holdRemaining, dt);
      this.holdRemaining -= used;
      dt -= used;
      if (dt <= 0) return 0;
    }
    if (this.elapsed === null) return dt;
    const start = this.elapsed;
    const end = start + dt;
    this.elapsed = end;
    return integrateScale(this.profile, start, end);
  }

  reset(): void { this.elapsed = null; this.triggered = false; this.holdRemaining = 0; this.profile = DEFAULT_PROFILE; }
}

/** ∫ scale(u) du over [start, end] for freeze → slow → linear ramp → 1. */
export function integrateScale(p: TimeScaleProfile, start: number, end: number): number {
  const overlap = (lo: number, hi: number) => Math.max(0, Math.min(end, hi) - Math.max(start, lo));
  const slowStart = p.freeze;
  const rampStart = slowStart + p.slow;
  const ramp = p.ramp ?? 0;
  const rampEnd = rampStart + ramp;
  let total = overlap(slowStart, rampStart) * p.slowScale;
  if (ramp > 0) {
    const a = Math.max(start, rampStart);
    const b = Math.min(end, rampEnd);
    if (b > a) {
      const k = p.slowScale;
      total += (b - a) * k + ((1 - k) / (2 * ramp)) * ((b - rampStart) ** 2 - (a - rampStart) ** 2);
    }
  }
  total += overlap(rampEnd, Number.POSITIVE_INFINITY);
  return total;
}
