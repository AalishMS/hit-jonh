/**
 * Pure ballistic calculations in SI units (metres, seconds, +y up).
 * Provides the analytic reference ground truth for testing simulation accuracy.
 */

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Position of a ballistic projectile at time t seconds under uniform gravity g (m/s²).
 * Initial position (x0, y0), initial velocity (vx, vy).
 */
export function analyticPosition(
  t: number,
  x0: number,
  y0: number,
  vx: number,
  vy: number,
  gravity: number,
): Point2D {
  return {
    x: x0 + vx * t,
    y: y0 + vy * t - 0.5 * gravity * t * t,
  };
}

/**
 * Time (in seconds) for a projectile launched at (x0, y0) with vertical velocity vy (m/s)
 * to reach target altitude yTarget, under gravity g (m/s²).
 * Returns the positive root (future time). If unreachable, returns null.
 */
export function flightTimeToAltitude(
  y0: number,
  vy: number,
  yTarget: number,
  gravity: number,
): number | null {
  // 0.5 * g * t^2 - vy * t + (yTarget - y0) = 0
  const a = 0.5 * gravity;
  const b = -vy;
  const c = yTarget - y0;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) return null;
  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  // We want the future time (greater than 0)
  if (t2 > 1e-9) return t2;
  if (t1 > 1e-9) return t1;
  return 0;
}

/**
 * Analytic landing x-coordinate on flat ground at altitude yGround.
 */
export function analyticLandingX(
  x0: number,
  y0: number,
  speedMs: number,
  angleDeg: number,
  yGround: number,
  gravity: number,
): number | null {
  const rad = (angleDeg * Math.PI) / 180;
  const vx = speedMs * Math.cos(rad);
  const vy = speedMs * Math.sin(rad);

  const t = flightTimeToAltitude(y0, vy, yGround, gravity);
  if (t === null) return null;
  return x0 + vx * t;
}
