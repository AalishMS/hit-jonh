import { describe, expect, it } from 'vitest';
import Matter from '@matter-js';
import { AIM, PHYSICS, PROJECTILE, WORLD } from '../src/config/tuning';
import { BACKYARD_LEVEL } from '../src/levels/backyard';
import { FixedStepper } from '../src/sim/fixedStep';
import { sweepCircleVsBox } from '../src/sim/swept';
import {
  launchVelocityToWorld,
  matterGravityY,
  metresToPixels,
  MS_PER_SECOND,
  pixelsToMetres,
  powerToLaunchSpeed,
  simYToWorldY,
} from '../src/sim/units';
import { flightTimeToAltitude } from '../src/sim/ballistics';

describe('Matter.js physics integration & M1 acceptance criteria', () => {
  const dtMs = PHYSICS.fixedStepSeconds * MS_PER_SECOND;
  const gravityY = matterGravityY(
    PHYSICS.gravity,
    WORLD.pixelsPerMetre,
    PHYSICS.matterGravityScale,
  );

  function createWorld() {
    const engine = Matter.Engine.create({
      gravity: {
        x: 0,
        y: gravityY,
        scale: PHYSICS.matterGravityScale,
      },
      enableSleeping: false,
    });
    return engine;
  }

  it('proves headless Matter runs in Vitest', () => {
    const engine = createWorld();
    expect(engine).toBeDefined();
    expect(engine.world).toBeDefined();
  });

  it('unobstructed Matter flight matches the analytic trajectory within 5 cm at landing', () => {
    // Launch cannonball from (2.5m, 2.2m) at 45 degrees, power 50%
    const engine = createWorld();
    const speed = powerToLaunchSpeed(50, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg);
    const angleDeg = 45;
    const startXSim = 2.5;
    const startYSim = 2.2;
    const groundYSim = BACKYARD_LEVEL.ground.maxY; // 1.6m

    const startXPx = metresToPixels(startXSim, WORLD.pixelsPerMetre);
    const startYPx = simYToWorldY(startYSim, WORLD.designHeightPx, WORLD.pixelsPerMetre);
    const radiusPx = metresToPixels(PROJECTILE.radiusMetres, WORLD.pixelsPerMetre);

    const ball = Matter.Bodies.circle(startXPx, startYPx, radiusPx, {
      frictionAir: 0,
      restitution: 0.2,
    });
    Matter.World.add(engine.world, ball);

    const vWorld = launchVelocityToWorld(speed, angleDeg, WORLD.pixelsPerMetre);
    Matter.Body.setVelocity(ball, vWorld);

    // Analytic expected flight time and landing x
    const rad = (angleDeg * Math.PI) / 180;
    const vx = speed * Math.cos(rad);
    const vy = speed * Math.sin(rad);
    const flightTime = flightTimeToAltitude(startYSim, vy, groundYSim, PHYSICS.gravity);
    expect(flightTime).not.toBeNull();
    const analyticLandingX = startXSim + vx * flightTime!;

    // Step Matter until projectile reaches ground altitude
    const groundYPx = simYToWorldY(groundYSim, WORLD.designHeightPx, WORLD.pixelsPerMetre);
    let simulatedSteps = 0;
    while (ball.position.y < groundYPx && simulatedSteps < 1200) {
      Matter.Engine.update(engine, dtMs);
      simulatedSteps++;
    }

    const matterLandingX = pixelsToMetres(ball.position.x, WORLD.pixelsPerMetre);
    const diffMetres = Math.abs(matterLandingX - analyticLandingX);

    // SPEC §14 M1 criterion: within 5 cm (0.05 m)
    expect(diffMetres).toBeLessThan(0.05);
  });

  it('ten identical shots produce identical landing positions', () => {
    const landingPositions: number[] = [];

    for (let run = 0; run < 10; run++) {
      const engine = createWorld();
      const speed = powerToLaunchSpeed(60, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg);
      const angleDeg = 35;
      const startXPx = metresToPixels(2.5, WORLD.pixelsPerMetre);
      const startYPx = simYToWorldY(2.2, WORLD.designHeightPx, WORLD.pixelsPerMetre);
      const radiusPx = metresToPixels(PROJECTILE.radiusMetres, WORLD.pixelsPerMetre);

      const ball = Matter.Bodies.circle(startXPx, startYPx, radiusPx, {
        frictionAir: 0,
      });
      Matter.World.add(engine.world, ball);

      const vWorld = launchVelocityToWorld(speed, angleDeg, WORLD.pixelsPerMetre);
      Matter.Body.setVelocity(ball, vWorld);

      const groundYPx = simYToWorldY(1.6, WORLD.designHeightPx, WORLD.pixelsPerMetre);
      while (ball.position.y < groundYPx) {
        Matter.Engine.update(engine, dtMs);
      }
      landingPositions.push(ball.position.x);
    }

    // Every landing position must be strictly identical
    for (let i = 1; i < landingPositions.length; i++) {
      expect(landingPositions[i]).toBe(landingPositions[0]);
    }
  });

  it('max-power shots never tunnel through target or a 0.2m wall at any angle', () => {
    // Max power shot (20 m/s)
    const maxSpeed = powerToLaunchSpeed(100, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg);
    const wallBox = {
      minX: 10.0,
      maxX: 10.2, // 0.2m thick wall
      minY: 1.6,
      maxY: 6.0,
    };

    // Test across range of angles that aim at the wall
    for (let angleDeg = 10; angleDeg <= 60; angleDeg += 5) {
      const startX = 2.5;
      const startY = 2.2;
      const rad = (angleDeg * Math.PI) / 180;
      const vx = maxSpeed * Math.cos(rad);
      const vy = maxSpeed * Math.sin(rad);

      let prev = { x: startX, y: startY };
      let passedThroughWithoutHit = false;

      for (let step = 0; step < 240; step++) {
        const t = (step + 1) * PHYSICS.fixedStepSeconds;
        const curr = {
          x: startX + vx * t,
          y: startY + vy * t - 0.5 * PHYSICS.gravity * t * t,
        };

        const hit = sweepCircleVsBox(prev, curr, PROJECTILE.radiusMetres, wallBox);
        if (hit) {
          // Collision was correctly caught by the swept guard!
          break;
        }

        // If circle passed completely past the wall (x > wallBox.maxX) without hit:
        if (prev.x < wallBox.minX && curr.x > wallBox.maxX && curr.y >= wallBox.minY && curr.y <= wallBox.maxY) {
          passedThroughWithoutHit = true;
          break;
        }
        prev = curr;
      }

      expect(passedThroughWithoutHit).toBe(false);
    }
  });

  it('total simulation steps for a shot are identical at 30, 60, or 144 Hz', () => {
    const flightDurationSec = 1.5;

    const countSteps = (fps: number) => {
      const stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
      let totalSteps = 0;
      const frameDeltaSec = 1 / fps;
      const totalFrames = Math.round(flightDurationSec * fps);

      for (let f = 0; f < totalFrames; f++) {
        totalSteps += stepper.advance(frameDeltaSec);
      }
      return totalSteps;
    };

    const steps30 = countSteps(30);
    const steps60 = countSteps(60);
    const steps144 = countSteps(144);

    expect(steps30).toBe(Math.round(flightDurationSec / PHYSICS.fixedStepSeconds));
    expect(steps60).toBe(steps30);
    expect(steps144).toBe(steps30);
  });
});
