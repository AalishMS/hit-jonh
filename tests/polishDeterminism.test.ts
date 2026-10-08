import { describe, expect, it } from 'vitest';
import Matter from '@matter-js';
import { MAPS } from '../src/levels';
import { AIM, FX, LOOK, PHYSICS, PROJECTILE, SHOT, WORLD } from '../src/config/tuning';
import { MatterAdapter } from '../src/physics/matterAdapter';
import { ImpactTimeline } from '../src/render/impactTimeline';
import { FixedStepper } from '../src/sim/fixedStep';
import { ShotClassifier } from '../src/sim/classification';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { hitQuality, impactProfile } from '../src/fx/impactProfile';
import { launchVelocityToWorld, matterGravityY, powerToLaunchSpeed, simYToWorldY } from '../src/sim/units';
import type { LevelData } from '../src/levels/types';

/**
 * Plays a shot the way the polished scene does: cannon wind-up hold, then a quality-scaled
 * hit-stop/slow-motion/ramp on body contact (and a short pulse on a hat-only contact).
 * The physics outcome must be identical to a plain run at every frame rate.
 */
function play(level: LevelData, hz: number, mode: 'plain' | 'effects' | 'reduced', aim = level.referenceSolutions[0]!) {
  const ppm = WORLD.pixelsPerMetre;
  const engine = Matter.Engine.create({ gravity: { x: 0, y: matterGravityY(PHYSICS.gravity, ppm, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale } });
  const adapter = new MatterAdapter(engine.world, ppm, WORLD.designHeightPx);
  adapter.setupLevel(level);
  const rad = aim.angleDeg * Math.PI / 180;
  const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
  adapter.spawnProjectile((level.cannonSpawn.x + offset * Math.cos(rad)) * ppm,
    simYToWorldY(level.cannonSpawn.y + offset * Math.sin(rad), WORLD.designHeightPx, ppm), PROJECTILE.radiusMetres * ppm,
    launchVelocityToWorld(powerToLaunchSpeed(aim.powerPercent, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg), aim.angleDeg, ppm));
  const clock = new ImpactTimeline();
  const reduced = mode === 'reduced';
  if (mode === 'effects') clock.hold(FX.windupSeconds);
  const stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
  const attempt = new ShotAttemptMachine(level.bounds.maxX, SHOT.settledSpeedMs, SHOT.settledSeconds, SHOT.timeoutSeconds, SHOT.boundsMarginMetres);
  const classifier = new ShotClassifier();
  attempt.fire();
  let steps = 0;
  let hatPulsed = false;
  for (let frame = 0; frame < hz * 30; frame++) {
    const count = stepper.advance(mode === 'plain' ? 1 / hz : clock.advance(1 / hz, false, reduced));
    for (let i = 0; i < count; i++) {
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      steps++;
      const state = adapter.stepProjectile(level, PROJECTILE.radiusMetres)!;
      if (mode !== 'plain' && state.hitHat && !state.hitJonh && !hatPulsed) {
        hatPulsed = true;
        clock.pulse(impactProfile('hat', reduced), reduced);
      }
      const result = attempt.step(PHYSICS.fixedStepSeconds, { x: state.xSim, y: state.ySim, speed: state.speedMs, hitBody: state.hitJonh, hitHat: state.hitHat });
      if (result.resolved) {
        for (const obstacle of state.obstacleContacts) classifier.recordContact({ role: 'obstacle', id: obstacle.id, ricochet: obstacle.ricochet });
        if (state.hitHat || result.hadHatHit) classifier.recordContact({ role: 'jonhHat' });
        if (state.hitJonh) classifier.recordContact({ role: 'jonhBody' });
        const classification = classifier.classify(true);
        const quality = hitQuality(classification.outcome, state.impactSpeedMs, LOOK.strongImpactMs);
        if (mode !== 'plain' && classification.isHit) {
          clock.bodyImpact(reduced, impactProfile(quality, reduced));
          stepper.reset();
        }
        return { outcome: classification.outcome, points: classification.points, steps, x: state.xPx, y: state.yPx, quality };
      }
    }
  }
  throw new Error('Shot failed to resolve');
}

describe('Polish-pass effects never change the simulation', () => {
  for (const level of MAPS) {
    it(`${level.id}: identical contact, score and step count with wind-up and quality hit-stop at 30/60/144 Hz`, () => {
      const expected = play(level, 60, 'plain');
      expect(['body', 'ricochet_body']).toContain(expected.outcome);
      for (const hz of [30, 60, 144]) {
        expect(play(level, hz, 'effects')).toEqual(expected);
        expect(play(level, hz, 'reduced')).toEqual(expected);
      }
    });
  }

  it('a hat pulse mid-flight does not change where the ball goes', () => {
    const aim = { angleDeg: 25, powerPercent: 62 };
    const expected = play(MAPS[0]!, 60, 'plain', aim);
    expect(expected.outcome).toBe('hat_only');
    for (const hz of [30, 144]) expect(play(MAPS[0]!, hz, 'effects', aim)).toEqual(expected);
  });
});
