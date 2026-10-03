import { describe, expect, it } from 'vitest';
import Matter from '@matter-js';
import { BACKYARD_LEVEL } from '../src/levels/backyard';
import { MatterAdapter } from '../src/physics/matterAdapter';

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
});
