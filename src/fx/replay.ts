/**
 * Slow-motion replay of a body hit. Presentation only: it re-plays recorded ball positions
 * and re-runs Jonh's pose curve; the simulation and scoring are never touched.
 */

export interface ReplaySample { t: number; x: number; y: number; vx: number; vy: number }

/** Ring of recent ball samples keyed by simulated time. */
export class ReplayBuffer {
  private samples: ReplaySample[] = [];

  constructor(private readonly maxSeconds = 3) {}

  push(sample: ReplaySample): void {
    const last = this.samples[this.samples.length - 1];
    if (last && sample.t <= last.t) return;
    this.samples.push(sample);
    const cutoff = sample.t - this.maxSeconds;
    while (this.samples.length > 2 && this.samples[0]!.t < cutoff) this.samples.shift();
  }

  get length(): number { return this.samples.length; }
  get startTime(): number | null { return this.samples[0]?.t ?? null; }
  get endTime(): number | null { return this.samples[this.samples.length - 1]?.t ?? null; }

  /** Linearly interpolated sample at simulated time t (clamped to the recorded range). */
  sampleAt(t: number): ReplaySample | null {
    const s = this.samples;
    if (s.length === 0) return null;
    if (t <= s[0]!.t) return { ...s[0]! };
    if (t >= s[s.length - 1]!.t) return { ...s[s.length - 1]! };
    let lo = 0;
    let hi = s.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid]!.t <= t) lo = mid; else hi = mid;
    }
    const a = s[lo]!;
    const b = s[hi]!;
    const k = (t - a.t) / (b.t - a.t);
    return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, vx: a.vx + (b.vx - a.vx) * k, vy: a.vy + (b.vy - a.vy) * k };
  }

  clear(): void { this.samples = []; }
}

export type ReplayPhase = 'pre' | 'post' | 'done';

export interface ReplayPlan {
  /** Simulated time of contact. */
  contactT: number;
  /** Seconds of flight shown before contact (simulated). */
  lead: number;
  /** Playback speed before contact (e.g. 0.4 = 40 %). */
  speed: number;
  /** Real seconds of reaction shown after contact. */
  post: number;
  /** Speed the reaction plays at during the replay. */
  postSpeed: number;
}

export interface ReplayFrame {
  phase: ReplayPhase;
  /** Simulated time to sample the ball at (pre-contact). */
  simT: number;
  /** True only on the frame the replay reaches contact. */
  contact: boolean;
  /** Reaction seconds to advance Jonh by this frame (post-contact, slowed). */
  reactionDt: number;
}

/** Drives a replay from real (unscaled) frame time. */
export class ReplayDirector {
  private elapsed = 0;
  private contacted = false;

  constructor(readonly plan: ReplayPlan) {}

  /** Real seconds the whole replay takes. */
  get duration(): number { return this.plan.lead / this.plan.speed + this.plan.post; }
  get preDuration(): number { return this.plan.lead / this.plan.speed; }

  advance(realDt: number): ReplayFrame {
    const dt = Number.isFinite(realDt) ? Math.max(0, realDt) : 0;
    const before = this.elapsed;
    this.elapsed += dt;
    const pre = this.preDuration;
    if (this.elapsed < pre) {
      return { phase: 'pre', simT: this.plan.contactT - this.plan.lead + this.elapsed * this.plan.speed, contact: false, reactionDt: 0 };
    }
    const contact = !this.contacted;
    this.contacted = true;
    const postStart = Math.max(before, pre);
    const reactionDt = (this.elapsed - postStart) * this.plan.postSpeed;
    const phase: ReplayPhase = this.elapsed >= this.duration ? 'done' : 'post';
    return { phase, simT: this.plan.contactT, contact, reactionDt };
  }
}
