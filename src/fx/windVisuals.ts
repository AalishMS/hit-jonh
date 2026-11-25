import { WIND } from '../config/tuning';
import { clamp01 } from './easing';

/**
 * Pure presentation maths for a level's wind (SPEC §8.7): the caption, how high the windsock lifts,
 * its shape, and how fast the streaks drift. No Phaser; the renderer only draws these numbers.
 */

/** −1 (towards the cannon), 0 (calm) or +1 (towards Jonh's side). */
export const windDirection = (accelerationMs2: number): -1 | 0 | 1 =>
  accelerationMs2 > 0 ? 1 : accelerationMs2 < 0 ? -1 : 0;

/** "Wind ← 3": the arrow is the way it blows, the number its strength in m/s² (one decimal when needed). */
export function windCaption(accelerationMs2: number): string {
  const dir = windDirection(accelerationMs2);
  if (dir === 0) return 'Calm';
  const strength = Math.round(Math.abs(accelerationMs2) * 10) / 10;
  return `Wind ${dir < 0 ? '←' : '→'} ${strength}`;
}

/** Spoken form for assistive tech and the preview caption. */
export function windSpoken(accelerationMs2: number): string {
  const dir = windDirection(accelerationMs2);
  if (dir === 0) return 'No wind';
  const strength = Math.round(Math.abs(accelerationMs2) * 10) / 10;
  return `Wind blowing ${dir < 0 ? 'back towards the cannon' : 'towards Jonh'}, strength ${strength}`;
}

/** 0 (limp) … 1 (flat out): how far the sock lifts, reaching 1 at WIND.sockFlatMs2. */
export const sockLift = (accelerationMs2: number): number => clamp01(Math.abs(accelerationMs2) / WIND.sockFlatMs2);

export interface SockSegment {
  /** Quad corners in px relative to the pole top, y down, for a wind blowing towards +x. */
  top: { x0: number; y0: number; x1: number; y1: number };
  bottom: { x0: number; y0: number; x1: number; y1: number };
}

/** Number of stripes, their length (px) and the mouth/tip widths (px) of the windsock. */
export const SOCK = { segments: 4, segmentPx: 24, mouthPx: 17, tipPx: 8 } as const;

/**
 * The windsock as a chain of tapering segments. At lift 1 it flies level; as the wind drops it hangs
 * down limp. `time` (seconds) adds a small flutter, which is 0 for reduced motion (pass 0 and
 * `flutter` false); `flutterScale` makes it wilder in a gust. Segment i is a quad from its mouth edge to its tip edge.
 */
export function sockChain(lift: number, time: number, flutter: boolean, flutterScale = 1): SockSegment[] {
  const out: SockSegment[] = [];
  let x = 0;
  let y = 0;
  const hang = (1 - clamp01(lift)) * (Math.PI / 2 - 0.12);
  for (let i = 0; i < SOCK.segments; i++) {
    const wave = flutter ? Math.sin(time * 7 + i * 1.1) * 0.07 * (0.35 + clamp01(lift)) * flutterScale : 0;
    const angle = hang + i * 0.05 * (1 - clamp01(lift)) + wave; // below horizontal, radians
    const dx = Math.cos(angle) * SOCK.segmentPx;
    const dy = Math.sin(angle) * SOCK.segmentPx;
    const w0 = SOCK.mouthPx + ((SOCK.tipPx - SOCK.mouthPx) * i) / SOCK.segments;
    const w1 = SOCK.mouthPx + ((SOCK.tipPx - SOCK.mouthPx) * (i + 1)) / SOCK.segments;
    // Half-width is applied perpendicular to the chain direction.
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    out.push({
      top: { x0: x - (nx * w0) / 2, y0: y - (ny * w0) / 2, x1: x + dx - (nx * w1) / 2, y1: y + dy - (ny * w1) / 2 },
      bottom: { x0: x + (nx * w0) / 2, y0: y + (ny * w0) / 2, x1: x + dx + (nx * w1) / 2, y1: y + dy + (ny * w1) / 2 },
    });
    x += dx;
    y += dy;
  }
  return out;
}

/** px/s a streak drifts at (signed, + is +x), faster for a stronger wind. */
export const streakDriftPxPerSecond = (accelerationMs2: number): number => accelerationMs2 * WIND.streakDriftPxPerMs2;

/** Streak opacity (0–1) for a wind strength: faint in a breeze, clearer in a gale. */
export const streakAlpha = (accelerationMs2: number): number =>
  WIND.streakAlpha * (0.45 + 0.55 * sockLift(accelerationMs2));
