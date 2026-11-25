import { AIM, JONH_WALK, MAGNET, MATERIALS, PROJECTILE, RAMP, WIND } from '../config/tuning';
import { arcCorners, arcOverlapsBox, arcPoint, arcShape, closestOnArc, type ArcShape } from '../sim/arc';
import { magnetMaxSpeed } from '../sim/magnet';
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
  // Wind keeps accelerating the ball in flight, so its speed can exceed the cannon's. A magnet's
  // field is conservative, so it can add at most √(2·A·R) (v² ≤ v₀² + 2·A·R).
  const cannonMax = Math.max(config.maxSpeedMs, levelPhysics(level).maxSpeedMs);
  const maxSpeed = (level.magnet ? magnetMaxSpeed(cannonMax, level.magnet) : cannonMax) +
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

  // 5b. Ramps (SPEC §8.9): a real counter-clockwise arc, thick enough, not too tight, a known material,
  //     inside the world, and never overlapping where Jonh stands.
  for (const ramp of level.ramps ?? []) errors.push(...validateRamp(level, ramp, requiredThickness));

  // 6. Reference solutions
  if (!level.referenceSolutions || level.referenceSolutions.length === 0) {
    errors.push('Level has no reference solutions');
  }

  // 7. Obstacle and ramp ids are unique (contacts and breakables are tracked by id), breakable values in range.
  const obstacleIds = new Set<string>();
  for (const ramp of level.ramps ?? []) {
    if (obstacleIds.has(ramp.id)) errors.push(`Duplicate ramp id "${ramp.id}"`);
    obstacleIds.add(ramp.id);
  }
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

  // 7c. Magnet: a bounded pull, always weaker than gravity (so the ball can never hover or orbit),
  //     a reach that stays clear of the cannon, and a solid housing round its centre.
  if (level.magnet) errors.push(...validateMagnet(level, config.ballRadiusMetres ?? PROJECTILE.radiusMetres));

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
    for (const ramp of level.ramps ?? []) {
      if (closestOnArc(arcShape(ramp), exit).signedDistance < r + PORTAL_EXIT_CLEARANCE_METRES) {
        errors.push(`Portal "${portal.id}" exit overlaps ramp "${ramp.id}"`);
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

/** Magnet rules [PROPOSED 2026-11-25]: see validateLevel step 7c. */
function validateMagnet(level: LevelData, ballRadius: number): string[] {
  const m = level.magnet!;
  const errors: string[] = [];
  const b = level.bounds;
  if (!(Number.isFinite(m.x) && Number.isFinite(m.y) && m.x > b.minX && m.x < b.maxX && m.y > b.minY && m.y < b.maxY)) {
    errors.push('Magnet centre must be inside the level bounds');
  }
  if (!(Number.isFinite(m.radius) && m.radius > 0 && m.radius <= MAGNET.maxRadiusMetres)) {
    errors.push(`Magnet reach ${m.radius} must be in (0, ${MAGNET.maxRadiusMetres}] m`);
  }
  const gravity = levelPhysics(level).gravity;
  const maxPull = Math.min(MAGNET.maxAccelerationMs2, MAGNET.maxShareOfGravity * gravity);
  if (!(Number.isFinite(m.accelerationMs2) && m.accelerationMs2 > 0 && m.accelerationMs2 <= maxPull)) {
    errors.push(`Magnet pull ${m.accelerationMs2} must be positive and at most ${maxPull.toFixed(2)} m/s² (weaker than gravity)`);
  }
  const housing = level.obstacles.find(o => o.id === m.housingId);
  if (!housing) {
    errors.push(`Magnet housing "${m.housingId}" is not an obstacle`);
  } else {
    const h = housing.box;
    if (!(m.x > h.minX && m.x < h.maxX && m.y > h.minY && m.y < h.maxY)) errors.push(`Magnet centre must be inside its housing "${m.housingId}"`);
    if (housing.breakable) errors.push(`Magnet housing "${m.housingId}" cannot be breakable`);
  }
  // The cannon and the ball's spawn point (at any angle) stand outside the reach.
  const muzzleReach = AIM.barrelLengthMetres + AIM.muzzleGapMetres + 2 * ballRadius;
  if (Math.hypot(m.x - level.cannonSpawn.x, m.y - level.cannonSpawn.y) < m.radius + muzzleReach) {
    errors.push('Magnet reach must stay clear of the cannon');
  }
  return errors;
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
    for (const ramp of level.ramps ?? []) {
      if (arcOverlapsBox(arcShape(ramp), box)) errors.push(`Jonh route walks through ramp "${ramp.id}"`);
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

/** Ramp rules [PROPOSED 2026-11-25]: see validateLevel step 5b. */
function validateRamp(level: LevelData, ramp: NonNullable<LevelData['ramps']>[number], requiredThickness: number): string[] {
  const errors: string[] = [];
  const span = ramp.endDeg - ramp.startDeg;
  if (!(span > 0 && span <= 180)) errors.push(`Ramp "${ramp.id}" must run counter-clockwise through more than 0° and at most 180°`);
  if (!(ramp.thickness >= requiredThickness)) {
    errors.push(`Ramp "${ramp.id}" thickness (${ramp.thickness.toFixed(3)}m) is less than required minimum (${requiredThickness.toFixed(3)}m)`);
  }
  if (!(ramp.radius >= RAMP.minRadiusMetres)) errors.push(`Ramp "${ramp.id}" radius must be at least ${RAMP.minRadiusMetres} m`);
  if (!(ramp.material in MATERIALS)) errors.push(`Ramp "${ramp.id}" has unknown material "${ramp.material}"`);
  if (errors.length > 0) return errors;
  const shape: ArcShape = arcShape(ramp);
  const b = level.bounds;
  const inside = (p: Point2D) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
  const samples = [...arcCorners(shape)];
  for (let k = 0; k <= 36; k++) {
    const a = shape.start + ((shape.end - shape.start) * k) / 36;
    samples.push(arcPoint(shape, a, shape.radius), arcPoint(shape, a, shape.radius + shape.thickness));
  }
  if (!samples.every(inside)) errors.push(`Ramp "${ramp.id}" is outside level bounds`);
  const jonh = [level.jonhSpawn.bodyBox, ...(level.jonhSpawn.hatBox ? [level.jonhSpawn.hatBox] : [])];
  if (jonh.some(box => arcOverlapsBox(shape, box))) errors.push(`Ramp "${ramp.id}" overlaps Jonh`);
  return errors;
}
