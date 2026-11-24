import { describe, expect, it } from 'vitest';
import Matter, { type Body, type Engine } from '@matter-js';
import { PHYSICS, PROJECTILE, WORLD } from '../src/config/tuning';
import { jonhAt } from '../src/levels/build';
import type { LevelData, PortalData } from '../src/levels/types';
import { validateLevel } from '../src/levels/validation';
import { MatterAdapter, type ProjectileState } from '../src/physics/matterAdapter';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { matterGravityY, metresToPixels, simYToWorldY, speedMsToMatterVelocity } from '../src/sim/units';
import { sweepCircleVsDisc } from '../src/sim/swept';

const PPM = WORLD.pixelsPerMetre;
const H = WORLD.designHeightPx;
const R = PROJECTILE.radiusMetres;

const base: LevelData = {
  id: 'lab',
  name: 'Lab',
  difficulty: 1,
  bounds: { minX: 0, maxX: 25.6, minY: 0, maxY: 14.4 },
  ground: { minX: 0, maxX: 25.6, minY: 0, maxY: 1.6, material: 'grass' },
  cannonSpawn: { x: 2.5, y: 2.2 },
  jonhSpawn: jonhAt(18, 1.6),
  obstacles: [],
  referenceSolutions: [{ angleDeg: 45, powerPercent: 50 }],
  multiplayerPositions: [],
};

/** A glass pane (flagged ricochet, to prove smashing never counts as one) between the cannon and Jonh. */
const GLASS_LAB: LevelData = {
  ...base,
  obstacles: [{
    id: 'pane', box: { minX: 12, maxX: 12.25, minY: 1.6, maxY: 6 }, material: 'glass', ricochet: true,
    breakable: { minImpactSpeedMs: 6, speedKept: 0.5 },
  }],
};

const hoop = (exit: PortalData['exit']): LevelData => ({
  ...base,
  portals: [{ id: 'hoop', entry: { x: 10, y: 4, radius: 0.5 }, exit }],
});

function world(level: LevelData) {
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: matterGravityY(PHYSICS.gravity, PPM, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale },
  });
  const adapter = new MatterAdapter(engine.world, PPM, H);
  adapter.setupLevel(level);
  return { engine, adapter };
}

/** Throws the ball from (x, y) m at (vx, vy) m/s and records every step until `steps` or Jonh is hit. */
function throwBall(w: ReturnType<typeof world>, level: LevelData, x: number, y: number, vx: number, vy: number, steps = 240) {
  w.adapter.spawnProjectile(metresToPixels(x, PPM), simYToWorldY(y, H, PPM), R * PPM,
    { x: speedMsToMatterVelocity(vx, PPM), y: -speedMsToMatterVelocity(vy, PPM) });
  const states: ProjectileState[] = [];
  for (let i = 0; i < steps; i++) {
    Matter.Engine.update(w.engine, PHYSICS.fixedStepSeconds * 1000);
    const state = w.adapter.stepProjectile(level, R)!;
    states.push(state);
    if (state.hitJonh) break;
  }
  return states;
}

const paneBody = (engine: Engine) =>
  engine.world.bodies.find((b: Body) => b.label === 'obstacle')!;

describe('breakable props', () => {
  it('a hard hit smashes through: no reflection, kept share of speed, not a contact or ricochet', () => {
    const w = world(GLASS_LAB);
    const states = throwBall(w, GLASS_LAB, 10, 4.5, 15, 0, 80);
    const i = states.findIndex(s => s.events.some(e => e.kind === 'break'));
    expect(i).toBeGreaterThan(0);
    const before = states[i - 1]!;
    const at = states[i]!;
    expect(at.events).toEqual([expect.objectContaining({ kind: 'break', id: 'pane' })]);
    expect(at.brokenObstacleIds).toEqual(['pane']);
    expect(at.obstacleContacts).toEqual([]);
    expect(at.hadRicochetBeforeBody).toBe(false);
    // Carries on forward at half speed from the pane face.
    expect(at.vxSim).toBeGreaterThan(0);
    expect(at.vxSim).toBeCloseTo(before.vxSim * 0.5, 1);
    expect(at.xSim).toBeCloseTo(12 - R, 3);
    // And keeps going through where the pane was: Matter no longer collides with it.
    const later = states[i + 20]!;
    expect(later.xSim).toBeGreaterThan(12.5);
    expect(later.events).toEqual([]);
    expect(later.brokenObstacleIds).toEqual(['pane']);
    expect(paneBody(w.engine).collisionFilter.mask).toBe(0);
  });

  it('a soft hit bounces off like any solid obstacle (contact and ricochet still count)', () => {
    const w = world(GLASS_LAB);
    const states = throwBall(w, GLASS_LAB, 11, 4.5, 4, 0, 60);
    const last = states[states.length - 1]!;
    expect(last.brokenObstacleIds).toEqual([]);
    expect(states.every(s => s.events.length === 0)).toBe(true);
    expect(last.obstacleContacts).toEqual([{ id: 'pane', ricochet: true, material: 'glass' }]);
    expect(last.hadRicochetBeforeBody).toBe(true);
    expect(last.vxSim).toBeLessThan(0);
  });

  it('the ball can smash through and still hit Jonh behind the pane', () => {
    const w = world(GLASS_LAB);
    const states = throwBall(w, GLASS_LAB, 10, 4.5, 18, 0);
    const last = states[states.length - 1]!;
    expect(last.hitJonh).toBe(true);
    expect(last.brokenObstacleIds).toEqual(['pane']);
    expect(last.hadRicochetBeforeBody).toBe(false);
  });

  it('every new shot starts with the prop whole, and the same shot plays out identically', () => {
    const w = world(GLASS_LAB);
    const mask = paneBody(w.engine).collisionFilter.mask;
    const first = throwBall(w, GLASS_LAB, 10, 4.5, 18, 0);
    expect(paneBody(w.engine).collisionFilter.mask).toBe(0);
    const second = throwBall(w, GLASS_LAB, 10, 4.5, 18, 0);
    expect(second).toEqual(first);
    w.adapter.removeProjectile();
    expect(paneBody(w.engine).collisionFilter.mask).toBe(mask);
    // A fresh world gives the same result too.
    expect(throwBall(world(GLASS_LAB), GLASS_LAB, 10, 4.5, 18, 0)).toEqual(first);
  });

  it('never mutates level data', () => {
    const before = JSON.stringify(GLASS_LAB);
    const w = world(GLASS_LAB);
    throwBall(w, GLASS_LAB, 10, 4.5, 18, 0);
    expect(JSON.stringify(GLASS_LAB)).toBe(before);
  });
});

describe('portals', () => {
  it('the ball touching the entry reappears at the exit with its speed and the exit heading', () => {
    const level = hoop({ x: 15, y: 3, angleDeg: 0 });
    const w = world(level);
    const states = throwBall(w, level, 8, 4, 0, 10);
    // Thrown straight up at x = 8: never reaches the hoop at x = 10.
    expect(states.every(s => s.portalsUsed.length === 0)).toBe(true);

    const w2 = world(level);
    const shot = throwBall(w2, level, 8, 4, 10, 0);
    const i = shot.findIndex(s => s.events.length > 0);
    const at = shot[i]!;
    expect(at.events).toEqual([expect.objectContaining({ kind: 'portal', id: 'hoop', exitXPx: 15 * PPM })]);
    expect(at.xSim).toBeCloseTo(15, 6);
    expect(at.ySim).toBeCloseTo(3, 6);
    expect(at.speedMs).toBeCloseTo(shot[i - 1]!.speedMs, 1);
    expect(Math.atan2(at.vySim, at.vxSim)).toBeCloseTo(0, 6);
    expect(at.portalsUsed).toEqual(['hoop']);
    expect(at.obstacleContacts).toEqual([]);
    // Swept detection carries on from the exit: straight into Jonh.
    const last = shot[shot.length - 1]!;
    expect(last.hitJonh).toBe(true);
    expect(last.hadRicochetBeforeBody).toBe(false);
  });

  it('turns the velocity to the exit heading (pointing up and back)', () => {
    const level = hoop({ x: 16, y: 6, angleDeg: 135 });
    const w = world(level);
    const shot = throwBall(w, level, 8, 4, 10, 0, 60);
    const at = shot.find(s => s.events.length > 0)!;
    expect(Math.atan2(at.vySim, at.vxSim)).toBeCloseTo(135 * Math.PI / 180, 6);
    expect(at.vxSim).toBeLessThan(0);
  });

  it('works once per shot: a ball sent back through the entry passes straight through', () => {
    const level = hoop({ x: 12, y: 4, angleDeg: 180 });
    expect(validateLevel(level, { maxSpeedMs: 20, dtSeconds: PHYSICS.fixedStepSeconds, minThicknessMetres: 0.2 }).errors).toEqual([]);
    const w = world(level);
    const shot = throwBall(w, level, 8, 4, 12, 0, 90);
    expect(shot.filter(s => s.events.length > 0)).toHaveLength(1);
    expect(shot[shot.length - 1]!.portalsUsed).toEqual(['hoop']);
    // Back through the (spent) entry and out the other side.
    expect(shot.some(s => s.xSim < 9)).toBe(true);
    // The next shot can use it again.
    const again = throwBall(w, level, 8, 4, 12, 0, 90);
    expect(again).toEqual(shot);
  });

  it('never drops the ball inside a collider: a blocked exit is skipped', () => {
    const level: LevelData = {
      ...hoop({ x: 15, y: 3, angleDeg: 0 }),
      obstacles: [{ id: 'crate', box: { minX: 14.5, maxX: 15.5, minY: 1.6, maxY: 3.5 }, material: 'wood', ricochet: false }],
    };
    expect(validateLevel(level, { maxSpeedMs: 20, dtSeconds: PHYSICS.fixedStepSeconds, minThicknessMetres: 0.2 }).errors)
      .toContain('Portal "hoop" exit overlaps obstacle "crate"');
    const w = world(level);
    const shot = throwBall(w, level, 8, 4, 10, 0, 60);
    expect(shot.every(s => s.portalsUsed.length === 0)).toBe(true);
  });

  it('is deterministic and leaves level data alone', () => {
    const level = hoop({ x: 15, y: 3, angleDeg: 10 });
    const before = JSON.stringify(level);
    expect(throwBall(world(level), level, 8, 4, 10, 1)).toEqual(throwBall(world(level), level, 8, 4, 10, 1));
    expect(JSON.stringify(level)).toBe(before);
  });
});

describe('mechanic validation', () => {
  const cfg = { maxSpeedMs: 20, dtSeconds: PHYSICS.fixedStepSeconds, minThicknessMetres: 0.2 };

  it('rejects unsafe portals and out-of-range breakables', () => {
    const errors = (level: LevelData) => validateLevel(level, cfg).errors;
    expect(errors(hoop({ x: 10.3, y: 4, angleDeg: 0 }))).toContain('Portal "hoop" exit is inside the entry of "hoop"');
    expect(errors(hoop({ x: 18, y: 2.5, angleDeg: 0 }))).toContain('Portal "hoop" exit overlaps Jonh');
    expect(errors(hoop({ x: 30, y: 4, angleDeg: 0 }))).toContain('Portal "hoop" exit is outside level bounds');
    expect(errors({ ...base, portals: [{ id: 'near', entry: { x: 3.5, y: 3, radius: 0.5 }, exit: { x: 15, y: 4, angleDeg: 0 } }] }))
      .toContain('Portal "near" entry is within reach of the cannon muzzle');
    const pane = GLASS_LAB.obstacles[0]!;
    expect(errors({ ...GLASS_LAB, obstacles: [{ ...pane, breakable: { minImpactSpeedMs: 6, speedKept: 1.5 } }] }))
      .toContain('Breakable "pane" speedKept must be in (0, 1]');
    expect(errors({ ...GLASS_LAB, obstacles: [pane, pane] })).toContain('Duplicate obstacle id "pane"');
    expect(errors(GLASS_LAB)).toEqual([]);
    expect(errors(hoop({ x: 15, y: 3, angleDeg: 0 }))).toEqual([]);
  });
});

describe('swept circle vs disc', () => {
  it('finds the first touch along the path', () => {
    expect(sweepCircleVsDisc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5, { x: 5, y: 0 }, 1)).toBeCloseTo(0.35, 9);
    expect(sweepCircleVsDisc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5, { x: 5, y: 1.4 }, 1)).not.toBeNull();
    expect(sweepCircleVsDisc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5, { x: 5, y: 1.6 }, 1)).toBeNull();
    expect(sweepCircleVsDisc({ x: 0, y: 0 }, { x: 2, y: 0 }, 0.5, { x: 5, y: 0 }, 1)).toBeNull();
    expect(sweepCircleVsDisc({ x: 4.9, y: 0 }, { x: 10, y: 0 }, 0.5, { x: 5, y: 0 }, 1)).toBe(0);
  });
});

describe('headless runner', () => {
  it('reports smashed props and portals used before the shot resolved', () => {
    const r = runHeadlessShot(GLASS_LAB, 20, 90);
    expect(Array.isArray(r.brokenObstacleIds)).toBe(true);
    expect(Array.isArray(r.portalsUsed)).toBe(true);
  });
});
