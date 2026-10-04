import { describe, expect, it } from 'vitest';
import Matter from '@matter-js';
import { MAPS } from '../src/levels';
import { levelAtMultiplayerPosition } from '../src/levels/multiplayerPositions';
import type { LevelData, ReferenceSolution } from '../src/levels/types';
import { validateLevel } from '../src/levels/validation';
import { AIM, PHYSICS, PROJECTILE, SHOT, WORLD } from '../src/config/tuning';
import { MatterAdapter } from '../src/physics/matterAdapter';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { matterGravityY, launchVelocityToWorld, metresToPixels, powerToLaunchSpeed, simYToWorldY } from '../src/sim/units';

function hitsBody(level: LevelData, shot: ReferenceSolution): boolean {
  const ppm = WORLD.pixelsPerMetre;
  const engine = Matter.Engine.create({ gravity: { x: 0, y: matterGravityY(PHYSICS.gravity, ppm, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale } });
  const adapter = new MatterAdapter(engine.world, ppm, WORLD.designHeightPx);
  adapter.setupLevel(level);
  const angle = shot.angleDeg * Math.PI / 180;
  const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
  adapter.spawnProjectile(
    metresToPixels(level.cannonSpawn.x + offset * Math.cos(angle), ppm),
    simYToWorldY(level.cannonSpawn.y + offset * Math.sin(angle), WORLD.designHeightPx, ppm),
    PROJECTILE.radiusMetres * ppm,
    launchVelocityToWorld(powerToLaunchSpeed(shot.powerPercent, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg), shot.angleDeg, ppm),
  );
  const attempt = new ShotAttemptMachine(level.bounds.maxX, SHOT.settledSpeedMs,
    SHOT.settledSeconds, SHOT.timeoutSeconds, SHOT.boundsMarginMetres);
  attempt.fire(shot.angleDeg, shot.powerPercent);
  for (let step = 0; step < Math.ceil(SHOT.timeoutSeconds / PHYSICS.fixedStepSeconds); step++) {
    Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
    const state = adapter.stepProjectile(level, PROJECTILE.radiusMetres)!;
    if (state.hitJonh) return true;
    const result = attempt.step(PHYSICS.fixedStepSeconds, {
      x: state.xSim, y: state.ySim, speed: state.speedMs, hitBody: state.hitJonh, hitHat: state.hitHat,
    });
    if (result.resolved) return false;
  }
  return false;
}

describe('Multiplayer target positions', () => {
  for (const base of MAPS) {
    for (const position of base.multiplayerPositions!) {
      it(`${base.id}/${position.id} is supported, clear, immutable and solvable`, () => {
        const before = JSON.stringify(base);
        const level = levelAtMultiplayerPosition(base, position.id);
        expect(validateLevel(level, {
          maxSpeedMs: AIM.maxImpulseNs / PROJECTILE.massKg,
          dtSeconds: PHYSICS.fixedStepSeconds, minThicknessMetres: 0.2,
        }).valid).toBe(true);
        const body = level.jonhSpawn.bodyBox;
        for (const box of [body, level.jonhSpawn.hatBox!]) {
          expect(box.minX).toBeGreaterThanOrEqual(level.bounds.minX);
          expect(box.maxX).toBeLessThanOrEqual(level.bounds.maxX);
          expect(box.minY).toBeGreaterThanOrEqual(level.bounds.minY);
          expect(box.maxY).toBeLessThanOrEqual(level.bounds.maxY);
        }
        expect(body.maxX - body.minX).toBeCloseTo(base.jonhSpawn.bodyBox.maxX - base.jonhSpawn.bodyBox.minX);
        expect(body.minY).toBe(base.jonhSpawn.bodyBox.minY);
        const surfaces = [level.ground, ...level.obstacles.map(o => o.box)];
        expect(surfaces.some(surface => surface.maxY === body.minY && surface.minX <= body.minX && surface.maxX >= body.maxX)).toBe(true);
        for (const obstacle of level.obstacles) {
          const box = obstacle.box;
          expect(body.minX < box.maxX && body.maxX > box.minX && body.minY < box.maxY && body.maxY > box.minY).toBe(false);
        }
        for (const shot of position.referenceSolutions) {
          expect(hitsBody(level, shot), `${shot.angleDeg}/${shot.powerPercent}`).toBe(true);
          for (const other of base.multiplayerPositions!.filter(p => p.id !== position.id)) {
            expect(hitsBody(levelAtMultiplayerPosition(base, other.id), shot), `repeated aim hits ${other.id}`).toBe(false);
          }
        }
        expect(JSON.stringify(base)).toBe(before);
      });
    }
  }
  it('rejects unknown positions', () => {
    expect(() => levelAtMultiplayerPosition(MAPS[0]!, 'missing')).toThrow(RangeError);
  });
});
