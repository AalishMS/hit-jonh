import { describe, expect, it } from 'vitest';
import Matter from '@matter-js';
import { MAPS } from '../src/levels';
import { validateLevel } from '../src/levels/validation';
import { launchVelocityToWorld, matterGravityY, metresToPixels, simYToWorldY } from '../src/sim/units';
import { levelPhysics } from '../src/levels/levelPhysics';
import { AIM, PHYSICS, PROJECTILE } from '../src/config/tuning';
import { MatterAdapter } from '../src/physics/matterAdapter';

describe('Level data validation', () => {
  for (const level of MAPS) {
    describe(`Level: ${level.name}`, () => {
      it('passes all structural and thickness rules', () => {
        const result = validateLevel(level, {
          maxSpeedMs: AIM.maxImpulseNs / PROJECTILE.massKg,
          dtSeconds: PHYSICS.fixedStepSeconds,
          minThicknessMetres: 0.2,
        });
        expect(result.valid, result.errors.join(', ')).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('has a real obstacle that blocks a low maximum-power shot', () => {
        expect(level.obstacles.length).toBeGreaterThan(0);
        const engine = Matter.Engine.create({ gravity: { x: 0, y: matterGravityY(levelPhysics(level).gravity, 50, 0.001), scale: 0.001 } });
        const adapter = new MatterAdapter(engine.world, 50, 720);
        adapter.setupLevel(level);
        const angle = 10;
        const rad = angle * Math.PI / 180;
        const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
        adapter.spawnProjectile(
          metresToPixels(level.cannonSpawn.x + offset * Math.cos(rad), 50),
          simYToWorldY(level.cannonSpawn.y + offset * Math.sin(rad), 720, 50),
          PROJECTILE.radiusMetres * 50,
          launchVelocityToWorld(levelPhysics(level).maxSpeedMs, angle, 50),
        );
        let blocked = false;
        for (let step = 0; step < 720; step++) {
          Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
          const state = adapter.stepProjectile(level, PROJECTILE.radiusMetres)!;
          expect(state.hitJonh).toBe(false);
          if (state.obstacleContacts.length > 0) { blocked = true; break; }
        }
        expect(blocked).toBe(true);
      });

      it('proves reference solution hits Jonh in actual Matter adapter flight', () => {
        for (const sol of level.referenceSolutions) {
          const engine = Matter.Engine.create({ gravity: { x: 0, y: matterGravityY(levelPhysics(level).gravity, 50, 0.001), scale: 0.001 } });
          const adapter = new MatterAdapter(engine.world, 50, 720);
          adapter.setupLevel(level);

          const speed = levelPhysics(level).launchSpeed(sol.powerPercent);
          const rad = (sol.angleDeg * Math.PI) / 180;
          const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
          const startX = level.cannonSpawn.x + offset * Math.cos(rad);
          const startY = level.cannonSpawn.y + offset * Math.sin(rad);
          const startXPx = metresToPixels(startX, 50);
          const startYPx = simYToWorldY(startY, 720, 50);

          adapter.spawnProjectile(
            startXPx,
            startYPx,
            PROJECTILE.radiusMetres * 50,
            launchVelocityToWorld(speed, sol.angleDeg, 50)
          );

          let hitJonh = false;
          for (let step = 0; step < 1800; step++) {
            Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
            const state = adapter.stepProjectile(level, PROJECTILE.radiusMetres);
            if (state && state.hitJonh) {
              hitJonh = true;
              break;
            }
          }

          expect(hitJonh, `reference ${sol.angleDeg}°/${sol.powerPercent}% failed to hit Jonh`).toBe(true);
        }
      });
    });
  }
});
