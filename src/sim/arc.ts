/**
 * Curved colliders for the swept guard [PROPOSED 2026-11-25] (SPEC §9.2): a thick circular arc, the
 * region between radii `radius` and `radius + thickness` about a centre and between two angles. A
 * skate ramp rides on its inner (concave) face. Pure TypeScript, metres, +y up.
 *
 * Matter has no curved bodies and no CCD, so the arc is solved exactly here: `sweepCircleVsArc`
 * finds the earliest touch of a moving ball (no joints for a rolling ball to snag on, nothing thin to
 * tunnel through), and `rollOnArc` moves a ball that rolls along the inner face for one fixed step.
 */

import type { Point2D, SweptHit } from './swept';

export interface ArcShape {
  cx: number;
  cy: number;
  /** Radius of the inner (riding, concave) face. */
  radius: number;
  /** Solid depth behind the inner face; the outer face is at radius + thickness. */
  thickness: number;
  /** The arc runs counter-clockwise from `start` to `end` (radians from +x), 0 < end − start ≤ π. */
  start: number;
  end: number;
}

/** Which part of the arc a hit touched: the riding face, the back, an end face, or a corner. */
export type ArcFeature = 'inner' | 'outer' | 'startCap' | 'endCap' | 'corner';

export interface ArcHit extends SweptHit {
  feature: ArcFeature;
}

const TAU = 2 * Math.PI;

/** An arc in radians from level-style data in degrees. */
export function arcShape(a: { centre: Point2D; radius: number; thickness: number; startDeg: number; endDeg: number }): ArcShape {
  return {
    cx: a.centre.x,
    cy: a.centre.y,
    radius: a.radius,
    thickness: a.thickness,
    start: (a.startDeg * Math.PI) / 180,
    end: (a.endDeg * Math.PI) / 180,
  };
}

/** Unit vector from the centre at `angle`. */
export function radial(angle: number): Point2D {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** Counter-clockwise unit tangent at `angle`. */
export function tangent(angle: number): Point2D {
  return { x: -Math.sin(angle), y: Math.cos(angle) };
}

const dot = (a: Point2D, b: Point2D) => a.x * b.x + a.y * b.y;

/** `angle` re-expressed in [start, start + 2π). */
function fromStart(shape: ArcShape, angle: number): number {
  let a = (angle - shape.start) % TAU;
  if (a < 0) a += TAU;
  return shape.start + a;
}

/** True when `angle` lies within the arc's angular range. */
export function withinArc(shape: ArcShape, angle: number): boolean {
  return fromStart(shape, angle) <= shape.end + 1e-12;
}

/** The angle within the arc nearest to `angle` (itself when inside, else the nearer end). */
export function clampToArc(shape: ArcShape, angle: number): number {
  const a = fromStart(shape, angle);
  if (a <= shape.end) return a;
  return a - shape.end <= shape.start + TAU - a ? shape.end : shape.start;
}

/** Point on the circle of radius `r` about the arc's centre at `angle`. */
export function arcPoint(shape: ArcShape, angle: number, r: number): Point2D {
  return { x: shape.cx + Math.cos(angle) * r, y: shape.cy + Math.sin(angle) * r };
}

/** The four corners: inner and outer ends of the start face, then of the end face. */
export function arcCorners(shape: ArcShape): Point2D[] {
  const outer = shape.radius + shape.thickness;
  return [
    arcPoint(shape, shape.start, shape.radius),
    arcPoint(shape, shape.start, outer),
    arcPoint(shape, shape.end, shape.radius),
    arcPoint(shape, shape.end, outer),
  ];
}

/** Outward normal of an end face (away from the solid). */
function capNormal(shape: ArcShape, which: 'startCap' | 'endCap'): Point2D {
  const t = tangent(which === 'startCap' ? shape.start : shape.end);
  return which === 'startCap' ? { x: -t.x, y: -t.y } : t;
}

export interface ArcClosest {
  /** Nearest point of the solid (the point itself when inside). */
  point: Point2D;
  /** 0 when the point is inside the solid. */
  distance: number;
  /** Distance outside the solid, or minus the depth to the nearest face when inside. */
  signedDistance: number;
  feature: ArcFeature;
  /** Outward normal of the surface nearest to the point (away from the solid). */
  normal: Point2D;
}

function closestOnSegment(p: Point2D, a: Point2D, b: Point2D): { point: Point2D; s: number } {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len2 = ex * ex + ey * ey;
  const s = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2)) : 0;
  return { point: { x: a.x + s * ex, y: a.y + s * ey }, s };
}

/** Nearest point of the thick arc to `p`, and which surface it is on. */
export function closestOnArc(shape: ArcShape, p: Point2D): ArcClosest {
  const dx = p.x - shape.cx;
  const dy = p.y - shape.cy;
  const d = Math.hypot(dx, dy);
  const inner = shape.radius;
  const outer = shape.radius + shape.thickness;
  if (d > 1e-12 && withinArc(shape, Math.atan2(dy, dx))) {
    const ux = dx / d;
    const uy = dy / d;
    if (d < inner) {
      return { point: { x: shape.cx + ux * inner, y: shape.cy + uy * inner }, distance: inner - d, signedDistance: inner - d, feature: 'inner', normal: { x: -ux, y: -uy } };
    }
    if (d > outer) {
      return { point: { x: shape.cx + ux * outer, y: shape.cy + uy * outer }, distance: d - outer, signedDistance: d - outer, feature: 'outer', normal: { x: ux, y: uy } };
    }
    // Inside the solid: the nearest face is where it would be pushed out.
    const rel = { x: dx, y: dy };
    const depths: Array<[number, ArcFeature, Point2D]> = [
      [d - inner, 'inner', { x: -ux, y: -uy }],
      [outer - d, 'outer', { x: ux, y: uy }],
      [dot(rel, tangent(shape.start)), 'startCap', capNormal(shape, 'startCap')],
      [-dot(rel, tangent(shape.end)), 'endCap', capNormal(shape, 'endCap')],
    ];
    depths.sort((a, b) => a[0] - b[0]);
    const [depth, feature, normal] = depths[0]!;
    return { point: { ...p }, distance: 0, signedDistance: -depth, feature, normal };
  }
  // Outside the angular range (or at the centre): the nearest point is on an end face.
  let best: ArcClosest | null = null;
  for (const which of ['startCap', 'endCap'] as const) {
    const angle = which === 'startCap' ? shape.start : shape.end;
    const c = closestOnSegment(p, arcPoint(shape, angle, inner), arcPoint(shape, angle, outer));
    const dist = Math.hypot(p.x - c.point.x, p.y - c.point.y);
    if (best && dist >= best.distance) continue;
    const normal = dist > 1e-12 ? { x: (p.x - c.point.x) / dist, y: (p.y - c.point.y) / dist } : capNormal(shape, which);
    best = { point: c.point, distance: dist, signedDistance: dist, feature: c.s <= 0 || c.s >= 1 ? 'corner' : which, normal };
  }
  return best!;
}

/**
 * Sweeps a circle of radius `r` from `p0` to `p1` against the thick arc. Returns the earliest touch
 * (t in [0, 1]; 0 when it already touches), the ball's centre then, and the outward surface normal,
 * or null. The swept shape is exact: the inner face offset inwards by r, the outer face outwards,
 * both end faces and four rounded corners.
 */
export function sweepCircleVsArc(p0: Point2D, p1: Point2D, r: number, shape: ArcShape): ArcHit | null {
  const start = closestOnArc(shape, p0);
  if (start.distance <= r) {
    return { t: 0, point: { ...p0 }, normal: start.normal, feature: start.feature };
  }
  const vx = p1.x - p0.x;
  const vy = p1.y - p0.y;
  const a = vx * vx + vy * vy;
  if (a <= 1e-18) return null;

  let best: ArcHit | null = null;
  const consider = (t: number, feature: ArcFeature, normalAt: (q: Point2D) => Point2D) => {
    if (!(t >= 0 && t <= 1) || (best && t >= best.t)) return;
    const point = { x: p0.x + t * vx, y: p0.y + t * vy };
    best = { t, point, normal: normalAt(point), feature };
  };
  const ox = p0.x - shape.cx;
  const oy = p0.y - shape.cy;
  const b = 2 * (ox * vx + oy * vy);
  const cc = ox * ox + oy * oy;
  const angleAt = (t: number) => Math.atan2(oy + t * vy, ox + t * vx);

  // Inner (riding) face: the ball's centre leaves the disc of radius R − r inside the arc's range.
  const ri = shape.radius - r;
  if (ri > 0) {
    const disc = b * b - 4 * a * (cc - ri * ri);
    if (disc >= 0) {
      const t = (-b + Math.sqrt(disc)) / (2 * a);
      if (t >= 0 && t <= 1 && withinArc(shape, angleAt(t))) {
        consider(t, 'inner', q => {
          const len = Math.hypot(q.x - shape.cx, q.y - shape.cy);
          return { x: (shape.cx - q.x) / len, y: (shape.cy - q.y) / len };
        });
      }
    }
  }

  // Outer face: the centre enters the disc of radius R + thickness + r from outside.
  const ro = shape.radius + shape.thickness + r;
  if (cc > ro * ro) {
    const disc = b * b - 4 * a * (cc - ro * ro);
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t >= 0 && t <= 1 && withinArc(shape, angleAt(t))) {
        consider(t, 'outer', q => {
          const len = Math.hypot(q.x - shape.cx, q.y - shape.cy);
          return { x: (q.x - shape.cx) / len, y: (q.y - shape.cy) / len };
        });
      }
    }
  }

  // End faces, offset outwards by r.
  for (const which of ['startCap', 'endCap'] as const) {
    const angle = which === 'startCap' ? shape.start : shape.end;
    const n = capNormal(shape, which);
    const vn = vx * n.x + vy * n.y;
    if (vn >= -1e-12) continue;
    const foot = arcPoint(shape, angle, shape.radius);
    const t = (r - ((p0.x - foot.x) * n.x + (p0.y - foot.y) * n.y)) / vn;
    if (!(t >= 0 && t <= 1)) continue;
    const u = radial(angle);
    const along = (ox + t * vx) * u.x + (oy + t * vy) * u.y;
    if (along >= shape.radius && along <= shape.radius + shape.thickness) consider(t, which, () => n);
  }

  // Rounded corners.
  for (const k of arcCorners(shape)) {
    const kx = p0.x - k.x;
    const ky = p0.y - k.y;
    const kb = 2 * (kx * vx + ky * vy);
    const disc = kb * kb - 4 * a * (kx * kx + ky * ky - r * r);
    if (disc < 0) continue;
    const t = (-kb - Math.sqrt(disc)) / (2 * a);
    consider(t, 'corner', q => ({ x: (q.x - k.x) / r, y: (q.y - k.y) / r }));
  }

  return best;
}

export interface ArcRollInput {
  shape: ArcShape;
  ballRadius: number;
  /** Ball centre and velocity (m/s) at the start of the step. */
  p0: Point2D;
  v0: Point2D;
  /** Velocity change the free step applied (gravity and any wind, × dt). */
  dv: Point2D;
  dt: number;
  /** Rolling-resistance coefficient: drag = coefficient × normal load. */
  rollingResistance: number;
  /**
   * Drag multiplier while the ball is trapped: too slow to reach either end of the arc even without
   * drag. A trapped ball can only rock and settle, so this shortens the rocking without changing
   * where it can go. 1 when omitted.
   */
  trappedDragScale?: number;
  /** The ball rests this far inside the riding circle (metres), so the next sweep starts clear of it. */
  epsilon?: number;
}

export interface ArcRollResult {
  point: Point2D;
  velocity: Point2D;
  /** The angle the ball ended at (clamped to the arc). */
  angle: number;
  /** Speed along the arc (m/s), + counter-clockwise. */
  speed: number;
  /** The end of the arc the ball rolled off this step (the lip it launched from), if any. */
  left: 'start' | 'end' | null;
}

/**
 * One fixed step of a ball rolling on the inner face: the face supplies exactly the normal force the
 * curve needs, so only the applied acceleration's tangential part changes the speed (taken at the
 * step's mid-angle, which keeps the energy error third-order in dt), less a rolling drag proportional
 * to the normal load (gravity's pressing part plus the centripetal v²/ρ). A ball whose drag outweighs
 * the push holds still. A ball that rolls past an end leaves along the tangent there: the lip launch.
 * A ball that cannot reach either end (trapped in a bowl) may get a stronger drag so it settles soon.
 */
export function rollOnArc(i: ArcRollInput): ArcRollResult {
  const { shape, dt } = i;
  const rho = shape.radius - i.ballRadius;
  const eps = i.epsilon ?? 1e-4;
  const phi0 = clampToArc(shape, Math.atan2(i.p0.y - shape.cy, i.p0.x - shape.cx));
  const s0 = dot(i.v0, tangent(phi0));
  const phiMid = phi0 + (s0 * dt) / (2 * rho);
  let s1 = s0 + dot(i.dv, tangent(phiMid));
  const load = Math.max(0, (s0 * s0) / rho + dot(i.dv, radial(phiMid)) / dt);
  // Height along the arc as the applied acceleration sees it (per unit mass, constant dropped).
  const potential = (angle: number) => (-dot(i.dv, radial(angle)) / dt) * rho;
  const trapped = 0.5 * s0 * s0 < Math.min(potential(shape.start), potential(shape.end)) - potential(phi0);
  const drag = i.rollingResistance * load * dt * (trapped ? i.trappedDragScale ?? 1 : 1);
  s1 = Math.abs(s1) <= drag ? 0 : s1 - Math.sign(s1) * drag;
  const phi1 = phi0 + (0.5 * (s0 + s1) * dt) / rho;

  const leaveAt = phi1 > shape.end ? 'end' : phi1 < shape.start ? 'start' : null;
  if (leaveAt) {
    // It reaches the lip a fraction f into the step, leaves along the tangent at the speed it had
    // there, and flies free (the applied acceleration only) for the rest of the step.
    const edge = leaveAt === 'end' ? shape.end : shape.start;
    const f = Math.max(0, Math.min(1, (edge - phi0) / (phi1 - phi0)));
    const lipSpeed = s0 + (s1 - s0) * f;
    const t = tangent(edge);
    const rest = 1 - f;
    const velocity = { x: t.x * lipSpeed + i.dv.x * rest, y: t.y * lipSpeed + i.dv.y * rest };
    const base = arcPoint(shape, edge, rho - eps);
    return {
      point: { x: base.x + velocity.x * rest * dt, y: base.y + velocity.y * rest * dt },
      velocity,
      angle: edge,
      speed: lipSpeed,
      left: leaveAt,
    };
  }
  const t = tangent(phi1);
  return { point: arcPoint(shape, phi1, rho - eps), velocity: { x: t.x * s1, y: t.y * s1 }, angle: phi1, speed: s1, left: null };
}

/**
 * Whether the thick arc and an axis-aligned box overlap (touching does not count). Exact for the
 * box's corners inside the arc and the arc's corners inside the box; the faces are sampled every
 * half degree, which is plenty for level validation (a 3 m arc moves 2.6 cm per sample).
 */
export function arcOverlapsBox(shape: ArcShape, box: { minX: number; maxX: number; minY: number; maxY: number }): boolean {
  const inBox = (p: Point2D) => p.x > box.minX + 1e-9 && p.x < box.maxX - 1e-9 && p.y > box.minY + 1e-9 && p.y < box.maxY - 1e-9;
  const corners = [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.minX, y: box.maxY }, { x: box.maxX, y: box.maxY },
    { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }];
  if (corners.some(c => closestOnArc(shape, c).signedDistance < -1e-9)) return true;
  if (arcCorners(shape).some(inBox)) return true;
  const n = Math.max(2, Math.ceil(((shape.end - shape.start) * 180) / Math.PI / 0.5));
  for (let k = 0; k <= n; k++) {
    const a = shape.start + ((shape.end - shape.start) * k) / n;
    if (inBox(arcPoint(shape, a, shape.radius)) || inBox(arcPoint(shape, a, shape.radius + shape.thickness))) return true;
  }
  return false;
}
