import { describe, expect, it } from 'vitest';
import Matter, { type Body } from '@matter-js';
import { AIM, MAGNET, PHYSICS, PROJECTILE, SHOT, WORLD } from '../src/config/tuning';
import { MAPS } from '../src/levels';
import { jonhAt } from '../src/levels/build';
import { levelPhysics } from '../src/levels/levelPhysics';
import type { LevelData, MagnetData } from '../src/levels/types';
import { validateLevel } from '../src/levels/validation';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { MatterAdapter, type ProjectileState } from '../src/physics/matterAdapter';
import { recordShot } from '../src/physics/shotRecorder';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { analyticPosition, previewDotsPx } from '../src/sim/ballistics';
import { FixedStepper } from '../src/sim/fixedStep';
import {
  magnetAcceleration, magnetFalloff, magnetMaxSpeed, magnetProfile, magnetProximity, magnetStrength, type MagnetField,
} from '../src/sim/magnet';
import { launchVelocityToWorld, matterGravityY, metresToPixels, simYToWorldY } from '../src/sim/units';

const PPM = WORLD.pixelsPerMetre;
const H = WORLD.designHeightPx;
const R = PROJECTILE.radiusMetres;
const DT = PHYSICS.fixedStepSeconds;
const G = PHYSICS.gravity;
const MUZZLE_OFFSET = AIM.barrelLengthMetres + R + AIM.muzzleGapMetres;

const FIELD: MagnetField = { x: 0, y: 0, radius: 6, accelerationMs2: 8 };
const PROFILE = magnetProfile(FIELD.radius);

/** An open yard (nothing to hit but the ground) with a magnet hanging over it, its housing a 1 × 0.5 m box. */
function yard(magnet?: Partial<MagnetData>): LevelData {
  const m: MagnetData = { x: 20, y: 9, radius: 6, accelerationMs2: 8, housingId: 'housing', ...magnet };
  return {
    id: 'yard',
    name: 'Yard',
    difficulty: 1,
    bounds: { minX: 0, maxX: 60, minY: 0, maxY: 40 },
    ground: { minX: 0, maxX: 60, minY: 0, maxY: 1.6, material: 'grass' },
    cannonSpawn: { x: 2.5, y: 2.2 },
    jonhSpawn: jonhAt(50, 1.6),
    obstacles: [{ id: 'housing', box: { minX: m.x - 0.5, maxX: m.x + 0.5, minY: m.y - 0.25, maxY: m.y + 0.25 }, material: 'magnet', ricochet: false }],
    referenceSolutions: [{ angleDeg: 45, powerPercent: 50 }],
    multiplayerPositions: [],
    magnet: m,
  };
}
/** The same level with the field switched off (the housing stays, as a plain dead obstacle). */
const fieldOff = (level: LevelData): LevelData => ({ ...level, magnet: undefined } as unknown as LevelData);

function world(level: LevelData) {
  const physics = levelPhysics(level);
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: matterGravityY(physics.gravity, PPM, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale },
  });
  const adapter = new MatterAdapter(engine.world, PPM, H);
  adapter.setupLevel(level);
  return { engine, adapter, physics };
}

function muzzle(level: LevelData, angleDeg: number) {
  const rad = angleDeg * Math.PI / 180;
  return { x: level.cannonSpawn.x + MUZZLE_OFFSET * Math.cos(rad), y: level.cannonSpawn.y + MUZZLE_OFFSET * Math.sin(rad) };
}

/** Fires from the muzzle and returns the adapter and the ball's state after every fixed step. */
function fly(level: LevelData, angleDeg: number, powerPercent: number, steps: number) {
  const w = world(level);
  const m = muzzle(level, angleDeg);
  w.adapter.spawnProjectile(metresToPixels(m.x, PPM), simYToWorldY(m.y, H, PPM), R * PPM,
    launchVelocityToWorld(w.physics.launchSpeed(powerPercent), angleDeg, PPM));
  const states: ProjectileState[] = [];
  for (let i = 0; i < steps; i++) {
    Matter.Engine.update(w.engine, DT * 1000);
    states.push(w.adapter.stepProjectile(level, R)!);
  }
  return { states, adapter: w.adapter, engine: w.engine };
}

describe('magnet: field maths (pure)', () => {
  it('is full inside the inner ring, fades smoothly and is exactly zero from the reach on', () => {
    const full = PROFILE.fullRadius;
    expect(full).toBeCloseTo(FIELD.radius * MAGNET.fullReachShare, 9);
    expect(magnetFalloff(0, 6, full)).toBe(1);
    expect(magnetFalloff(full, 6, full)).toBe(1);
    expect(magnetFalloff(6, 6, full)).toBe(0);
    expect(magnetFalloff(6.0001, 6, full)).toBe(0);
    expect(magnetFalloff(100, 6, full)).toBe(0);
    // Smooth at both edges of the fade (flat ends: no kink, no jump), and never increasing outwards.
    const e = 1e-4;
    expect(magnetFalloff(full + e, 6, full)).toBeGreaterThan(1 - 1e-6);
    expect(magnetFalloff(6 - e, 6, full)).toBeLessThan(1e-6);
    let prev = 1;
    for (let d = 0; d <= 7; d += 0.01) {
      const f = magnetFalloff(d, 6, full);
      expect(f).toBeLessThanOrEqual(prev + 1e-12);
      expect(f).toBeGreaterThanOrEqual(0);
      prev = f;
    }
  });

  it('has no singularity: zero at the centre, finite everywhere, never more than its strongest pull', () => {
    expect(magnetStrength(FIELD, 0, PROFILE)).toBe(0);
    expect(magnetAcceleration(FIELD, FIELD.x, FIELD.y, PROFILE)).toEqual({ x: 0, y: 0 });
    for (let x = -7; x <= 7; x += 0.05) {
      for (const y of [-3, -0.001, 0, 1e-9, 0.2, 2.5]) {
        const a = magnetAcceleration(FIELD, x, y, PROFILE);
        expect(Number.isFinite(a.x) && Number.isFinite(a.y), `${x},${y}`).toBe(true);
        expect(Math.hypot(a.x, a.y)).toBeLessThanOrEqual(FIELD.accelerationMs2 + 1e-9);
      }
    }
    // Inside the core it eases linearly to zero, continuously.
    const core = PROFILE.coreRadius;
    expect(magnetStrength(FIELD, core / 2, PROFILE)).toBeCloseTo(FIELD.accelerationMs2 / 2, 9);
    expect(magnetStrength(FIELD, core, PROFILE)).toBeCloseTo(FIELD.accelerationMs2, 9);
    expect(magnetStrength(FIELD, core * 1.001, PROFILE)).toBeCloseTo(FIELD.accelerationMs2, 9);
  });

  it('pulls towards the centre, only inside the reach', () => {
    for (const [x, y] of [[3, 0], [-2, 1], [0, -4], [4, 4]] as const) {
      const a = magnetAcceleration(FIELD, x, y, PROFILE);
      const d = Math.hypot(x, y);
      // Anti-parallel to the offset from the centre, with the profile's strength.
      expect((a.x * x + a.y * y) / (Math.hypot(a.x, a.y) * d)).toBeCloseTo(-1, 9);
      expect(Math.hypot(a.x, a.y)).toBeCloseTo(magnetStrength(FIELD, d, PROFILE), 9);
    }
    expect(magnetAcceleration(FIELD, 6.01, 0, PROFILE)).toEqual({ x: 0, y: 0 });
    expect(magnetAcceleration(FIELD, 5, 5, PROFILE)).toEqual({ x: 0, y: 0 });
    expect(magnetProximity(FIELD, 1, 1, PROFILE.fullRadius)).toBe(1);
    expect(magnetProximity(FIELD, 9, 0, PROFILE.fullRadius)).toBe(0);
  });

  it('is conservative: no work round a closed loop, so it can never pump a ball up', () => {
    // Work done by the field round loops that cross the core, the full zone, the fade and the outside.
    for (const [cx, cy, r] of [[0, 0, 0.2], [1, 0.5, 2], [3, -1, 3.5], [0, 0, 6.5], [5, 2, 2]] as const) {
      let work = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) {
        const t0 = (i / n) * Math.PI * 2;
        const t1 = ((i + 1) / n) * Math.PI * 2;
        const p0 = { x: cx + r * Math.cos(t0), y: cy + r * Math.sin(t0) };
        const p1 = { x: cx + r * Math.cos(t1), y: cy + r * Math.sin(t1) };
        const a = magnetAcceleration(FIELD, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, PROFILE);
        work += a.x * (p1.x - p0.x) + a.y * (p1.y - p0.y);
      }
      expect(Math.abs(work)).toBeLessThan(1e-3);
    }
    // And the most speed it can add is √(2·A·R).
    expect(magnetMaxSpeed(0, FIELD)).toBeCloseTo(Math.sqrt(2 * 8 * 6), 9);
    expect(magnetMaxSpeed(20, FIELD)).toBeCloseTo(Math.sqrt(400 + 96), 9);
  });
});

describe('magnet: physics', () => {
  it('bends the flight by exactly the field: Δv per fixed step is gravity plus the pull where the ball was', () => {
    const level = yard();
    const off = fieldOff(level);
    const { states } = fly(level, 50, 70, 150);
    const calm = fly(off, 50, 70, 150).states;
    let bent = false;
    for (let i = 2; i < states.length; i++) {
      const s = states[i]!;
      const p = states[i - 1]!;
      if (s.obstacleContacts.length > 0 || s.hitGround) break;
      const a = magnetAcceleration(level.magnet!, p.xSim, p.ySim, magnetProfile(level.magnet!.radius));
      expect((s.vxSim - p.vxSim) / DT).toBeCloseTo(a.x, 4);
      expect((s.vySim - p.vySim) / DT).toBeCloseTo(a.y - G, 4);
      if (Math.hypot(a.x, a.y) > 1) bent = true;
    }
    expect(bent).toBe(true);
    // Outside the reach (the first steps) it flies exactly as with the field off.
    expect(states[5]!.xSim).toBe(calm[5]!.xSim);
    expect(states[5]!.ySim).toBe(calm[5]!.ySim);
    expect(states[149]!.ySim).not.toBe(calm[149]!.ySim);
  });

  it('can never hold the ball up: in free flight it always falls at least g − A', () => {
    const level = yard({ accelerationMs2: MAGNET.maxAccelerationMs2 });
    for (let angle = 20; angle <= 80; angle += 6) {
      for (const power of [20, 45, 70, 95]) {
        const { states } = fly(level, angle, power, 900);
        for (let i = 1; i < states.length; i++) {
          const s = states[i]!;
          const p = states[i - 1]!;
          if (s.obstacleContacts.length > 0 || s.hitGround) break; // free flight only
          expect((s.vySim - p.vySim) / DT, `${angle}/${power} step ${i}`).toBeLessThanOrEqual(-(G - MAGNET.maxAccelerationMs2) + 1e-6);
        }
      }
    }
  });

  it('never moves Jonh, the ground or the housing, and the pull itself is never a contact', () => {
    const level = yard();
    const w = world(level);
    const statics = w.engine.world.bodies.map((b: Body) => ({ b, x: b.position.x, y: b.position.y }));
    const m = muzzle(level, 50);
    w.adapter.spawnProjectile(metresToPixels(m.x, PPM), simYToWorldY(m.y, H, PPM), R * PPM, launchVelocityToWorld(16, 50, PPM));
    let last: ProjectileState | null = null;
    for (let i = 0; i < 90; i++) {
      Matter.Engine.update(w.engine, DT * 1000);
      last = w.adapter.stepProjectile(level, R);
    }
    for (const s of statics) {
      expect(s.b.position.x).toBe(s.x);
      expect(s.b.position.y).toBe(s.y);
    }
    expect(last!.obstacleContacts).toEqual([]);
    expect(last!.hitGround || last!.hitJonh || last!.hitHat).toBe(false);
  });

  it('leaves a ball resting on the ground under it alone, so it settles', () => {
    // The magnet hangs low over the lawn: a rolling ball under it must still come to rest.
    const level = yard({ x: 8, y: 4.4, radius: 4 });
    const shot = runHeadlessShot(level, 14, 4);
    expect(shot.outcome).toBe('miss');
    expect(shot.steps).toBeLessThan(8 / DT);
  });

  it('holds a ball that touches it: stuck at the contact point, no speed, and the shot settles', () => {
    // A slow lob straight into the bottom of a housing hanging just ahead of the cannon.
    const level = yard({ x: 9, y: 6.2, radius: 2.5, accelerationMs2: 6 });
    let held: ProjectileState | null = null;
    let holder: MatterAdapter | null = null;
    for (let angle = 30; angle <= 80 && !held; angle += 1) {
      for (let power = 0; power <= 100 && !held; power += 4) {
        const { states, adapter } = fly(level, angle, power, 400);
        const i = states.findIndex(s => s.obstacleContacts.some(o => o.id === 'housing'));
        if (i < 0) continue;
        expect(adapter.heldByMagnet).toBe(true);
        const at = states[i]!;
        for (const s of states.slice(i)) {
          expect(s.xSim).toBe(at.xSim);
          expect(s.ySim).toBe(at.ySim);
          expect(s.speedMs).toBe(0);
        }
        // Resting against the housing's surface, not inside it.
        const b = level.obstacles[0]!.box;
        const dx = Math.max(b.minX - at.xSim, 0, at.xSim - b.maxX);
        const dy = Math.max(b.minY - at.ySim, 0, at.ySim - b.maxY);
        expect(Math.hypot(dx, dy)).toBeCloseTo(R, 2);
        held = at;
        holder = adapter;
        // The shot resolves as settled (a miss) within the settle time of touching it.
        const run = runHeadlessShot(level, angle, power);
        expect(run.outcome).toBe('miss');
        expect(run.steps).toBeLessThanOrEqual(i + 1 + Math.ceil(SHOT.settledSeconds / DT) + 2);
      }
    }
    expect(held).not.toBeNull();
    // A new shot starts free (scene reset, SPEC §7.2).
    holder!.spawnProjectile(100, 400, R * PPM, { x: 1, y: 0 });
    expect(holder!.heldByMagnet).toBe(false);
  });

  it('is frame-rate independent: same outcome, end point and step count at 30, 60 and 144 Hz', () => {
    const run = (hz: number, angle: number, power: number) => {
      const level = yard();
      const w = world(level);
      const m = muzzle(level, angle);
      w.adapter.spawnProjectile(metresToPixels(m.x, PPM), simYToWorldY(m.y, H, PPM), R * PPM,
        launchVelocityToWorld(w.physics.launchSpeed(power), angle, PPM));
      const stepper = new FixedStepper(DT, PHYSICS.maxStepsPerFrame);
      const attempt = new ShotAttemptMachine(level.bounds.maxX, SHOT.settledSpeedMs, SHOT.settledSeconds, SHOT.timeoutSeconds, SHOT.boundsMarginMetres, level.bounds.minY);
      attempt.fire(angle, power);
      let steps = 0;
      for (let frame = 0; frame < hz * 30; frame++) {
        for (let i = stepper.advance(1 / hz); i > 0; i--) {
          Matter.Engine.update(w.engine, DT * 1000);
          steps++;
          const s = w.adapter.stepProjectile(level, R)!;
          const r = attempt.step(DT, { x: s.xSim, y: s.ySim, speed: s.speedMs, hitBody: s.hitJonh, hitHat: s.hitHat });
          if (r.resolved) return { steps, x: s.xPx, y: s.yPx, reason: attempt.missReason };
        }
      }
      throw new Error('unresolved');
    };
    for (const [angle, power] of [[50, 70], [62, 55], [35, 90]] as const) {
      const base = run(60, angle, power);
      expect(run(30, angle, power)).toEqual(base);
      expect(run(144, angle, power)).toEqual(base);
    }
  });

  it('the swept guard still owns bounces: at top speed the ball never ends a step inside a thin wall in the field', () => {
    const level: LevelData = {
      ...yard({ x: 16, y: 5, radius: 8, accelerationMs2: MAGNET.maxAccelerationMs2 }),
    };
    level.obstacles = [...level.obstacles, { id: 'thin', box: { minX: 14, maxX: 14.2, minY: 1.6, maxY: 40 }, material: 'wood', ricochet: false }];
    for (let angle = AIM.minAngleDeg; angle <= AIM.maxAngleDeg; angle += 5) {
      const { states } = fly(level, angle, 100, 500);
      for (const s of states) {
        for (const o of level.obstacles) {
          const b = o.box;
          const inside = s.xSim > b.minX + 1e-3 && s.xSim < b.maxX - 1e-3 && s.ySim > b.minY + 1e-3 && s.ySim < b.maxY - 1e-3;
          expect(inside, `${angle}° inside ${o.id}`).toBe(false);
        }
        expect(s.xSim, `${angle}° tunnelled through the wall`).toBeLessThan(14.2);
      }
    }
  });

  it('recorded flights (title demo, winning-shot replay) bend with it and match a live shot', () => {
    const level = yard();
    const a = recordShot(level, 50, 70, 2);
    const b = recordShot(fieldOff(level), 50, 70, 2);
    expect(a.points[200]!.y).not.toBe(b.points[200]!.y);
    const live = fly(level, 50, 70, 200).states;
    expect(a.points[200]!.x).toBe(live[199]!.xPx);
    expect(a.points[200]!.y).toBe(live[199]!.yPx);
  });
});

describe('magnet: level data', () => {
  const cfg = { maxSpeedMs: 20, dtSeconds: DT, minThicknessMetres: 0.2 };
  const errors = (level: LevelData) => validateLevel(level, cfg).errors.join(' | ');

  it('accepts a sane magnet', () => {
    expect(validateLevel(yard(), cfg).errors).toEqual([]);
  });

  it('keeps the pull weaker than gravity (so nothing can hover or orbit) and the reach bounded', () => {
    expect(errors(yard({ accelerationMs2: 0 }))).toContain('Magnet pull');
    expect(errors(yard({ accelerationMs2: -2 }))).toContain('Magnet pull');
    expect(errors(yard({ accelerationMs2: Number.NaN }))).toContain('Magnet pull');
    expect(errors(yard({ accelerationMs2: MAGNET.maxAccelerationMs2 + 0.5 }))).toContain('Magnet pull');
    // On a low-gravity map the limit follows the gravity: 2 m/s² of gravity allows 1.7 m/s² of pull.
    expect(errors({ ...yard({ accelerationMs2: 1.8 }), gravityMs2: 2 })).toContain('Magnet pull');
    expect(validateLevel({ ...yard({ accelerationMs2: 1.6 }), gravityMs2: 2 }, cfg).errors).toEqual([]);
    expect(errors(yard({ radius: 0 }))).toContain('Magnet reach');
    expect(errors(yard({ radius: MAGNET.maxRadiusMetres + 1 }))).toContain('Magnet reach');
  });

  it('needs a solid housing round its centre and stays clear of the cannon', () => {
    expect(errors(yard({ housingId: 'nothing' }))).toContain('housing "nothing"');
    const offCentre = yard();
    offCentre.magnet = { ...offCentre.magnet!, x: offCentre.magnet!.x + 2 };
    expect(errors(offCentre)).toContain('inside its housing');
    expect(errors(yard({ x: 5, y: 6, radius: 4 }))).toContain('clear of the cannon');
    expect(errors(yard({ x: 70 }))).toContain('inside the level bounds');
  });

  it('sizes colliders for the speed the field can add (v² ≤ v₀² + 2·A·R)', () => {
    // A faster cannon makes the field matter: 24 m/s alone needs 0.2 m; with the field, 0.22 m.
    const fast = (magnet: boolean): LevelData => {
      const base = yard({ radius: 8, accelerationMs2: 8 });
      return {
        ...(magnet ? base : fieldOff(base)),
        launchSpeedScale: 1.2,
        obstacles: [...base.obstacles, { id: 'post', box: { minX: 30, maxX: 30.21, minY: 1.6, maxY: 5 }, material: 'wood', ricochet: false }],
      };
    };
    expect(validateLevel(fast(false), cfg).errors).toEqual([]);
    expect(errors(fast(true))).toContain('post');
  });

  it('is part of the level physics, and every other map has none', () => {
    expect(levelPhysics(yard()).magnet).toEqual(yard().magnet);
    expect(levelPhysics({}).magnet).toBeNull();
    for (const level of MAPS.filter(m => m.id !== 'magnet')) {
      expect(level.magnet, level.id).toBeUndefined();
      expect(levelPhysics(level).magnet).toBeNull();
    }
  });
});

describe('magnet: launch preview', () => {
  it('is unchanged (analytic) on a map without a magnet', () => {
    const plain = previewDotsPx({ x: 0, y: 0 }, 40, 14, 9.81, 0, PPM, AIM.previewSeconds, 9);
    const last = plain[8]!;
    const p = analyticPosition(AIM.previewSeconds, 0, 0, 14 * Math.cos(40 * Math.PI / 180), 14 * Math.sin(40 * Math.PI / 180), 9.81, 0);
    expect(last.x).toBeCloseTo(p.x * PPM, 9);
    expect(last.y).toBeCloseTo(-p.y * PPM, 9);
  });

  it('bends towards the magnet and agrees with the simulated flight within 5 cm', () => {
    // A magnet just past the end of the preview's reach: the dots start inside its pull.
    const level = yard({ x: 11, y: 7, radius: 5 });
    expect(validateLevel(level, validationConfig()).errors).toEqual([]);
    const physics = levelPhysics(level);
    const profile = magnetProfile(level.magnet!.radius);
    for (const [angle, power] of [[35, 100], [45, 90], [30, 80]] as const) {
      const m = muzzle(level, angle);
      const mPx = { x: metresToPixels(m.x, PPM), y: simYToWorldY(m.y, H, PPM) };
      const pull = { accel: (dx: number, dy: number) => magnetAcceleration(level.magnet!, m.x + dx, m.y + dy, profile), dtSeconds: DT };
      const dots = previewDotsPx(mPx, angle, physics.launchSpeed(power), physics.gravity, 0, PPM, AIM.previewSeconds, 9, pull);
      // The same stepping with no pull, so only the magnet differs.
      const plain = previewDotsPx(mPx, angle, physics.launchSpeed(power), physics.gravity, 0, PPM, AIM.previewSeconds, 9,
        { accel: () => ({ x: 0, y: 0 }), dtSeconds: DT });
      const states = fly(level, angle, power, Math.round(AIM.previewSeconds / DT)).states;
      dots.forEach((dot, i) => {
        const step = Math.round((AIM.previewSeconds * (i + 1)) / 9 / DT);
        const s = states[step - 1]!;
        expect(Math.abs(dot.x - s.xPx), `${angle}/${power} dot ${i}`).toBeLessThan(0.05 * PPM);
        expect(Math.abs(dot.y - s.yPx)).toBeLessThan(0.05 * PPM);
      });
      // Pulled up and forwards, towards the magnet ahead and above.
      expect(dots[8]!.y).toBeLessThan(plain[8]!.y);
      expect(dots[8]!.x).toBeGreaterThan(plain[8]!.x);
    }
  });
});

function validationConfig() {
  return { maxSpeedMs: AIM.maxImpulseNs / PROJECTILE.massKg, dtSeconds: DT, minThicknessMetres: 0.2 };
}
