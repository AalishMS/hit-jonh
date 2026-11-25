import { AIM, JONH_WALK, PROJECTILE, WIND } from '../config/tuning';
import type { Box2D, Point2D } from '../sim/swept';
import { routeLegs, routeSweptBoxes } from './jonhRoute';
import { levelPhysics } from './levelPhysics';
import type { LevelData } from './types';

export interface ValidationConfig {
  maxSpeedMs: number;
  dtSeconds: number;
  minThicknessMetres: number;
  /** Cannonball radius for portal clearance checks; PROJECTILE.radiusMetres when omitted. */
  ballRadiusMetres?: number;
}

/** Free space (metres) a portal exit keeps around the ball, so it never reappears touching anything. */
const PORTAL_EXIT_CLEARANCE_METRES = 0.05;

/** Distance from a point to a box (0 inside it). */
function distanceToBox(p: Point2D, box: Box2D): number {
  const dx = Math.max(box.minX - p.x, 0, p.x - box.maxX);
  const dy = Math.max(box.minY - p.y, 0, p.y - box.maxY);
  return Math.hypot(dx, dy);
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function boxThickness(box: Box2D): { width: number; height: number; minThickness: number } {
  const width = Math.abs(box.maxX - box.minX);
  const height = Math.abs(box.maxY - box.minY);
  return {
    width,
    height,
    minThickness: Math.min(width, height),
  };
}

export function validateLevel(level: LevelData, config: ValidationConfig): ValidationResult {
  const errors: string[] = [];
  // A map that scales the cannon up needs thicker colliders than the global top speed implies.
  // Wind keeps accelerating the ball in flight, so its speed can exceed the cannon's.
  const maxSpeed = Math.max(config.maxSpeedMs, levelPhysics(level).maxSpeedMs) +
    Math.abs(level.wind?.accelerationMs2 ?? 0) * WIND.thicknessFlightSeconds;
  const requiredThickness = Math.max(
    config.minThicknessMetres,
    maxSpeed * config.dtSeconds,
  );

  // 1. Bounds check
  if (level.bounds.maxX <= level.bounds.minX || level.bounds.maxY <= level.bounds.minY) {
    errors.push(`Invalid level bounds: [${level.bounds.minX}, ${level.bounds.maxX}] x [${level.bounds.minY}, ${level.bounds.maxY}]`);
  }

  // 2. Cannon spawn inside bounds
  if (
    level.cannonSpawn.x < level.bounds.minX ||
    level.cannonSpawn.x > level.bounds.maxX ||
    level.cannonSpawn.y < level.bounds.minY ||
    level.cannonSpawn.y > level.bounds.maxY
  ) {
    errors.push(`Cannon spawn (${level.cannonSpawn.x}, ${level.cannonSpawn.y}) is outside level bounds`);
  }

  // 3. Ground thickness
  const groundThickness = boxThickness(level.ground);
  if (groundThickness.minThickness < requiredThickness) {
    errors.push(
      `Ground thickness (${groundThickness.minThickness.toFixed(3)}m) is less than required minimum (${requiredThickness.toFixed(3)}m)`,
    );
  }

  // 4. Jonh body thickness and bounds
  const jonhThickness = boxThickness(level.jonhSpawn.bodyBox);
  if (jonhThickness.minThickness < requiredThickness) {
    errors.push(
      `Jonh body thickness (${jonhThickness.minThickness.toFixed(3)}m) is less than required minimum (${requiredThickness.toFixed(3)}m)`,
    );
  }

  // 5. Obstacles
  for (const obs of level.obstacles) {
    const obsThickness = boxThickness(obs.box);
    if (obsThickness.minThickness < requiredThickness) {
      errors.push(
        `Obstacle "${obs.id}" thickness (${obsThickness.minThickness.toFixed(3)}m) is less than required minimum (${requiredThickness.toFixed(3)}m)`,
      );
    }
  }

  // 6. Reference solutions
  if (!level.referenceSolutions || level.referenceSolutions.length === 0) {
    errors.push('Level has no reference solutions');
  }

  // 7. Obstacle ids are unique (breakables are tracked by id), breakable values in range.
  const obstacleIds = new Set<string>();
  for (const obs of level.obstacles) {
    if (obstacleIds.has(obs.id)) errors.push(`Duplicate obstacle id "${obs.id}"`);
    obstacleIds.add(obs.id);
    const b = obs.breakable;
    if (b && !(b.minImpactSpeedMs > 0)) errors.push(`Breakable "${obs.id}" needs a positive minImpactSpeedMs`);
    if (b && !(b.speedKept > 0 && b.speedKept <= 1)) errors.push(`Breakable "${obs.id}" speedKept must be in (0, 1]`);
  }

  // 7b. Wind: a real, bounded, horizontal acceleration, with its windsock inside the world.
  if (level.wind) {
    const a = level.wind.accelerationMs2;
    if (!Number.isFinite(a) || a === 0 || Math.abs(a) > WIND.maxAccelerationMs2) {
      errors.push(`Wind acceleration ${a} must be non-zero and at most ${WIND.maxAccelerationMs2} m/s²`);
    }
    const sockX = level.wind.windsockX ?? WIND.defaultSockXMetres;
    if (!(sockX > level.bounds.minX && sockX < level.bounds.maxX)) errors.push('Windsock is outside level bounds');
  }

  // 8. Portals: the exit never puts the ball inside a collider, Jonh or another entry (no loops), and
  //    no entry is within the muzzle's reach.
  const portals = level.portals ?? [];
  const r = config.ballRadiusMetres ?? PROJECTILE.radiusMetres;
  const solids: Array<{ name: string; box: Box2D }> = [
    { name: 'ground', box: level.ground },
    { name: 'Jonh', box: level.jonhSpawn.bodyBox },
    ...(level.jonhSpawn.hatBox ? [{ name: "Jonh's hat", box: level.jonhSpawn.hatBox }] : []),
    // Walking Jonh: everywhere his body and hat pass along the route.
    ...(level.jonhRoute ? routeSweptBoxes(level.jonhSpawn, level.jonhRoute).map(box => ({ name: "Jonh's route", box })) : []),
    ...level.obstacles.map(o => ({ name: `obstacle "${o.id}"`, box: o.box })),
  ];
  const portalIds = new Set<string>();
  const muzzleReach = AIM.barrelLengthMetres + AIM.muzzleGapMetres + 2 * r;
  for (const portal of portals) {
    if (portalIds.has(portal.id)) errors.push(`Duplicate portal id "${portal.id}"`);
    portalIds.add(portal.id);
    const { entry, exit } = portal;
    if (!(entry.radius > 0)) errors.push(`Portal "${portal.id}" entry needs a positive radius`);
    for (const [name, p] of [['entry', entry], ['exit', exit]] as const) {
      if (p.x < level.bounds.minX || p.x > level.bounds.maxX || p.y < level.bounds.minY || p.y > level.bounds.maxY) {
        errors.push(`Portal "${portal.id}" ${name} is outside level bounds`);
      }
    }
    if (!Number.isFinite(exit.angleDeg)) errors.push(`Portal "${portal.id}" exit needs an angle`);
    for (const solid of solids) {
      if (distanceToBox(exit, solid.box) < r + PORTAL_EXIT_CLEARANCE_METRES) {
        errors.push(`Portal "${portal.id}" exit overlaps ${solid.name}`);
      }
    }
    for (const other of portals) {
      if (Math.hypot(exit.x - other.entry.x, exit.y - other.entry.y) < other.entry.radius + r + PORTAL_EXIT_CLEARANCE_METRES) {
        errors.push(`Portal "${portal.id}" exit is inside the entry of "${other.id}"`);
      }
    }
    if (Math.hypot(entry.x - level.cannonSpawn.x, entry.y - level.cannonSpawn.y) < entry.radius + muzzleReach + PORTAL_EXIT_CLEARANCE_METRES) {
      errors.push(`Portal "${portal.id}" entry is within reach of the cannon muzzle`);
    }
  }

  // 9. Walking Jonh (SPEC §10, 2026-11-25): a sane route that stays inside the level, never walks
  //    through an obstacle and keeps his feet on one level surface the whole way.
  if (level.jonhRoute) errors.push(...validateRoute(level));

  return {
    valid: errors.length === 0,
    errors,
  };
}

/** Route rules [PROPOSED 2026-11-25]: see validateLevel step 9. */
function validateRoute(level: LevelData): string[] {
  const route = level.jonhRoute!;
  const errors: string[] = [];
  const wps = route.waypoints;
  if (wps.length < 2) return ['Jonh route needs at least two waypoints'];
  wps.forEach((w, i) => {
    if (!Number.isFinite(w.dx) || !Number.isFinite(w.dy ?? 0)) errors.push(`Jonh route waypoint ${i} needs a finite offset`);
    if ((w.dy ?? 0) !== 0) errors.push(`Jonh route waypoint ${i}: routes must stay level (dy 0) [PROPOSED]`);
    if (!(w.pauseS === undefined || (Number.isFinite(w.pauseS) && w.pauseS >= 0))) errors.push(`Jonh route waypoint ${i} pause must be ≥ 0`);
    if (i > 0 && !(typeof w.speedMs === 'number' && w.speedMs > 0 && w.speedMs <= JONH_WALK.maxSpeedMs)) {
      errors.push(`Jonh route waypoint ${i} speed must be in (0, ${JONH_WALK.maxSpeedMs}] m/s`);
    }
  });
  if (errors.length > 0) return errors;
  const overlaps = (a: Box2D, b: Box2D) => a.minX < b.maxX - 1e-9 && a.maxX > b.minX + 1e-9 && a.minY < b.maxY - 1e-9 && a.maxY > b.minY + 1e-9;
  const swept = routeSweptBoxes(level.jonhSpawn, route);
  for (const box of swept) {
    if (box.minX < level.bounds.minX || box.maxX > level.bounds.maxX || box.minY < level.bounds.minY || box.maxY > level.bounds.maxY) {
      errors.push('Jonh route leaves the level bounds');
    }
    for (const obs of level.obstacles) {
      if (overlaps(box, obs.box)) errors.push(`Jonh route walks through obstacle "${obs.id}"`);
    }
  }
  // Feet on a surface the whole way: one surface whose top is his floor and covers every leg.
  const body = level.jonhSpawn.bodyBox;
  const surfaces = [level.ground, ...level.obstacles.map(o => o.box)];
  for (const leg of routeLegs(route)) {
    const minX = body.minX + Math.min(leg.from.dx, leg.to.dx);
    const maxX = body.maxX + Math.max(leg.from.dx, leg.to.dx);
    if (!surfaces.some(s => Math.abs(s.maxY - body.minY) < 1e-6 && s.minX <= minX + 1e-9 && s.maxX >= maxX - 1e-9)) {
      errors.push(`Jonh route leaves his floor between x ${minX.toFixed(2)} and ${maxX.toFixed(2)} m`);
    }
  }
  return [...new Set(errors)];
}
