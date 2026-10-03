/**
 * Unit conversions between simulation units (metres, seconds, kilograms,
 * +y up) and the Phaser/Matter world (logical pixels, milliseconds, +y down).
 *
 * Matter.js 0.20 (bundled with Phaser 4) integrates with Verlet steps:
 * gravitational acceleration in px/ms² equals `gravity.y * gravity.scale`.
 * The derived Matter gravity must be validated against the analytic
 * trajectory in Milestone 1 (see SPEC.md §7).
 */

export const MS_PER_SECOND = 1000;

export function metresToPixels(metres: number, pixelsPerMetre: number): number {
  return metres * pixelsPerMetre;
}

export function pixelsToMetres(pixels: number, pixelsPerMetre: number): number {
  return pixels / pixelsPerMetre;
}

/** Simulation y (up, metres) → world y (down, pixels) given world height in pixels. */
export function simYToWorldY(yMetres: number, worldHeightPx: number, pixelsPerMetre: number): number {
  return worldHeightPx - yMetres * pixelsPerMetre;
}

/** World y (down, pixels) → simulation y (up, metres). */
export function worldYToSimY(yPx: number, worldHeightPx: number, pixelsPerMetre: number): number {
  return (worldHeightPx - yPx) / pixelsPerMetre;
}

/**
 * Matter `gravity.y` that produces `gravityMs2` (m/s²) for the given scale.
 * a[px/ms²] = g[m/s²] * ppm[px/m] / 1e6[ms²/s²] = gravity.y * gravity.scale
 */
export function matterGravityY(gravityMs2: number, pixelsPerMetre: number, gravityScale: number): number {
  const accelPxPerMs2 = (gravityMs2 * pixelsPerMetre) / (MS_PER_SECOND * MS_PER_SECOND);
  return accelPxPerMs2 / gravityScale;
}

/** Map a 0–100 power percentage to launch speed (m/s) via linear impulse mapping. */
export function powerToLaunchSpeed(
  powerPercent: number,
  minImpulseNs: number,
  maxImpulseNs: number,
  massKg: number,
): number {
  const p = Math.min(Math.max(powerPercent, 0), 100) / 100;
  const impulse = minImpulseNs + p * (maxImpulseNs - minImpulseNs);
  return impulse / massKg;
}

/**
 * Base step rate in Hz used by Matter.js internally for Body.setVelocity
 * (_baseDelta = 1000/60 ms).
 */
export const MATTER_BASE_FPS = 60;

/**
 * Convert speed in m/s to Matter.js velocity units (pixels per 1000/60 ms).
 * v_matter = v[m/s] * ppm / 60.
 */
export function speedMsToMatterVelocity(speedMs: number, pixelsPerMetre: number): number {
  return (speedMs * pixelsPerMetre) / MATTER_BASE_FPS;
}

/**
 * Convert Matter.js velocity units back to physical speed in m/s.
 */
export function matterVelocityToSpeedMs(vMatter: number, pixelsPerMetre: number): number {
  return (vMatter * MATTER_BASE_FPS) / pixelsPerMetre;
}

/**
 * Calculate launch velocity vector in Matter world units (px / base step).
 * Angle is in degrees above horizontal: 0° is right (+x), 90° is straight up (-y).
 */
export function launchVelocityToWorld(
  speedMs: number,
  angleDeg: number,
  pixelsPerMetre: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const vMatter = speedMsToMatterVelocity(speedMs, pixelsPerMetre);
  return {
    x: vMatter * Math.cos(rad),
    y: -vMatter * Math.sin(rad),
  };
}

/** 2D Euclidean length of a vector. */
export function vectorLength(x: number, y: number): number {
  return Math.hypot(x, y);
}
