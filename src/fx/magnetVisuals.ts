import { MAGNET } from '../config/tuning';
import { clamp01 } from './easing';

/**
 * Pure presentation maths for a level's electromagnet (SPEC §8.9): where its field rings sit, how
 * bright they are, and how strongly the magnet glows as the ball comes near. No Phaser; the renderer
 * only draws these numbers, and nothing here touches the simulation.
 */

export interface FieldRing {
  /** Radius (metres from the magnet's centre). */
  r: number;
  /** 0..1 opacity. */
  alpha: number;
}

/**
 * The drifting rings at time `t` (seconds): `MAGNET.ringCount` rings, evenly spaced, each creeping in
 * from the edge of the reach to the inner ring every `MAGNET.pulseSeconds` (so the field visibly pulls
 * inwards), fading in at the edge and out at the inner ring. Hold `t` still for reduced motion.
 */
export function fieldRings(radius: number, fullRadius: number, t: number): FieldRing[] {
  const span = Math.max(0, radius - fullRadius);
  const rings: FieldRing[] = [];
  for (let i = 0; i < MAGNET.ringCount; i++) {
    const phase = (((t / MAGNET.pulseSeconds) + i / MAGNET.ringCount) % 1 + 1) % 1;
    rings.push({ r: radius - phase * span, alpha: MAGNET.ringAlpha * Math.sin(Math.PI * phase) });
  }
  return rings;
}

/** 0..1: how much the field lights up for a ball at `proximity` (0 outside the reach, 1 inside the inner ring). */
export function fieldGlow(proximity: number): number {
  const p = clamp01(proximity);
  return p * p * (3 - 2 * p);
}

/** Whether the magnet's face crackles with sparks: the ball is close (or stuck to it). */
export function magnetSparks(proximity: number): boolean {
  return proximity >= MAGNET.sparkProximity;
}
