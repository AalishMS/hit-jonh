/** Pure easing and interpolation helpers (no Phaser). */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Progress of t through [start, start + duration], clamped to 0..1. */
export const progress = (t: number, start: number, duration: number) =>
  duration <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / duration);

export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeInCubic = (t: number) => clamp01(t) ** 3;
export const easeInQuad = (t: number) => clamp01(t) ** 2;
export const easeOutQuad = (t: number) => 1 - (1 - clamp01(t)) ** 2;
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

/** Overshoots past 1 then settles; s controls the overshoot (1.70158 ≈ 10%). */
export function easeOutBack(t: number, s = 1.70158): number {
  const x = clamp01(t) - 1;
  return 1 + (s + 1) * x ** 3 + s * x ** 2;
}

export function easeOutElastic(t: number): number {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  return 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

/** A decaying oscillation starting at 1: used for wobbles after a landing or a pop. */
export function dampedWave(t: number, frequencyHz: number, decayPerSecond: number): number {
  if (t < 0) return 0;
  return Math.exp(-decayPerSecond * t) * Math.cos(2 * Math.PI * frequencyHz * t);
}

/** 4·p·(1−p): a unit parabola for hops and arcs. */
export const arc = (p: number) => 4 * clamp01(p) * (1 - clamp01(p));

/** Frame-rate independent exponential approach (critically damped feel). */
export function approach(current: number, target: number, ratePerSecond: number, dt: number): number {
  return target + (current - target) * Math.exp(-ratePerSecond * dt);
}

/** Small deterministic hash → [0, 1); used for cosmetic variety that must be reproducible. */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
