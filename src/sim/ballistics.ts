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
 * A position-dependent pull on the ball for the preview (a level's magnet): `accel` gives m/s² (+y up)
 * at an offset (metres, +y up) from the muzzle. The preview then steps the flight at `dtSeconds`.
 */
export interface PreviewPull {
  accel: (dx: number, dy: number) => Point2D;
  dtSeconds: number;
}

/**
 * The launch preview's dots (SPEC §10.3): the first `seconds` of the arc from the muzzle, in world
 * pixels (+y down), bent by the level's constant wind. Dot `i` (1-based) is at time seconds·i/count.
 * Never goes as far as a landing point. Analytic, unless the level has a magnet (`pull`): then the
 * flight is stepped at the fixed step the way the physics does (semi-implicit Euler, the pull taken
 * where the ball was at the start of each step), so the dots bend towards the magnet as the ball will.
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
  pull?: PreviewPull,
): Point2D[] {
  const rad = (angleDeg * Math.PI) / 180;
  const dots: Point2D[] = [];
  const vx0 = Math.cos(rad) * speedMs;
  const vy0 = Math.sin(rad) * speedMs;
  const offsets = pull ? steppedOffsets(vx0, vy0, gravityMs2, windMs2, pull, seconds, count) : null;
  for (let i = 1; i <= count; i++) {
    const t = (seconds * i) / count;
    const p = offsets ? offsets[i - 1]! : analyticPosition(t, 0, 0, vx0, vy0, gravityMs2, windMs2);
    dots.push({ x: muzzle.x + p.x * pixelsPerMetre, y: muzzle.y - p.y * pixelsPerMetre });
  }
  return dots;
}

/** The preview's offsets from the muzzle (metres, +y up) at seconds·i/count, stepped with a pull. */
function steppedOffsets(vx0: number, vy0: number, gravityMs2: number, windMs2: number, pull: PreviewPull,
  seconds: number, count: number): Point2D[] {
  const dt = pull.dtSeconds;
  const steps = Math.ceil(seconds / dt - 1e-9);
  const path: Point2D[] = [{ x: 0, y: 0 }];
  let x = 0, y = 0, vx = vx0, vy = vy0;
  for (let k = 0; k < steps; k++) {
    const a = pull.accel(x, y);
    vx += (windMs2 + a.x) * dt;
    vy += (a.y - gravityMs2) * dt;
    x += vx * dt;
    y += vy * dt;
    path.push({ x, y });
  }
  const out: Point2D[] = [];
  for (let i = 1; i <= count; i++) {
    const s = (seconds * i) / count / dt;
    const k = Math.min(steps - 1, Math.floor(s));
    const f = Math.min(1, s - k);
    const a = path[k]!;
    const b = path[k + 1]!;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}
