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
