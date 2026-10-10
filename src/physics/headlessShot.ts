import Matter from '@matter-js';
import { AIM, PHYSICS, PROJECTILE, SHOT, WORLD } from '../config/tuning';
import { levelPhysics } from '../levels/levelPhysics';
import type { LevelData } from '../levels/types';
import { ShotAttemptMachine } from '../rules/shotAttempt';
import { ShotClassifier, type ClassifiedOutcome } from '../sim/classification';
import { launchVelocityToWorld, matterGravityY, metresToPixels, simYToWorldY } from '../sim/units';
import { MatterAdapter } from './matterAdapter';

export interface HeadlessShotResult {
  outcome: ClassifiedOutcome;
  endXSim: number;
  endYSim: number;
  steps: number;
}

/** Runs one shot with real Matter and no rendering, classified exactly as the scene does. */
export function runHeadlessShot(level: LevelData, angleDeg: number, powerPercent: number): HeadlessShotResult {
  const ppm = WORLD.pixelsPerMetre;
  const physics = levelPhysics(level);
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: matterGravityY(physics.gravity, ppm, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale },
  });
  const adapter = new MatterAdapter(engine.world, ppm, WORLD.designHeightPx);
  adapter.setupLevel(level);
  const angle = angleDeg * Math.PI / 180;
  const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
  adapter.spawnProjectile(
    metresToPixels(level.cannonSpawn.x + offset * Math.cos(angle), ppm),
    simYToWorldY(level.cannonSpawn.y + offset * Math.sin(angle), WORLD.designHeightPx, ppm),
    PROJECTILE.radiusMetres * ppm,
    launchVelocityToWorld(physics.launchSpeed(powerPercent), angleDeg, ppm),
  );
  const attempt = new ShotAttemptMachine(level.bounds.maxX, SHOT.settledSpeedMs,
    SHOT.settledSeconds, SHOT.timeoutSeconds, SHOT.boundsMarginMetres);
  attempt.fire(angleDeg, powerPercent);
  const classifier = new ShotClassifier();
  const maxSteps = Math.ceil(SHOT.timeoutSeconds / PHYSICS.fixedStepSeconds) + 1;
  for (let step = 1; step <= maxSteps; step++) {
    Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
    const state = adapter.stepProjectile(level, PROJECTILE.radiusMetres);
    if (!state) break;
    const result = attempt.step(PHYSICS.fixedStepSeconds, {
      x: state.xSim, y: state.ySim, speed: state.speedMs, hitBody: state.hitJonh, hitHat: state.hitHat,
    });
    if (!result.resolved) continue;
    for (const obs of state.obstacleContacts) classifier.recordContact({ role: 'obstacle', id: obs.id, ricochet: obs.ricochet });
    if (state.hitGround) classifier.recordContact({ role: 'ground' });
    if (state.hitHat || result.hadHatHit) classifier.recordContact({ role: 'jonhHat' });
    if (state.hitJonh) classifier.recordContact({ role: 'jonhBody' });
    if (state.passedOverhead) classifier.recordOverhead();
    return { outcome: classifier.classify(true).outcome, endXSim: state.xSim, endYSim: state.ySim, steps: step };
  }
  return { outcome: 'miss', endXSim: Number.NaN, endYSim: Number.NaN, steps: maxSteps };
}
