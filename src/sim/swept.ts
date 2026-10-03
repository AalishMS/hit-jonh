/**
 * Pure TypeScript swept-circle continuous collision detection guard.
 *
 * Matter.js lacks CCD, so fast projectiles can tunnel through thin colliders.
 * This module sweeps a circle against axis-aligned static colliders between
 * fixed steps, returning the earliest time of impact, contact point, and normal.
 * SPEC §9.2.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Box2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SweptHit {
  /** Time of impact along segment [0, 1]. */
  t: number;
  /** Center of circle at impact. */
  point: Point2D;
  /** Outward normal from box surface at impact point. */
  normal: Point2D;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Sweeps a circle of radius `radius` from `p0` to `p1` against an axis-aligned box.
 * Returns the earliest collision, or null if no collision occurs.
 */
export function sweepCircleVsBox(
  p0: Point2D,
  p1: Point2D,
  radius: number,
  box: Box2D,
): SweptHit | null {
  const vx = p1.x - p0.x;
  const vy = p1.y - p0.y;

  // 1. Check if p0 already overlaps the box
  const closestX = clamp(p0.x, box.minX, box.maxX);
  const closestY = clamp(p0.y, box.minY, box.maxY);
  const distSq = (p0.x - closestX) ** 2 + (p0.y - closestY) ** 2;
  if (distSq <= radius * radius) {
    const dist = Math.sqrt(distSq);
    const normal =
      dist > 1e-6
        ? { x: (p0.x - closestX) / dist, y: (p0.y - closestY) / dist }
        : { x: 0, y: -1 };
    return { t: 0, point: { ...p0 }, normal };
  }

  let bestHit: SweptHit | null = null;

  function consider(t: number, px: number, py: number, nx: number, ny: number) {
    if (t >= 0 && t <= 1) {
      if (bestHit === null || t < bestHit.t) {
        bestHit = {
          t,
          point: { x: px, y: py },
          normal: { x: nx, y: ny },
        };
      }
    }
  }

  // 2. Test the 4 expanded flat edges of the Minkowski sum
  // Left side: x = box.minX - radius
  if (vx > 1e-9) {
    const targetX = box.minX - radius;
    const t = (targetX - p0.x) / vx;
    const y = p0.y + t * vy;
    if (y >= box.minY && y <= box.maxY) {
      consider(t, targetX, y, -1, 0);
    }
  }

  // Right side: x = box.maxX + radius
  if (vx < -1e-9) {
    const targetX = box.maxX + radius;
    const t = (targetX - p0.x) / vx;
    const y = p0.y + t * vy;
    if (y >= box.minY && y <= box.maxY) {
      consider(t, targetX, y, 1, 0);
    }
  }

  // Bottom side: y = box.minY - radius
  if (vy > 1e-9) {
    const targetY = box.minY - radius;
    const t = (targetY - p0.y) / vy;
    const x = p0.x + t * vx;
    if (x >= box.minX && x <= box.maxX) {
      consider(t, x, targetY, 0, -1);
    }
  }

  // Top side: y = box.maxY + radius
  if (vy < -1e-9) {
    const targetY = box.maxY + radius;
    const t = (targetY - p0.y) / vy;
    const x = p0.x + t * vx;
    if (x >= box.minX && x <= box.maxX) {
      consider(t, x, targetY, 0, 1);
    }
  }

  // 3. Test the 4 rounded corners (circles at vertices)
  const corners: Point2D[] = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.minX, y: box.maxY },
    { x: box.maxX, y: box.maxY },
  ];

  const vLenSq = vx * vx + vy * vy;
  if (vLenSq > 1e-9) {
    for (const c of corners) {
      const dx = p0.x - c.x;
      const dy = p0.y - c.y;
      const a = vLenSq;
      const b = 2 * (dx * vx + dy * vy);
      const cCoeff = dx * dx + dy * dy - radius * radius;
      const disc = b * b - 4 * a * cCoeff;
      if (disc >= 0) {
        const sqrtDisc = Math.sqrt(disc);
        const t1 = (-b - sqrtDisc) / (2 * a);
        if (t1 >= 0 && t1 <= 1) {
          const px = p0.x + t1 * vx;
          const py = p0.y + t1 * vy;
          const nx = (px - c.x) / radius;
          const ny = (py - c.y) / radius;
          consider(t1, px, py, nx, ny);
        }
      }
    }
  }

  return bestHit;
}
