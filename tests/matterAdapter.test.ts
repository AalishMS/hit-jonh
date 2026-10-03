import { describe, expect, it } from 'vitest';
import Matter from '@matter-js';
import { BACKYARD_LEVEL } from '../src/levels/backyard';
import { MatterAdapter } from '../src/physics/matterAdapter';
import { AIM, PHYSICS, PROJECTILE, WORLD } from '../src/config/tuning';
import { launchVelocityToWorld, metresToPixels, simYToWorldY, powerToLaunchSpeed } from '../src/sim/units';
import { FixedStepper } from '../src/sim/fixedStep';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { ShotClassifier } from '../src/sim/classification';

describe('MatterAdapter', () => {
  function makeAdapter() {
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0.4905, scale: 0.001 },
    });
    const adapter = new MatterAdapter(engine.world, 50, 720);
    return { engine, adapter };
  }

  it('sets up level bodies and cleans them up without leaks', () => {
    const { engine, adapter } = makeAdapter();
    adapter.setupLevel(BACKYARD_LEVEL);

    // Ground, JonhBody, JonhHat = 3 bodies
    expect(engine.world.bodies.length).toBe(3);

    adapter.clear();
    expect(engine.world.bodies.length).toBe(0);
  });

  it('spawns projectile without accumulating bodies on repeated spawns', () => {
    const { engine, adapter } = makeAdapter();
    adapter.setupLevel(BACKYARD_LEVEL);

    // Initial bodies = 3
    expect(engine.world.bodies.length).toBe(3);

    // First spawn
    adapter.spawnProjectile(100, 500, 7.5, { x: 10, y: -5 });
    expect(engine.world.bodies.length).toBe(4);

    // Second spawn should replace the first, still 4 bodies total
    adapter.spawnProjectile(100, 500, 7.5, { x: 12, y: -6 });
    expect(engine.world.bodies.length).toBe(4);

    // Remove projectile restores to 3
    adapter.removeProjectile();
    expect(engine.world.bodies.length).toBe(3);
  });

  it('detects swept hit when stepping fast projectile across Jonh', () => {
    const { engine, adapter } = makeAdapter();
    adapter.setupLevel(BACKYARD_LEVEL);

    // Jonh is at x=18m (900px), y=1.6-3.4m (world y=640 to 550px)
    // Spawn projectile right before Jonh, moving fast past him
    adapter.spawnProjectile(850, 600, 7.5, { x: 80, y: 0 });

    // Step across Jonh
    Matter.Engine.update(engine, 1000 / 120);
    const state = adapter.stepProjectile(BACKYARD_LEVEL, 0.15);
    expect(state).not.toBeNull();
    expect(state!.hitJonh).toBe(true);
  });

  it('prevents tunnelling by reflecting velocity when passing through a thin obstacle', () => {
    const { engine, adapter } = makeAdapter();
    
    // Create a level with a 0.2m thin wall
    const thinWallLevel = {
      ...BACKYARD_LEVEL,
      obstacles: [{
        id: 'wall',
        box: { minX: 10, maxX: 10.2, minY: 1.6, maxY: 10 },
        material: 'concrete',
        ricochet: true,
      }],
    };
    
    adapter.setupLevel(thinWallLevel);
    
    // Spawn projectile at x=9.9, y=5.0m
    // 9.9m * 50px/m = 495px
    // y=5.0m -> worldHeight(720) - 5*50 = 470px
    const startX = 495;
    const startY = 470;
    
    // Move completely through the wall in one frame: dx = 0.5m = 25px
    const vWorldX = 25; 
    const vWorldY = 0;
    
    adapter.spawnProjectile(startX, startY, 7.5, { x: vWorldX, y: vWorldY });
    
    // Step matter engine
    Matter.Engine.update(engine, 1000 / 120);
    
    // The swept guard in stepProjectile should catch this
    const state = adapter.stepProjectile(thinWallLevel, 0.15);
    
    // It should have reflected the velocity
    expect(state?.vxSim).toBeLessThan(0);
    // It should be positioned slightly before the wall
    expect(state?.xSim).toBeLessThanOrEqual(10.0);
  });

  it('retains incoming impact speed rather than the reflected speed', () => {
    const { engine, adapter } = makeAdapter();
    adapter.setupLevel(BACKYARD_LEVEL);
    adapter.spawnProjectile(871, 600, 7.5, launchVelocityToWorld(20, 0, 50));
    Matter.Engine.update(engine, 1000 / 120);
    const state = adapter.stepProjectile(BACKYARD_LEVEL, 0.15)!;
    expect(state.hitJonh).toBe(true);
    expect(state.impactSpeedMs).toBeCloseTo(20, 1);
    expect(state.speedMs).toBeLessThan(state.impactSpeedMs);
  });

  it('keeps the first landing point through rolling and clears it on retry', () => {
    const { engine, adapter } = makeAdapter();
    adapter.setupLevel(BACKYARD_LEVEL);
    adapter.spawnProjectile(300, 620, 7.5, launchVelocityToWorld(6, -15, 50));
    let first: ReturnType<MatterAdapter['stepProjectile']> = null;
    for (let step = 0; step < 180; step++) {
      Matter.Engine.update(engine, 1000 / 120);
      const state = adapter.stepProjectile(BACKYARD_LEVEL, 0.15)!;
      if (state.firstGroundContact && !first) first = state;
    }
    const last = adapter.stepProjectile(BACKYARD_LEVEL, 0.15)!;
    expect(first?.firstGroundContact).toBeTruthy();
    expect(last.firstGroundContact).toEqual(first!.firstGroundContact);
    expect(last.xPx).toBeGreaterThan(first!.firstGroundContact!.xPx + 10);
    adapter.spawnProjectile(300, 400, 7.5, launchVelocityToWorld(6, 45, 50));
    expect(adapter.stepProjectile(BACKYARD_LEVEL, 0.15)!.firstGroundContact).toBeNull();
    expect(adapter.stepProjectile(BACKYARD_LEVEL, 0.15)!.impactSpeedMs).toBe(0);
  });

  it('proves every reference solution through the actual adapter and muzzle', () => {
    for (const aim of BACKYARD_LEVEL.referenceSolutions) {
      const { engine, adapter } = makeAdapter();
      adapter.setupLevel(BACKYARD_LEVEL);
      const rad = aim.angleDeg * Math.PI / 180;
      const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
      const speed = powerToLaunchSpeed(aim.powerPercent, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg);
      adapter.spawnProjectile(
        metresToPixels(BACKYARD_LEVEL.cannonSpawn.x + offset * Math.cos(rad), 50),
        simYToWorldY(BACKYARD_LEVEL.cannonSpawn.y + offset * Math.sin(rad), 720, 50),
        7.5, launchVelocityToWorld(speed, aim.angleDeg, 50),
      );
      let hit = false;
      for (let step = 0; step < 720; step++) {
        Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
        if (adapter.stepProjectile(BACKYARD_LEVEL, PROJECTILE.radiusMetres)!.hitJonh) {
          hit = true;
          break;
        }
      }
      expect(hit, `reference ${aim.angleDeg}°/${aim.powerPercent}%`).toBe(true);
    }
  });

  it('catches maximum-speed contacts at every supported integer angle', () => {
    for (let angle = AIM.minAngleDeg; angle <= AIM.maxAngleDeg; angle++) {
      const engine = Matter.Engine.create({ gravity: { x: 0, y: 0, scale: 0.001 } });
      const adapter = new MatterAdapter(engine.world, WORLD.pixelsPerMetre, WORLD.designHeightPx);
      adapter.setupLevel(BACKYARD_LEVEL);
      const x = BACKYARD_LEVEL.jonhSpawn.bodyBox.minX - PROJECTILE.radiusMetres - 0.001;
      adapter.spawnProjectile(metresToPixels(x, 50), simYToWorldY(2.5, WORLD.designHeightPx, 50), 7.5, launchVelocityToWorld(20, angle, 50));
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      expect(adapter.stepProjectile(BACKYARD_LEVEL, 0.15)!.hitJonh, `angle ${angle}`).toBe(true);
    }
  });

  it('keeps outcomes and landing feedback at 30/60/144 Hz and after viewport reframing', () => {
    const shots = [[45, 0], [85, 100], [45, 100], [45, 40], [45, 50]] as const;
    for (const [angle, power] of shots) {
      let reference: { outcome: string; x: number; landingX: number | null } | undefined;
      for (const height of [720, WORLD.designHeightPx]) {
        for (const fps of [30, 60, 144]) {
          const engine = Matter.Engine.create({ gravity: { x: 0, y: 0.4905, scale: 0.001 } });
          const adapter = new MatterAdapter(engine.world, 50, height);
          adapter.setupLevel(BACKYARD_LEVEL);
          const rules = new ShotAttemptMachine(BACKYARD_LEVEL.bounds.maxX);
          const stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
          const rad = angle * Math.PI / 180;
          const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
          adapter.spawnProjectile(
            metresToPixels(2.5 + offset * Math.cos(rad), 50),
            simYToWorldY(2.2 + offset * Math.sin(rad), height, 50), 7.5,
            launchVelocityToWorld(powerToLaunchSpeed(power, AIM.minImpulseNs, AIM.maxImpulseNs, 4), angle, 50),
          );
          rules.fire(angle, power);
          let state = adapter.stepProjectile(BACKYARD_LEVEL, 0.15)!;
          for (let frame = 0; frame < fps * 20 && rules.state === 'simulating'; frame++) {
            const steps = stepper.advance(1 / fps);
            for (let step = 0; step < steps && rules.state === 'simulating'; step++) {
              Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
              state = adapter.stepProjectile(BACKYARD_LEVEL, 0.15)!;
              rules.step(PHYSICS.fixedStepSeconds, { x: state.xSim, y: state.ySim, speed: state.speedMs, hitBody: state.hitJonh });
            }
          }
          expect(rules.state).toBe('resolved');
          const result = { outcome: rules.outcome!, x: state.xSim, landingX: state.firstGroundContact?.xSim ?? null };
          reference ??= result;
          expect(result.outcome).toBe(reference.outcome);
          expect(result.x).toBeCloseTo(reference.x, 5);
          if (reference.landingX !== null) expect(result.landingX).toBeCloseTo(reference.landingX, 5);
          else expect(result.landingX).toBeNull();
          expect(result.outcome).toBe(angle === 45 && power === 40 ? 'hit' : 'miss');
        }
      }
    }
  });

  it('detects hat sensor contact without reflecting projectile velocity', () => {
    const { engine, adapter } = makeAdapter();
    adapter.setupLevel(BACKYARD_LEVEL);

    // Hat is at x=17.7-18.3m, y=3.4-3.7m (projectile radius 0.15m -> center at 3.62m stays above bodyBox maxY 3.4m)
    const startXPx = metresToPixels(17.0, 50);
    const startYPx = simYToWorldY(3.62, 720, 50);

    adapter.spawnProjectile(startXPx, startYPx, 7.5, launchVelocityToWorld(20, 0, 50));
    let state = adapter.stepProjectile(BACKYARD_LEVEL, PROJECTILE.radiusMetres)!;
    for (let i = 0; i < 10; i++) {
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      state = adapter.stepProjectile(BACKYARD_LEVEL, PROJECTILE.radiusMetres)!;
      if (state.hitHat) break;
    }

    expect(state.hitHat).toBe(true);
    expect(state.hitJonh).toBe(false);
    // Sensor collider does not reflect projectile velocity (still moving right, vx > 0)
    expect(state.vxSim).toBeGreaterThan(0);
  });

  it('detects hat-then-body contact when trajectory cuts across both', () => {
    const { engine, adapter } = makeAdapter();
    adapter.setupLevel(BACKYARD_LEVEL);

    // Spawn right above hat angled downward into body
    // Jonh hat: x=[17.7, 18.3], y=[3.4, 3.7]; body: y=[1.6, 3.4]
    const startXPx = metresToPixels(17.8, 50);
    const startYPx = simYToWorldY(3.8, 720, 50);

    // Move straight down into hat and body
    adapter.spawnProjectile(startXPx, startYPx, 7.5, { x: 0, y: 15 });
    let state = adapter.stepProjectile(BACKYARD_LEVEL, PROJECTILE.radiusMetres)!;
    for (let i = 0; i < 10; i++) {
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      state = adapter.stepProjectile(BACKYARD_LEVEL, PROJECTILE.radiusMetres)!;
      if (state.hitJonh) break;
    }

    expect(state.hitHat).toBe(true);
    expect(state.hitJonh).toBe(true);
  });

  it('records obstacle contacts and ricochet eligibility from level fixture', () => {
    const { engine, adapter } = makeAdapter();
    const obstacleLevel = {
      ...BACKYARD_LEVEL,
      obstacles: [
        {
          id: 'test_fence',
          box: { minX: 10.0, maxX: 10.4, minY: 1.6, maxY: 3.5 },
          material: 'wood',
          ricochet: true,
        },
      ],
    };
    adapter.setupLevel(obstacleLevel);

    // Fire directly into the obstacle
    const startXPx = metresToPixels(9.5, 50);
    const startYPx = simYToWorldY(2.5, 720, 50);
    adapter.spawnProjectile(startXPx, startYPx, 7.5, launchVelocityToWorld(15, 0, 50));

    let state = adapter.stepProjectile(obstacleLevel, PROJECTILE.radiusMetres)!;
    for (let i = 0; i < 10; i++) {
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      state = adapter.stepProjectile(obstacleLevel, PROJECTILE.radiusMetres)!;
      if (state.obstacleContacts.length > 0) break;
    }

    expect(state.obstacleContacts.length).toBe(1);
    expect(state.obstacleContacts[0]).toEqual({
      id: 'test_fence',
      ricochet: true,
      material: 'wood',
    });
    expect(state.hadRicochetBeforeBody).toBe(true);
  });

  it('detects overhead pass when projectile clears Jonh without contact', () => {
    const { engine, adapter } = makeAdapter();
    adapter.setupLevel(BACKYARD_LEVEL);

    // Jonh is at x=17.6-18.4, hat top is at y=3.7m
    // Pass at y=4.5m (well clear of hat and body)
    const startXPx = metresToPixels(17.0, 50);
    const startYPx = simYToWorldY(4.5, 720, 50);
    adapter.spawnProjectile(startXPx, startYPx, 7.5, launchVelocityToWorld(20, 0, 50));

    let state = adapter.stepProjectile(BACKYARD_LEVEL, PROJECTILE.radiusMetres)!;
    for (let i = 0; i < 10; i++) {
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      state = adapter.stepProjectile(BACKYARD_LEVEL, PROJECTILE.radiusMetres)!;
      if (state.passedOverhead) break;
    }

    expect(state.passedOverhead).toBe(true);
    expect(state.hitJonh).toBe(false);
    expect(state.hitHat).toBe(false);
  });

  it('resets all contact and reaction state cleanly on removeProjectile', () => {
    const { engine, adapter } = makeAdapter();
    adapter.setupLevel(BACKYARD_LEVEL);

    // Cause a hit
    adapter.spawnProjectile(850, 600, 7.5, { x: 80, y: 0 });
    Matter.Engine.update(engine, 1000 / 120);
    adapter.stepProjectile(BACKYARD_LEVEL, 0.15);

    adapter.removeProjectile();
    // Re-spawn clear projectile
    adapter.spawnProjectile(100, 200, 7.5, { x: 5, y: 0 });
    const fresh = adapter.stepProjectile(BACKYARD_LEVEL, 0.15)!;

    expect(fresh.hitJonh).toBe(false);
    expect(fresh.hitHat).toBe(false);
    expect(fresh.passedOverhead).toBe(false);
    expect(fresh.impactSpeedMs).toBe(0);
    expect(fresh.obstacleContacts).toEqual([]);
    expect(fresh.hadRicochetBeforeBody).toBe(false);
  });

  it('integrates adapter contacts, state machine, and pure classifier for full shot lifecycle', () => {
    const { engine, adapter } = makeAdapter();
    adapter.setupLevel(BACKYARD_LEVEL);
    const machine = new ShotAttemptMachine(BACKYARD_LEVEL.bounds.maxX);
    const classifier = new ShotClassifier();

    // 1. Hat-only shot
    machine.fire(45, 50);
    const startXPx = metresToPixels(17.0, 50);
    const startYPx = simYToWorldY(3.62, 720, 50);
    adapter.spawnProjectile(startXPx, startYPx, 7.5, launchVelocityToWorld(20, 0, 50));

    let resolved = false;
    for (let step = 0; step < 120 && !resolved; step++) {
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      const state = adapter.stepProjectile(BACKYARD_LEVEL, PROJECTILE.radiusMetres)!;
      if (state.hitHat) classifier.recordContact({ role: 'jonhHat' });
      if (state.hitJonh) classifier.recordContact({ role: 'jonhBody' });
      if (state.hitGround) classifier.recordContact({ role: 'ground' });
      for (const obs of state.obstacleContacts) {
        classifier.recordContact({ role: 'obstacle', id: obs.id, ricochet: obs.ricochet });
      }

      const res = machine.step(PHYSICS.fixedStepSeconds, {
        x: state.xSim,
        y: state.ySim,
        speed: state.speedMs,
        hitBody: state.hitJonh,
        hitHat: state.hitHat,
      });

      if (res.resolved) {
        resolved = true;
        const classification = classifier.classify(true);
        expect(classification.outcome).toBe('hat_only');
        expect(classification.points).toBe(20);
        expect(classification.isHit).toBe(false);
      }
    }
    expect(resolved).toBe(true);

    // 2. Clean reset
    adapter.removeProjectile();
    machine.reset();
    classifier.reset();
    expect(classifier.hasHatHit).toBe(false);
    expect(classifier.hasBodyHit).toBe(false);
    expect(machine.state).toBe('aiming');
    expect(machine.canFire).toBe(true);
  });
});
