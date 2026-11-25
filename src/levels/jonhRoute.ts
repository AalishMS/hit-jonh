import { PHYSICS } from '../config/tuning';
import type { Box2D, JonhRouteData, JonhSpawnData } from './types';

/**
 * Walking Jonh [DECIDED by owner 2026-11-25 for one garden; PROPOSED route rules].
 *
 * His offset from the spawn is a pure function of simulated time since Fire, and the physics counts
 * that time in fixed steps (`routePoseAtStep`), so a shot's outcome stays a pure function of
 * (map, target position, angle, power) for online re-simulation, replays, Daily Bonk and the tests.
 * The Matter colliders, the swept guard, the renderer and the replays all read this one function.
 */

/** Where Jonh is on his route, and what the walk cycle needs. */
export interface RoutePose {
  dx: number;
  dy: number;
  /** Metres walked since Fire (drives the walk cycle so his feet keep pace). */
  distance: number;
  /** Walking right (+1), left (−1), or 0 before he has set off. Pauses keep the last direction. */
  facing: -1 | 0 | 1;
  /** On a walking leg right now (false while paused or before / after the route). */
  walking: boolean;
}

/** One stretch of the route: a pause (from === to) or a walk at constant speed. */
export interface RouteLeg {
  start: number;
  /** Infinity for the final hold. */
  end: number;
  from: { dx: number; dy: number };
  to: { dx: number; dy: number };
  /** Metres walked before this leg starts. */
  distance: number;
  walking: boolean;
}

const legCache = new WeakMap<JonhRouteData, RouteLeg[]>();

/** The route as timed legs: pause at each stop, walk to the next at its speed, hold at the last. */
export function routeLegs(route: JonhRouteData): RouteLeg[] {
  const cached = legCache.get(route);
  if (cached) return cached;
  const legs: RouteLeg[] = [];
  const wps = route.waypoints;
  let t = 0;
  let distance = 0;
  for (let i = 0; i < wps.length; i++) {
    const at = { dx: wps[i]!.dx, dy: wps[i]!.dy ?? 0 };
    if (i > 0) {
      const from = legs.length > 0 ? legs[legs.length - 1]!.to : { dx: wps[0]!.dx, dy: wps[0]!.dy ?? 0 };
      const length = Math.hypot(at.dx - from.dx, at.dy - from.dy);
      const speed = wps[i]!.speedMs ?? 1;
      const duration = speed > 0 ? length / speed : 0;
      if (duration > 0) {
        legs.push({ start: t, end: t + duration, from, to: at, distance, walking: true });
        t += duration;
        distance += length;
      }
    }
    const pause = i === wps.length - 1 ? Infinity : Math.max(0, wps[i]!.pauseS ?? 0);
    if (pause > 0) {
      legs.push({ start: t, end: t + pause, from: at, to: at, distance, walking: false });
      t += pause;
    }
  }
  legCache.set(route, legs);
  return legs;
}

/** Seconds from Fire until he reaches the last stop (where he then stays). */
export function routeDurationSeconds(route: JonhRouteData): number {
  const legs = routeLegs(route);
  const last = legs[legs.length - 1];
  return last ? last.start : 0;
}

/** Jonh's pose `t` simulated seconds after Fire (t ≤ 0: standing at the first stop). */
export function routePoseAt(route: JonhRouteData, t: number): RoutePose {
  const legs = routeLegs(route);
  const first = route.waypoints[0];
  if (!first || legs.length === 0) return { dx: first?.dx ?? 0, dy: first?.dy ?? 0, distance: 0, facing: 0, walking: false };
  let facing: -1 | 0 | 1 = 0;
  for (const leg of legs) {
    // Facing is the direction of the latest walk he has started; pauses keep it.
    if (t > leg.start && leg.walking && leg.to.dx !== leg.from.dx) facing = leg.to.dx > leg.from.dx ? 1 : -1;
    if (t >= leg.end) continue;
    if (!leg.walking || t <= leg.start) {
      return { dx: leg.from.dx, dy: leg.from.dy, distance: leg.distance, facing, walking: false };
    }
    const k = (t - leg.start) / (leg.end - leg.start);
    return {
      dx: leg.from.dx + (leg.to.dx - leg.from.dx) * k,
      dy: leg.from.dy + (leg.to.dy - leg.from.dy) * k,
      distance: leg.distance + Math.hypot(leg.to.dx - leg.from.dx, leg.to.dy - leg.from.dy) * k,
      facing,
      walking: true,
    };
  }
  const last = legs[legs.length - 1]!;
  return { dx: last.to.dx, dy: last.to.dy, distance: last.distance, facing, walking: false };
}

/** Jonh's pose during fixed step `step` after Fire (step 1 is the first step). Integer steps only. */
export function routePoseAtStep(route: JonhRouteData, step: number): RoutePose {
  return routePoseAt(route, Math.max(0, step) * PHYSICS.fixedStepSeconds);
}

/** `spawn` moved by an offset in metres (a new object; level data is never mutated). */
export function shiftJonh(spawn: JonhSpawnData, dx: number, dy: number): JonhSpawnData {
  if (dx === 0 && dy === 0) return spawn;
  const shift = (b: Box2D): Box2D => ({ minX: b.minX + dx, maxX: b.maxX + dx, minY: b.minY + dy, maxY: b.maxY + dy });
  return { bodyBox: shift(spawn.bodyBox), ...(spawn.hatBox ? { hatBox: shift(spawn.hatBox) } : {}) };
}

/**
 * Every box Jonh's body (and hat) sweeps along the route, one per leg: the union of where a walk
 * starts and ends (he moves in straight lines, so this bounds him). Used by level validation.
 */
export function routeSweptBoxes(spawn: JonhSpawnData, route: JonhRouteData): Box2D[] {
  const boxes: Box2D[] = [];
  const union = (a: Box2D, b: Box2D): Box2D => ({
    minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY),
  });
  for (const leg of routeLegs(route)) {
    const a = shiftJonh(spawn, leg.from.dx, leg.from.dy);
    const b = shiftJonh(spawn, leg.to.dx, leg.to.dy);
    boxes.push(union(a.bodyBox, b.bodyBox));
    if (a.hatBox && b.hatBox) boxes.push(union(a.hatBox, b.hatBox));
  }
  return boxes;
}
