/**
 * Rate limit for sounds that can arrive in bursts (emote pops, footsteps): a minimum gap between
 * sounds and a cap per sliding window, on whatever clock the caller passes (the audio clock).
 */
export interface GateLimits {
  readonly minGapSeconds: number;
  readonly windowSeconds: number;
  readonly maxInWindow: number;
}

export class CueGate {
  private times: number[] = [];

  constructor(private readonly limits: GateLimits) {}

  /** True (and the sound is counted) when another sound is allowed at `now`; a clock that ran backwards starts afresh. */
  allow(now: number): boolean {
    const last = this.times[this.times.length - 1];
    if (last !== undefined && now < last) this.times = [];
    this.times = this.times.filter(t => now - t < this.limits.windowSeconds);
    const prev = this.times[this.times.length - 1];
    if (prev !== undefined && now - prev < this.limits.minGapSeconds) return false;
    if (this.times.length >= this.limits.maxInWindow) return false;
    this.times.push(now);
    return true;
  }

  reset(): void { this.times = []; }
}
