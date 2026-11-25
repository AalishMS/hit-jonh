import { AUDIO } from '../config/tuning';
import { hash01, lerp } from '../fx/easing';
import { sockLift } from '../fx/windVisuals';

/**
 * Pure maths behind the wind bed (SPEC §8.7 audio): how loud and how bright it is for a level's wind
 * strength, and when its gusts blow. The strength is the same 0..1 the windsock uses (`sockLift`), so a
 * stronger sock means a louder, busier bed. The gust schedule is deterministic: the same garden always
 * breathes the same way, and nothing here touches the simulation.
 */

const W = AUDIO.wind;

/** 0 (calm) … 1 (the sock flies flat). */
export const windStrength = (accelerationMs2: number): number => sockLift(accelerationMs2);

/** Bed loudness (linear gain on the ambience bus); silent in calm air, `floor` of full at the faintest breeze. */
export function windBedLevel(accelerationMs2: number): number {
  const s = windStrength(accelerationMs2);
  return s <= 0 ? 0 : W.bedGain * lerp(W.floor, 1, s);
}

/** Filter centres (Hz) for the low rumble and the airy layer. */
export function windBedFilters(accelerationMs2: number): { rumbleHz: number; airHz: number } {
  const s = windStrength(accelerationMs2);
  return { rumbleHz: lerp(W.rumbleHz[0], W.rumbleHz[1], s), airHz: lerp(W.airHz[0], W.airHz[1], s) };
}

export interface GustPlan {
  /** Quiet seconds before this gust starts (after the previous one ended, or after the bed began). */
  gapSeconds: number;
  swellSeconds: number;
  fadeSeconds: number;
  /** Extra gain over the bed at the peak, as a fraction of it (0.5 = 50% louder). */
  lift: number;
}

/** The `index`th gust of a garden whose wind is `accelerationMs2`. Stronger wind: more often, quicker and bigger. */
export function gustPlan(index: number, accelerationMs2: number): GustPlan {
  const s = windStrength(accelerationMs2);
  const jitter = (salt: number, spread: number) => 1 - spread + 2 * spread * hash01(index * 7.13 + salt);
  const gap = index === 0
    ? W.firstGustSeconds * (1 + hash01(3.7))
    : lerp(W.gustGapSeconds[0], W.gustGapSeconds[1], s) * jitter(1.9, 0.3);
  return {
    gapSeconds: gap,
    swellSeconds: lerp(W.gustSwellSeconds[0], W.gustSwellSeconds[1], s) * jitter(4.1, 0.2),
    fadeSeconds: lerp(W.gustFadeSeconds[0], W.gustFadeSeconds[1], s) * jitter(6.3, 0.2),
    lift: W.gustLift * (0.4 + 0.6 * s) * jitter(8.7, 0.25),
  };
}

export interface Gust { start: number; peak: number; end: number; lift: number }

/** The gusts that begin before `until`, laid out from `from` (seconds on the audio clock). Never overlap. */
export function gustTimeline(from: number, until: number, accelerationMs2: number, firstIndex = 0): Gust[] {
  const out: Gust[] = [];
  let t = from;
  for (let i = firstIndex; ; i++) {
    const plan = gustPlan(i, accelerationMs2);
    const start = t + plan.gapSeconds;
    if (start >= until) break;
    out.push({ start, peak: start + plan.swellSeconds, end: start + plan.swellSeconds + plan.fadeSeconds, lift: plan.lift });
    t = start + plan.swellSeconds + plan.fadeSeconds;
  }
  return out;
}

/**
 * How far into a gust the wind is `elapsed` seconds after the bed began: 0 between gusts, rising to 1 at a
 * gust's peak and falling back, on exactly the ramps the audio schedules (gusts laid out as `gustTimeline`).
 * Normalised by the largest lift, so the windsock and streaks can swell with what is heard.
 */
export function gustLevelAt(elapsed: number, accelerationMs2: number): number {
  if (!(elapsed > 0) || windStrength(accelerationMs2) <= 0) return 0;
  let t = 0;
  for (let i = 0; ; i++) {
    const plan = gustPlan(i, accelerationMs2);
    const start = t + plan.gapSeconds;
    if (elapsed < start) return 0;
    const peak = start + plan.swellSeconds;
    const end = peak + plan.fadeSeconds;
    const level = plan.lift / W.gustLift;
    if (elapsed < peak) return Math.min(1, level * (elapsed - start) / plan.swellSeconds);
    if (elapsed < end) return Math.min(1, level * (end - elapsed) / plan.fadeSeconds);
    t = end;
  }
}
