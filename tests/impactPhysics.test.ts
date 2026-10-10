import { describe, expect, it } from 'vitest';
import Matter from '@matter-js';
import { MAPS } from '../src/levels';
import { AIM, PHYSICS, PROJECTILE, SHOT, WORLD } from '../src/config/tuning';
import { levelPhysics } from '../src/levels/levelPhysics';
import { MatterAdapter } from '../src/physics/matterAdapter';
import { ImpactTimeline } from '../src/render/impactTimeline';
import { FixedStepper } from '../src/sim/fixedStep';
import { ShotClassifier } from '../src/sim/classification';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { SoloChallengeMachine } from '../src/rules/soloChallenge';
import { launchVelocityToWorld, matterGravityY, simYToWorldY } from '../src/sim/units';
import type { LevelData } from '../src/levels/types';

function replay(level: LevelData, hz: number, reduced: boolean, testAim?: { angleDeg: number; powerPercent: number }) {
  const ppm = WORLD.pixelsPerMetre;
  const engine = Matter.Engine.create({ gravity: { x: 0, y: matterGravityY(levelPhysics(level).gravity, ppm, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale } });
  const adapter = new MatterAdapter(engine.world, ppm, WORLD.designHeightPx);
  adapter.setupLevel(level);
  const aim = testAim ?? level.referenceSolutions[0]!;
  const rad = aim.angleDeg * Math.PI / 180;
  const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
  adapter.spawnProjectile((level.cannonSpawn.x + offset * Math.cos(rad)) * ppm,
    simYToWorldY(level.cannonSpawn.y + offset * Math.sin(rad), WORLD.designHeightPx, ppm), PROJECTILE.radiusMetres * ppm,
    launchVelocityToWorld(levelPhysics(level).launchSpeed(aim.powerPercent), aim.angleDeg, ppm));
  const clock = new ImpactTimeline();
  const stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
  const attempt = new ShotAttemptMachine(level.bounds.maxX, SHOT.settledSpeedMs, SHOT.settledSeconds, SHOT.timeoutSeconds, SHOT.boundsMarginMetres);
  const solo = new SoloChallengeMachine(level.id);
  const classifier = new ShotClassifier();
  attempt.fire(); solo.fire();
  let steps = 0;
  for (let frame = 0; frame < hz * 20; frame++) {
    const count = stepper.advance(clock.advance(1 / hz, false, reduced));
    for (let i = 0; i < count; i++) {
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      steps++;
      const state = adapter.stepProjectile(level, PROJECTILE.radiusMetres)!;
      const result = attempt.step(PHYSICS.fixedStepSeconds, { x: state.xSim, y: state.ySim, speed: state.speedMs, hitBody: state.hitJonh, hitHat: state.hitHat });
      if (result.resolved) {
        for (const obstacle of state.obstacleContacts) classifier.recordContact({ role: 'obstacle', id: obstacle.id, ricochet: obstacle.ricochet });
        if (state.hitHat) classifier.recordContact({ role: 'jonhHat' });
        if (state.hitJonh) classifier.recordContact({ role: 'jonhBody' });
        const classification = classifier.classify(true);
        solo.resolveShot(classification.isHit, classification.outcome === 'ricochet_body');
        const effectsTriggered = classification.isHit && clock.bodyImpact(reduced);
        stepper.reset();
        // Aftermath cannot award another shot or change the frozen contact position.
        for (let tail = 0; tail < hz; tail++) clock.advance(1 / hz, false, reduced);
        return { classification, result: solo.result, effectsTriggered, steps, speed: state.impactSpeedMs, x: state.xPx, y: state.yPx };
      }
    }
  }
  throw new Error('Shot failed to resolve');
}

describe('Impact effects preserve real physics and scoring', () => {
  for (const level of MAPS) {
    it(`${level.id} has identical contact, score and shot count across frame rates and reduced motion`, () => {
      const expected = replay(level, 60, true);

      expect(expected.classification.isHit).toBe(true);
      expect(expected.result?.shotsUsed).toBe(1);
      for (const hz of [30, 60, 144]) expect(replay(level, hz, false)).toEqual(expected);
    });
  }
});

it('hat-only contact preserves its score and never starts body impact effects', () => {
  const expected = replay(MAPS[0]!, 60, true, { angleDeg: 25, powerPercent: 62 });
  expect(expected.classification.outcome).toBe('hat_only');
  expect(expected.classification.points).toBe(20);
  expect(expected.effectsTriggered).toBe(false);
  expect(replay(MAPS[0]!, 60, false, { angleDeg: 25, powerPercent: 62 })).toEqual(expected);
});
