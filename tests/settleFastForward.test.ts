import { describe, expect, it } from 'vitest';
import Matter from '@matter-js';
import { MAPS } from '../src/levels';
import { AIM, PHYSICS, PROJECTILE, SHOT, WORLD } from '../src/config/tuning';
import { levelPhysics } from '../src/levels/levelPhysics';
import { MatterAdapter, type ProjectileState } from '../src/physics/matterAdapter';
import { FixedStepper } from '../src/sim/fixedStep';
import { ShotClassifier } from '../src/sim/classification';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { distanceToBox, fastForwardTarget, SettleClock } from '../src/fx/settleClock';
import { launchVelocityToWorld, matterGravityY, simYToWorldY } from '../src/sim/units';
import type { LevelData } from '../src/levels/types';

type Mode = 'plain' | 'fastForward' | 'skip';

/**
 * Plays one shot frame by frame the way the scene does. 'fastForward' feeds the settle clock's
 * scaled time (and raised step cap) to the stepper; 'skip' also presses Skip as soon as it is
 * offered, finishing the shot synchronously. All must match the plain run exactly.
 */
function play(level: LevelData, angleDeg: number, powerPercent: number, mode: Mode, hz = 60) {
  const ppm = WORLD.pixelsPerMetre;
  const physics = levelPhysics(level);
  const engine = Matter.Engine.create({ gravity: { x: 0, y: matterGravityY(physics.gravity, ppm, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale } });
  const adapter = new MatterAdapter(engine.world, ppm, WORLD.designHeightPx);
  adapter.setupLevel(level);
  const rad = angleDeg * Math.PI / 180;
  const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
  adapter.spawnProjectile((level.cannonSpawn.x + offset * Math.cos(rad)) * ppm,
    simYToWorldY(level.cannonSpawn.y + offset * Math.sin(rad), WORLD.designHeightPx, ppm), PROJECTILE.radiusMetres * ppm,
    launchVelocityToWorld(physics.launchSpeed(powerPercent), angleDeg, ppm));
  const stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
  const attempt = new ShotAttemptMachine(level.bounds.maxX, SHOT.settledSpeedMs, SHOT.settledSeconds, SHOT.timeoutSeconds, SHOT.boundsMarginMetres, level.bounds.minY);
  const clock = new SettleClock();
  attempt.fire(angleDeg, powerPercent);
  let last: ProjectileState | null = null;
  let steps = 0;
  const step = (): ProjectileState | null => {
    Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
    steps++;
    const state = adapter.stepProjectile(level, PROJECTILE.radiusMetres)!;
    last = state;
    const result = attempt.step(PHYSICS.fixedStepSeconds, { x: state.xSim, y: state.ySim, speed: state.speedMs, hitBody: state.hitJonh, hitHat: state.hitHat });
    return result.resolved ? state : null;
  };
  const finish = (state: ProjectileState, frames: number) => {
    const classifier = new ShotClassifier();
    for (const obstacle of state.obstacleContacts) classifier.recordContact({ role: 'obstacle', id: obstacle.id, ricochet: obstacle.ricochet });
    if (state.hitGround) classifier.recordContact({ role: 'ground' });
    if (state.hitHat || attempt.hadHatHit) classifier.recordContact({ role: 'jonhHat' });
    if (state.hitJonh) classifier.recordContact({ role: 'jonhBody' });
    return { outcome: classifier.classify(true).outcome, reason: attempt.missReason, steps, x: state.xPx, y: state.yPx, realSeconds: frames / hz };
  };
  for (let frame = 1; frame <= hz * 30; frame++) {
    const p = last as ProjectileState | null;
    const target = mode === 'plain' || !p ? 1 : fastForwardTarget({
      landed: p.firstGroundContact !== null || p.obstacleContacts.length > 0,
      speedMs: p.speedMs,
      distanceToJonhMetres: distanceToBox(p.xSim, p.ySim, level.jonhSpawn.bodyBox),
      impactActive: p.hitJonh,
    });
    const scale = clock.advance(1 / hz, target);
    if (mode === 'skip' && clock.isFastForwarding) {
      for (let i = 0; i < SHOT.timeoutSeconds / PHYSICS.fixedStepSeconds + 1; i++) {
        const done = step();
        if (done) return finish(done, frame);
      }
    }
    const count = stepper.advance((1 / hz) * scale, Math.ceil(PHYSICS.maxStepsPerFrame * scale));
    for (let i = 0; i < count; i++) {
      const done = step();
      if (done) return finish(done, frame);
    }
  }
  throw new Error('Shot failed to resolve');
}

/** Everything about a shot except how long it took in real time. */
function withoutTime(shot: ReturnType<typeof play>) {
  return { outcome: shot.outcome, reason: shot.reason, steps: shot.steps, x: shot.x, y: shot.y };
}

const AIMS: Array<[number, number]> = [[20, 15], [30, 60], [45, 0], [45, 50], [60, 35], [75, 80], [35, 70]];

describe('Snappy misses: fast-forward and Skip never change a shot', () => {
  for (const level of MAPS) {
    it(`${level.id}: identical outcome, end point and step count; misses resolve sooner`, () => {
      const aims: Array<[number, number]> = [...AIMS, [level.referenceSolutions[0]!.angleDeg, level.referenceSolutions[0]!.powerPercent]];
      let plainSeconds = 0;
      let fastSeconds = 0;
      for (const [angle, power] of aims) {
        const plain = play(level, angle, power, 'plain');
        const expected = withoutTime(plain);
        for (const hz of [30, 60, 144]) expect(withoutTime(play(level, angle, power, 'fastForward', hz))).toEqual(expected);
        expect(withoutTime(play(level, angle, power, 'skip'))).toEqual(expected);
        if (plain.outcome === 'miss') {
          plainSeconds += plain.realSeconds;
          fastSeconds += play(level, angle, power, 'fastForward').realSeconds;
        }
      }
      if (plainSeconds > 0) expect(fastSeconds).toBeLessThan(plainSeconds);
    }, 60_000); // dozens of full Matter shots per map: seconds each, more on a busy machine
  }

  it('a ball that rolls off the end of the ground is out of bounds, not a 15 s timeout', () => {
    const backyard = MAPS.find(m => m.id === 'backyard')!;
    const shot = play(backyard, 35, 70, 'plain');
    expect(shot.outcome).toBe('miss');
    expect(shot.reason).toBe('out_of_bounds');
    expect(shot.steps * PHYSICS.fixedStepSeconds).toBeLessThan(6);
  });
});
