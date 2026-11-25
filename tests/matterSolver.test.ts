import { describe, expect, it } from 'vitest';
import Matter from '@matter-js';
import { PHYSICS } from '../src/config/tuning';
import { MAPS } from '../src/levels';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { applyMatterSolver } from '../src/physics/matterSolver';
import { matterWorldConfig } from '../src/config/matterWorld';

type Globals = Record<string, number>;

describe('Matter contact solver constants', () => {
  it('are the same in the adapter as in the game config', () => {
    const r = Matter.Resolver as unknown as Globals;
    expect(r._restingThresh).toBe(PHYSICS.matterSolver.restingThresh);
    expect(r._restingThreshTangent).toBe(PHYSICS.matterSolver.restingThreshTangent);
    expect(r._positionDampen).toBe(PHYSICS.matterSolver.positionDampen);
    expect(r._positionWarming).toBe(PHYSICS.matterSolver.positionWarming);
    expect(r._frictionNormalMultiplier).toBe(PHYSICS.matterSolver.frictionNormalMultiplier);
    // The game's Phaser world takes them from its config (main.ts uses matterWorldConfig).
    expect(matterWorldConfig(false)).toMatchObject({ ...PHYSICS.matterSolver, autoUpdate: false, enableSleeping: false });
  });

  it('matter: with Phaser\'s own values the Lunar Picnic reference shot misses', () => {
    const moon = MAPS.find(m => m.id === 'moon')!;
    const r = Matter.Resolver as unknown as Globals;
    try {
      r._restingThresh = 4; // what Phaser's MatterPhysics plugin sets unless told otherwise
      r._restingThreshTangent = 6;
      expect(runHeadlessShot(moon, 69, 28).outcome).toBe('miss');
    } finally {
      applyMatterSolver();
    }
    expect(runHeadlessShot(moon, 69, 28).outcome).toBe('ricochet_body');
  });
});
