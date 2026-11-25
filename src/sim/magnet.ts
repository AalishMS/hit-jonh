/**
 * Pure maths for a level's electromagnet (SPEC §8.10) in SI units (metres, m/s², +y up): the pull it
 * puts on the (iron) cannonball. No Phaser, no Matter; the physics adapter converts the result.
 *
 * Falloff [PROPOSED 2026-11-25], drawn as two rings: the pull points at the magnet's centre at full
 * strength A out to the inner ring (`fullRadius`), then fades smoothly (smoothstep, flat at both ends,
 * so no jump anywhere) to nothing at the outer ring (`radius`, the reach), and is zero beyond it.
 * Inside a small core round the centre it eases linearly to zero, so there is no singularity: the
 * centre itself feels nothing. The pull never exceeds A, and it is a central force whose size depends
 * only on the distance, so the field is conservative: it can add at most √(2·A·R) of speed
 * (validation sizes colliders for it).
 */

import { MAGNET } from '../config/tuning';

export interface MagnetField {
  /** Centre of the pull (m). */
  x: number;
  y: number;
  /** Reach (m): no pull at or beyond this distance from the centre. */
  radius: number;
  /** Strongest pull (m/s²). */
  accelerationMs2: number;
}

/** The shape of the pull: where it is full and how small the eased core is (metres). */
export interface MagnetProfile {
  /** Full strength out to this distance from the centre (the inner ring); clamped to the reach. */
  fullRadius: number;
  /** Inside this distance the pull eases linearly to zero at the centre. */
  coreRadius: number;
}

/** The game's profile for a magnet of reach `radius` (tuning: MAGNET.fullReachShare, coreRadiusMetres). */
export function magnetProfile(radius: number): MagnetProfile {
  return { fullRadius: radius * MAGNET.fullReachShare, coreRadius: MAGNET.coreRadiusMetres };
}

/**
 * 0..1 with distance from the centre (ignoring the core): 1 out to `fullRadius`, a smoothstep fade
 * to 0 at `radius`, and 0 from there on.
 */
export function magnetFalloff(distance: number, radius: number, fullRadius: number): number {
  if (!(distance < radius) || !(radius > 0)) return 0;
  const inner = Math.max(0, Math.min(fullRadius, radius));
  if (distance <= inner) return 1;
  const t = (distance - inner) / (radius - inner);
  return 1 - t * t * (3 - 2 * t);
}

/** 0..1: the core's easing, linear from 0 at the centre to 1 at `coreRadius`. */
function coreEase(distance: number, coreRadius: number): number {
  return coreRadius > 0 ? Math.min(1, Math.max(0, distance) / coreRadius) : 1;
}

/** The pull's strength (m/s²) on a ball centred `distance` from the magnet's centre. */
export function magnetStrength(field: MagnetField, distance: number, profile: MagnetProfile): number {
  const d = Math.max(0, distance);
  return field.accelerationMs2 * magnetFalloff(d, field.radius, profile.fullRadius) * coreEase(d, profile.coreRadius);
}

/**
 * The acceleration (m/s², +y up) the magnet gives a ball centred at (x, y): towards the centre with
 * `magnetStrength`; exactly zero outside the reach and at the centre itself.
 */
export function magnetAcceleration(field: MagnetField, x: number, y: number, profile: MagnetProfile): { x: number; y: number } {
  const dx = field.x - x;
  const dy = field.y - y;
  const d = Math.hypot(dx, dy);
  if (!(d < field.radius) || d === 0) return { x: 0, y: 0 };
  const k = magnetStrength(field, d, profile) / d;
  return { x: k * dx, y: k * dy };
}

/** How strongly the ball feels the magnet where it is, 0..1 (glow and hum; presentation only). */
export function magnetProximity(field: MagnetField, x: number, y: number, fullRadius: number): number {
  return magnetFalloff(Math.hypot(field.x - x, field.y - y), field.radius, fullRadius);
}

/**
 * The most speed (m/s) a ball launched at `launchSpeedMs` can have from the magnet alone: the field
 * is conservative with a potential well no deeper than A·R, so v² ≤ v₀² + 2·A·R.
 */
export function magnetMaxSpeed(launchSpeedMs: number, field: Pick<MagnetField, 'radius' | 'accelerationMs2'>): number {
  return Math.sqrt(launchSpeedMs * launchSpeedMs + 2 * Math.abs(field.accelerationMs2) * field.radius);
}
