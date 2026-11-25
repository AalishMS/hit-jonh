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
 * Initial position (x0, y0), initial velocity (vx, vy). A level's constant wind adds ½·w·t² to x.
 */
export function analyticPosition(
  t: number,
  x0: number,
  y0: number,
  vx: number,
  vy: number,
  gravity: number,
  /** Constant horizontal wind acceleration (m/s², + is +x); none when omitted. */
  windAcceleration = 0,
): Point2D {
  return {
    x: x0 + vx * t + 0.5 * windAcceleration * t * t,
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

/**
 * The launch preview's dots (SPEC §10.3): the first `seconds` of the analytic arc from the muzzle,
 * in world pixels (+y down), bent by the level's constant wind. Dot `i` (1-based) is at time
 * seconds·i/count. Never goes as far as a landing point.
 */
export function previewDotsPx(
  muzzle: Point2D,
  angleDeg: number,
  speedMs: number,
  gravityMs2: number,
  windMs2: number,
  pixelsPerMetre: number,
  seconds: number,
  count: number,
): Point2D[] {
  const rad = (angleDeg * Math.PI) / 180;
  const dots: Point2D[] = [];
  for (let i = 1; i <= count; i++) {
    const t = (seconds * i) / count;
    const p = analyticPosition(t, 0, 0, Math.cos(rad) * speedMs, Math.sin(rad) * speedMs, gravityMs2, windMs2);
    dots.push({ x: muzzle.x + p.x * pixelsPerMetre, y: muzzle.y - p.y * pixelsPerMetre });
  }
  return dots;
}
