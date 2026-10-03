import { describe, expect, it } from 'vitest';
import { BACKYARD_LEVEL } from '../src/levels/backyard';
import { validateLevel } from '../src/levels/validation';
import { sweepCircleVsBox } from '../src/sim/swept';
import { analyticPosition } from '../src/sim/ballistics';
import { powerToLaunchSpeed } from '../src/sim/units';
import { AIM, PHYSICS, PROJECTILE } from '../src/config/tuning';

describe('Level data validation', () => {
  it('validates Backyard level passes all structural and thickness rules', () => {
    const result = validateLevel(BACKYARD_LEVEL, {
      maxSpeedMs: AIM.maxImpulseNs / PROJECTILE.massKg,
      dtSeconds: PHYSICS.fixedStepSeconds,
      minThicknessMetres: 0.2,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('proves reference solution hits Jonh in ballistic flight', () => {
    const sol = BACKYARD_LEVEL.referenceSolutions[0]!;
    const speed = powerToLaunchSpeed(
      sol.powerPercent,
      AIM.minImpulseNs,
      AIM.maxImpulseNs,
      PROJECTILE.massKg,
    );
    const rad = (sol.angleDeg * Math.PI) / 180;
    const barrelLength = 1.2;
    const x0 = BACKYARD_LEVEL.cannonSpawn.x + barrelLength * Math.cos(rad);
    const y0 = BACKYARD_LEVEL.cannonSpawn.y + barrelLength * Math.sin(rad);
    const vx = speed * Math.cos(rad);
    const vy = speed * Math.sin(rad);

    let hitJonh = false;
    const dt = 1 / 120;
    let prev = { x: x0, y: y0 };

    for (let step = 0; step < 600; step++) {
      const t = (step + 1) * dt;
      const curr = analyticPosition(t, x0, y0, vx, vy, PHYSICS.gravity);
      const hit = sweepCircleVsBox(prev, curr, PROJECTILE.radiusMetres, BACKYARD_LEVEL.jonhSpawn.bodyBox);
      if (hit) {
        hitJonh = true;
        break;
      }
      prev = curr;
    }

    expect(hitJonh).toBe(true);
  });
});
