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
    const { adapter } = makeAdapter();
    adapter.setupLevel(BACKYARD_LEVEL);

    // Jonh is at x=18m (900px), y=1.6-3.4m (world y=640 to 550px)
    // Spawn projectile right before Jonh, moving fast past him
    adapter.spawnProjectile(850, 600, 7.5, { x: 30, y: 0 });

    // Step across Jonh
    const state = adapter.stepProjectile(BACKYARD_LEVEL, 0.15);
    expect(state).not.toBeNull();
  });
});
