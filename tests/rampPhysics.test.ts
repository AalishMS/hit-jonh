import Matter from '@matter-js';
import { describe, expect, it } from 'vitest';
import { MATERIALS, PHYSICS, PROJECTILE, RAMP, WORLD } from '../src/config/tuning';
import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt } from '../src/levels/build';
import type { LevelData, RampData } from '../src/levels/types';
import { validateLevel } from '../src/levels/validation';
import { MatterAdapter, type ProjectileState } from '../src/physics/matterAdapter';
import { arcShape, closestOnArc } from '../src/sim/arc';
import { matterGravityY, metresToPixels, simYToWorldY, speedMsToMatterVelocity } from '../src/sim/units';

const PPM = WORLD.pixelsPerMetre;
const H = WORLD.designHeightPx;
const R = PROJECTILE.radiusMetres;
const G = PHYSICS.gravity;
const DT = PHYSICS.fixedStepSeconds;

/** A quarter-pipe on an empty lawn: riding radius 3 m, bottom 2 cm above the grass, lip at 60°. */
const KICKER: RampData = { id: 'kicker', centre: { x: 12, y: 4.62 }, radius: 3, thickness: 0.3, startDeg: -90, endDeg: -30, material: 'plywood', ricochet: false };

function rampLevel(ramp: RampData = KICKER, extra: Partial<LevelData> = {}): LevelData {
  return {
    id: 'ramp-test', name: 'Ramp test', difficulty: 1, bounds: GARDEN_BOUNDS, ground: GARDEN_GROUND, cannonSpawn: GARDEN_CANNON,
    jonhSpawn: jonhAt(24, 1.6), obstacles: [], ramps: [ramp], referenceSolutions: [{ angleDeg: 45, powerPercent: 50 }], multiplayerPositions: [],
    ...extra,
  };
}

function world(level: LevelData) {
  const engine = Matter.Engine.create({ gravity: { x: 0, y: matterGravityY(G, PPM, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale } });
  const adapter = new MatterAdapter(engine.world, PPM, H);
  adapter.setupLevel(level);
  return { engine, adapter };
}

/** Spawns the ball at `p` (metres) with velocity `v` (m/s, +y up) and steps until `until` says stop. */
function run(level: LevelData, p: { x: number; y: number }, v: { x: number; y: number }, maxSteps: number,
  until: (s: ProjectileState, step: number) => boolean = () => false): ProjectileState[] {
  const { engine, adapter } = world(level);
  adapter.spawnProjectile(metresToPixels(p.x, PPM), simYToWorldY(p.y, H, PPM), R * PPM,
    { x: speedMsToMatterVelocity(v.x, PPM), y: -speedMsToMatterVelocity(v.y, PPM) });
  const states: ProjectileState[] = [];
  for (let i = 1; i <= maxSteps; i++) {
    Matter.Engine.update(engine, DT * 1000);
    const s = adapter.stepProjectile(level, R)!;
    states.push(s);
    if (until(s, i)) break;
  }
  return states;
}

/** Puts the ball on the riding face at `deg` about the ramp centre, rolling at `speed` (+ counter-clockwise). */
function onRamp(ramp: RampData, deg: number, speed: number) {
  const a = deg * Math.PI / 180;
  const rho = ramp.radius - R - 1e-4;
  return {
    p: { x: ramp.centre.x + Math.cos(a) * rho, y: ramp.centre.y + Math.sin(a) * rho },
    v: { x: -Math.sin(a) * speed, y: Math.cos(a) * speed },
  };
}

describe('skate ramp in the Matter adapter', () => {
  it('adds the ramp to Matter as static sensor pieces along the arc, and removes them with the level', () => {
    const { engine, adapter } = world(rampLevel());
    const pieces = engine.world.bodies.filter((b: { label: string }) => b.label === 'ramp');
    expect(pieces.length).toBe(Math.ceil(60 / RAMP.matterSegmentDeg));
    for (const piece of pieces) {
      expect(piece.isStatic).toBe(true);
      expect(piece.isSensor).toBe(true);
      // Every vertex lies on the riding face or the back of the arc.
      for (const v of piece.vertices) {
        const d = Math.hypot(v.x / PPM - KICKER.centre.x, (H - v.y) / PPM - KICKER.centre.y);
        expect(Math.min(Math.abs(d - 3), Math.abs(d - 3.3))).toBeLessThan(1e-6);
      }
    }
    adapter.clear();
    expect(engine.world.bodies.filter((b: { label: string }) => b.label === 'ramp')).toEqual([]);
  });

  it('a ball rolling up it stays on the curve (no hops or snags) and leaves the lip at the speed drag and gravity allow', () => {
    const start = onRamp(KICKER, -90, 10);
    const states = run(rampLevel(), start.p, start.v, 400, s => s.events.some(e => e.kind === 'rampLaunch'));
    const launch = states.at(-1)!;
    expect(launch.events.find(e => e.kind === 'rampLaunch')).toBeDefined();
    expect(launch.rampLaunches).toEqual(['kicker']);
    const shape = arcShape(KICKER);
    let prevSpeed = 10;
    for (const s of states.slice(0, -2)) {
      expect(s.rampRolling).toBe('kicker');
      // Exactly on the riding circle (just inside it), every step.
      expect(Math.abs(Math.hypot(s.xSim - 12, s.ySim - 4.62) - (3 - R))).toBeLessThan(2e-4);
      expect(closestOnArc(shape, { x: s.xSim, y: s.ySim }).distance).toBeGreaterThanOrEqual(R);
      // Speed only ever falls, and by no more than gravity plus drag can take in one step.
      expect(s.speedMs).toBeLessThanOrEqual(prevSpeed + 1e-9);
      expect(prevSpeed - s.speedMs).toBeLessThan((G + RAMP.rollingResistance * (G + 100 / 2.85)) * DT + 1e-6);
      prevSpeed = s.speedMs;
    }
    // Energy: frictionless it would leave at √(v² − 2gΔh); the plywood's drag takes a few per cent more.
    const rise = (3 - R) * (1 - Math.cos(Math.PI / 3));
    const frictionless = Math.sqrt(100 - 2 * G * rise);
    const lipSpeed = (launch.events.find(e => e.kind === 'rampLaunch') as { speedMs: number }).speedMs;
    expect(lipSpeed).toBeLessThan(frictionless);
    expect(lipSpeed).toBeGreaterThan(frictionless * 0.9);
    // It leaves along the lip's tangent, 60° above the horizon.
    expect(Math.atan2(launch.vySim, launch.vxSim) * 180 / Math.PI).toBeCloseTo(60, 0);
  });

  it('matches the plywood drag exactly: with no drag the lip speed is the energy speed', () => {
    const level = rampLevel({ ...KICKER, material: 'concrete' }); // concrete sets no rolling drag …
    const start = onRamp(KICKER, -90, 10);
    const states = run(level, start.p, start.v, 400, s => s.events.some(e => e.kind === 'rampLaunch'));
    const lip = states.at(-1)!.events.find(e => e.kind === 'rampLaunch') as { speedMs: number };
    // … so it gets RAMP.rollingResistance; plywood names the same value explicitly.
    expect(MATERIALS.plywood.rollingResistance).toBe(RAMP.rollingResistance);
    const rise = (3 - R) * (1 - Math.cos(Math.PI / 3));
    expect(lip.speedMs).toBeLessThan(Math.sqrt(100 - 2 * G * rise));
  });

  it('too slow for the lip, the ball rolls back down and off onto the lawn, and the shot settles', () => {
    const start = onRamp(KICKER, -90, 4);
    const states = run(rampLevel(), start.p, start.v, 1800);
    const rolled = states.filter(s => s.rampRolling !== null);
    expect(rolled.length).toBeGreaterThan(20);
    expect(states.some(s => s.rampLaunches.length > 0)).toBe(false);
    const last = states.at(-1)!;
    expect(last.xSim).toBeLessThan(12);
    expect(last.speedMs).toBeLessThan(0.1);
  });

  it('a ball rolling through the bottom, just above the lawn, keeps its speed (no flat-top rolling drag)', () => {
    // Across the bottom of a bowl 2 cm above the grass, fast enough to climb out of it.
    const bowl: RampData = { ...KICKER, startDeg: -150, endDeg: -30 };
    const start = onRamp(bowl, -100, 7);
    const states = run(rampLevel(bowl), start.p, start.v, 40);
    const bottom = states.find(s => Math.abs(s.xSim - 12) < 0.05)!;
    // Gravity speeds it up on the way down; the grass's 0.975-per-step damping would have cut it to a third.
    expect(bottom.speedMs).toBeGreaterThan(7);
    expect(states.every(s => s.rampRolling === 'kicker' && !s.hitGround)).toBe(true);
  });

  it('a ball landing on it bounces with the plywood restitution off the local surface normal', () => {
    // Dropped straight down onto the curve at -60°, where the face tilts 30°.
    const a = -60 * Math.PI / 180;
    const contact = { x: 12 + Math.cos(a) * (3 - R), y: 4.62 + Math.sin(a) * (3 - R) };
    const states = run(rampLevel(), { x: contact.x, y: contact.y + 1.5 }, { x: 0, y: 0 }, 200, s => s.obstacleContacts.length > 0);
    const hit = states.at(-1)!;
    const before = states.at(-2)!;
    const n = { x: -Math.cos(a), y: -Math.sin(a) }; // out of the face, towards the centre
    const vIn = before.vySim * n.y + before.vxSim * n.x;
    const vOut = hit.vySim * n.y + hit.vxSim * n.x;
    const e = Math.max(MATERIALS.plywood.restitution, MATERIALS.cannonball.restitution);
    expect(vIn).toBeLessThan(-PHYSICS.bounceMinNormalSpeedMs);
    expect(vOut / -vIn).toBeCloseTo(e, 1);
    // The tangential part is kept (a frictionless bounce, like every surface's).
    const t = { x: -n.y, y: n.x };
    expect(hit.vxSim * t.x + hit.vySim * t.y).toBeCloseTo(before.vxSim * t.x + before.vySim * t.y - G * DT * t.y, 1);
    expect(hit.obstacleContacts).toEqual([{ id: 'kicker', ricochet: false, material: 'plywood' }]);
  });

  it('never lets a ball at the top speed pass into the ramp, from any direction', () => {
    const level = rampLevel(KICKER, { launchSpeedScale: 1 });
    const shape = arcShape(KICKER);
    const speed = 20;
    let fired = 0;
    for (let deg = 0; deg < 360; deg += 6) {
      for (const aim of [-85, -70, -55, -40]) {
        // Aim through a point on the riding face or the back of the arc, from 2.5 m away.
        const a = aim * Math.PI / 180;
        const target = { x: 12 + Math.cos(a) * 3.15, y: 4.62 + Math.sin(a) * 3.15 };
        const dir = { x: Math.cos(deg * Math.PI / 180), y: Math.sin(deg * Math.PI / 180) };
        const p = { x: target.x - dir.x * 2.5, y: target.y - dir.y * 2.5 };
        if (p.y < 1.6 + R + 0.01 || closestOnArc(shape, p).distance <= R + 0.01) continue;
        fired++;
        const states = run(level, p, { x: dir.x * speed, y: dir.y * speed }, 60);
        for (const s of states) {
          expect(closestOnArc(shape, { x: s.xSim, y: s.ySim }).signedDistance, `${deg}° at ${aim}°`).toBeGreaterThan(R - 1e-3);
        }
      }
    }
    expect(fired).toBeGreaterThan(100);
  });

  it('a ball resting on the lawn against the ramp\'s end is pushed back out, never into it', () => {
    // Rolling slowly along the grass into the outer foot of a bowl whose end hangs just above the lawn.
    const bowl: RampData = { ...KICKER, startDeg: -115, endDeg: 0 };
    const shape = arcShape(bowl);
    const states = run(rampLevel(bowl), { x: 8.6, y: 1.6 + R + 1e-4 }, { x: 3, y: 0 }, 900);
    for (const s of states) expect(closestOnArc(shape, { x: s.xSim, y: s.ySim }).signedDistance).toBeGreaterThan(R - 1e-3);
  });

  it('is deterministic, and every new shot starts with no ramp state', () => {
    const start = onRamp(KICKER, -80, 9);
    const a = run(rampLevel(), start.p, start.v, 300);
    const b = run(rampLevel(), start.p, start.v, 300);
    expect(b).toEqual(a);
    const { engine, adapter } = world(rampLevel());
    adapter.spawnProjectile(metresToPixels(start.p.x, PPM), simYToWorldY(start.p.y, H, PPM), R * PPM,
      { x: speedMsToMatterVelocity(start.v.x, PPM), y: -speedMsToMatterVelocity(start.v.y, PPM) });
    for (let i = 0; i < 200; i++) { Matter.Engine.update(engine, DT * 1000); adapter.stepProjectile(rampLevel(), R); }
    adapter.spawnProjectile(100, 100, R * PPM, { x: 1, y: 0 });
    Matter.Engine.update(engine, DT * 1000);
    const fresh = adapter.stepProjectile(rampLevel(), R)!;
    expect(fresh.rampLaunches).toEqual([]);
    expect(fresh.obstacleContacts).toEqual([]);
  });
});

describe('ramp validation (SPEC §9.2)', () => {
  const config = { maxSpeedMs: 20, dtSeconds: DT, minThicknessMetres: 0.2 };
  const errorsFor = (ramp: Partial<RampData>, extra: Partial<LevelData> = {}) =>
    validateLevel(rampLevel({ ...KICKER, ...ramp }, extra), config).errors.join(' | ');

  it('accepts a sound quarter-pipe', () => {
    expect(validateLevel(rampLevel(), config).errors).toEqual([]);
  });

  it('rejects a ramp thinner than the thickness rule, too tight, the wrong way round, of unknown material, outside the world or on Jonh', () => {
    expect(errorsFor({ thickness: 0.15 })).toMatch(/thickness/);
    expect(errorsFor({ radius: 0.6 })).toMatch(/radius/);
    expect(errorsFor({ startDeg: -30, endDeg: -90 })).toMatch(/counter-clockwise/);
    expect(errorsFor({ startDeg: -200, endDeg: 10 })).toMatch(/counter-clockwise/);
    expect(errorsFor({ material: 'cheese' })).toMatch(/unknown material/);
    expect(errorsFor({ centre: { x: 24, y: 4.62 } })).toMatch(/outside level bounds/);
    expect(errorsFor({}, { jonhSpawn: jonhAt(14.4, 1.6) })).toMatch(/overlaps Jonh/);
    expect(errorsFor({ id: 'shed' }, { obstacles: [{ id: 'shed', box: { minX: 2, maxX: 3, minY: 1.6, maxY: 3 }, material: 'wood', ricochet: false }] })).toMatch(/Duplicate (ramp|obstacle) id/);
  });
});
