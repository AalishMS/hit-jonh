import { describe, expect, it } from 'vitest';
import { AIM, PHYSICS, PROJECTILE } from '../src/config/tuning';
import { levelPhysics } from '../src/levels/levelPhysics';
import { validateLevel } from '../src/levels/validation';
import { BACKYARD_LEVEL } from '../src/levels';

describe('levelPhysics', () => {
  it('uses the global tuning when a map does not override it', () => {
    const p = levelPhysics({});
    expect(p.gravity).toBe(PHYSICS.gravity);
    expect(p.minSpeedMs).toBeCloseTo(AIM.minImpulseNs / PROJECTILE.massKg);
    expect(p.maxSpeedMs).toBeCloseTo(AIM.maxImpulseNs / PROJECTILE.massKg);
    expect(p.launchImpulse(50)).toBeCloseTo((AIM.minImpulseNs + AIM.maxImpulseNs) / 2);
  });

  it('applies per-map gravity and scales the whole launch-speed range', () => {
    const p = levelPhysics({ gravityMs2: 2, launchSpeedScale: 1.5 });
    expect(p.gravity).toBe(2);
    expect(p.minSpeedMs).toBeCloseTo(1.5 * AIM.minImpulseNs / PROJECTILE.massKg);
    expect(p.maxSpeedMs).toBeCloseTo(1.5 * AIM.maxImpulseNs / PROJECTILE.massKg);
    expect(p.launchSpeed(50)).toBeCloseTo(1.5 * levelPhysics({}).launchSpeed(50));
  });

  it('demands thicker colliders on maps with a faster cannon', () => {
    const config = { maxSpeedMs: 20, dtSeconds: 1 / 120, minThicknessMetres: 0.2 };
    // 0.3 m is fine at 20 m/s (0.17 m/step) but too thin at 3× speed (0.5 m/step).
    expect(validateLevel(BACKYARD_LEVEL, config).valid).toBe(true);
    expect(validateLevel({ ...BACKYARD_LEVEL, obstacles: [{ id: 'thin', box: { minX: 10, maxX: 10.3, minY: 1.6, maxY: 4 }, material: 'wood', ricochet: false }], launchSpeedScale: 3 }, config).valid).toBe(false);
  });
});
