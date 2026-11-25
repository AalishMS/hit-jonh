import Matter from '@matter-js';
import { AIM, PHYSICS, PROJECTILE, SHOT, WORLD } from '../config/tuning';
import { levelPhysics } from '../levels/levelPhysics';
import type { RoutePose } from '../levels/jonhRoute';
import type { LevelData } from '../levels/types';
import { launchVelocityToWorld, matterGravityY, metresToPixels, simYToWorldY } from '../sim/units';
import { MatterAdapter, type MechanicEvent } from './matterAdapter';

export interface RecordedPoint { t: number; x: number; y: number }

export interface RecordedShot {
  /** Ball centre in world px for every fixed step (t in simulated seconds from launch). */
  points: RecordedPoint[];
  /** Index of the first step touching Jonh's body, or null if the shot never did. */
  contactIndex: number | null;
  /** Incoming speed at that contact (m/s) and the ball's horizontal travel direction then. */
  impactSpeedMs: number;
  dirX: number;
  /** A ricochet surface was touched before the body. */
  trick: boolean;
  /** Breakable smashes and portal jumps, with the ball's velocity then (to replay their effects). */
  events: Array<{ t: number; events: MechanicEvent[]; vxSim: number; vySim: number }>;
  /** Walking Jonh: his route pose at every recorded point (same indices as `points`); null if he stands still. */
  jonh: RoutePose[] | null;
}

/**
 * Plays one shot through real Matter on a private engine (no rendering, no scene) and records the
 * path, so presentation (the title screen's demo shot) can animate a genuine flight. Stops at the
 * first body contact or after `maxSeconds` (the shot timeout by default).
 */
export function recordShot(level: LevelData, angleDeg: number, powerPercent: number, maxSeconds: number = SHOT.timeoutSeconds): RecordedShot {
  const ppm = WORLD.pixelsPerMetre;
  const physics = levelPhysics(level);
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: matterGravityY(physics.gravity, ppm, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale },
  });
  const adapter = new MatterAdapter(engine.world, ppm, WORLD.designHeightPx);
  adapter.setupLevel(level);
  const angle = angleDeg * Math.PI / 180;
  const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
  const start = {
    x: metresToPixels(level.cannonSpawn.x + offset * Math.cos(angle), ppm),
    y: simYToWorldY(level.cannonSpawn.y + offset * Math.sin(angle), WORLD.designHeightPx, ppm),
  };
  adapter.spawnProjectile(start.x, start.y, PROJECTILE.radiusMetres * ppm, launchVelocityToWorld(physics.launchSpeed(powerPercent), angleDeg, ppm));
  const points: RecordedPoint[] = [{ t: 0, ...start }];
  const startPose = adapter.jonhRoutePoseAt(0);
  const jonh: RoutePose[] | null = startPose ? [startPose] : null;
  const events: RecordedShot['events'] = [];
  const steps = Math.ceil(maxSeconds / PHYSICS.fixedStepSeconds);
  let dirX = 1;
  for (let step = 1; step <= steps; step++) {
    Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
    const state = adapter.stepProjectile(level, PROJECTILE.radiusMetres);
    if (!state) break;
    points.push({ t: step * PHYSICS.fixedStepSeconds, x: state.xPx, y: state.yPx });
    if (jonh) jonh.push(adapter.jonhRoutePoseAt(step * PHYSICS.fixedStepSeconds)!);
    if (state.events.length > 0) events.push({ t: step * PHYSICS.fixedStepSeconds, events: [...state.events], vxSim: state.vxSim, vySim: state.vySim });
    if (!state.hitJonh && Math.abs(state.vxSim) > 0.05) dirX = Math.sign(state.vxSim);
    if (state.hitJonh) {
      return { points, contactIndex: points.length - 1, impactSpeedMs: state.impactSpeedMs, dirX, trick: state.hadRicochetBeforeBody, events, jonh };
    }
  }
  return { points, contactIndex: null, impactSpeedMs: 0, dirX, trick: false, events, jonh };
}

/** Jonh's recorded route pose at simulated time `t` (the nearest earlier step); null if he stands still. */
export function sampleRecordedJonh(shot: Pick<RecordedShot, 'jonh' | 'points'>, t: number): RoutePose | null {
  const poses = shot.jonh;
  if (!poses || poses.length === 0) return null;
  const i = Math.max(0, Math.min(poses.length - 1, Math.floor(t / PHYSICS.fixedStepSeconds + 1e-9)));
  return poses[i]!;
}

/** The recorded ball position at simulated time `t` (linear between steps). */
export function sampleRecorded(points: readonly RecordedPoint[], t: number): RecordedPoint {
  if (points.length === 0) return { t, x: 0, y: 0 };
  const dt = PHYSICS.fixedStepSeconds;
  const i = Math.max(0, Math.min(points.length - 2, Math.floor(t / dt)));
  const a = points[i]!;
  const b = points[i + 1] ?? a;
  const k = Math.max(0, Math.min(1, (t - a.t) / dt));
  return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}
