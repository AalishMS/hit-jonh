import { describe, expect, it } from 'vitest';
import Matter, { type Body } from '@matter-js';
import { AIM, PHYSICS, PROJECTILE, SHOT, WIND, WORLD } from '../src/config/tuning';
import { MAPS } from '../src/levels';
import { jonhAt } from '../src/levels/build';
import { levelPhysics } from '../src/levels/levelPhysics';
import type { LevelData } from '../src/levels/types';
import { validateLevel } from '../src/levels/validation';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { MatterAdapter, type ProjectileState } from '../src/physics/matterAdapter';
import { recordShot } from '../src/physics/shotRecorder';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { analyticPosition, previewDotsPx } from '../src/sim/ballistics';
import { FixedStepper } from '../src/sim/fixedStep';
import { launchVelocityToWorld, matterGravityY, matterVelocityToSpeedMs, metresToPixels, simYToWorldY } from '../src/sim/units';
import { WINDLESS_GOLDEN } from './windlessGolden';

const PPM = WORLD.pixelsPerMetre;
const H = WORLD.designHeightPx;
const R = PROJECTILE.radiusMetres;
const DT = PHYSICS.fixedStepSeconds;
const MUZZLE_OFFSET = AIM.barrelLengthMetres + R + AIM.muzzleGapMetres;

/** Open lawn: nothing to hit, so the ball flies a pure ballistic arc. */
const lawn = (wind?: number): LevelData => ({
  id: 'lawn',
  name: 'Lawn',
  difficulty: 1,
  bounds: { minX: 0, maxX: 60, minY: 0, maxY: 40 },
  ground: { minX: 0, maxX: 60, minY: 0, maxY: 1.6, material: 'grass' },
  cannonSpawn: { x: 2.5, y: 2.2 },
  jonhSpawn: jonhAt(50, 1.6),
  obstacles: [],
  referenceSolutions: [{ angleDeg: 45, powerPercent: 50 }],
  multiplayerPositions: [],
  ...(wind === undefined ? {} : { wind: { accelerationMs2: wind } }),
});

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

/** Fires from the muzzle and returns the ball's state after every fixed step. */
function fly(level: LevelData, angleDeg: number, powerPercent: number, steps: number): ProjectileState[] {
  const w = world(level);
  const m = muzzle(level, angleDeg);
  w.adapter.spawnProjectile(metresToPixels(m.x, PPM), simYToWorldY(m.y, H, PPM), R * PPM,
    launchVelocityToWorld(w.physics.launchSpeed(powerPercent), angleDeg, PPM));
  const states: ProjectileState[] = [];
  for (let i = 0; i < steps; i++) {
    Matter.Engine.update(w.engine, DT * 1000);
    const state = w.adapter.stepProjectile(level, R)!;
    states.push(state);
    if (state.hitJonh) break;
  }
  return states;
}

describe('wind: physics', () => {
  it('adds ½·a·t² of drift in flight, exactly as the analytic model says', () => {
    for (const a of [-4, -1.5, 3, 6]) {
      const calm = fly(lawn(), 45, 60, 120);
      const windy = fly(lawn(a), 45, 60, 120);
      for (const step of [36, 72, 120]) {
        const t = step * DT;
        const drift = windy[step - 1]!.xSim - calm[step - 1]!.xSim;
        // Matter integrates semi-implicitly: a·dt·t/2 of lag, the same as gravity has.
        expect(drift).toBeCloseTo(0.5 * a * t * t, 1);
        expect(Math.abs(drift - 0.5 * a * t * t)).toBeLessThan(Math.abs(a) * DT * t * 0.6 + 1e-6);
        // Wind is horizontal only.
        expect(windy[step - 1]!.ySim).toBeCloseTo(calm[step - 1]!.ySim, 6);
      }
    }
  });

  it('is a constant acceleration of the horizontal velocity', () => {
    const s = fly(lawn(4), 30, 50, 100);
    expect((s[99]!.vxSim - s[49]!.vxSim) / (50 * DT)).toBeCloseTo(4, 2);
    expect(s[99]!.vySim - s[49]!.vySim).toBeCloseTo(-PHYSICS.gravity * 50 * DT, 2);
  });

  it('never moves Jonh, the ground or obstacles, and is never a contact', () => {
    const level: LevelData = {
      ...lawn(7),
      obstacles: [{ id: 'wall', box: { minX: 20, maxX: 20.4, minY: 1.6, maxY: 5 }, material: 'wood', ricochet: false }],
    };
    const w = world(level);
    const statics = w.engine.world.bodies.map((b: Body) => ({ b, x: b.position.x, y: b.position.y }));
    const m = muzzle(level, 40);
    w.adapter.spawnProjectile(metresToPixels(m.x, PPM), simYToWorldY(m.y, H, PPM), R * PPM, launchVelocityToWorld(14, 40, PPM));
    let last: ProjectileState | null = null;
    for (let i = 0; i < 40; i++) {
      Matter.Engine.update(w.engine, DT * 1000);
      last = w.adapter.stepProjectile(level, R);
    }
    for (const s of statics) {
      expect(s.b.position.x).toBe(s.x);
      expect(s.b.position.y).toBe(s.y);
    }
    // Still in the air in free flight: not one contact of any kind.
    expect(last!.obstacleContacts).toEqual([]);
    expect(last!.hitGround || last!.hitJonh || last!.hitHat).toBe(false);
  });

  it('leaves a ball resting on the ground alone, so it still settles', () => {
    // A slow, flat lob lands and rolls; wind must not keep it rolling until the timeout.
    for (const a of [-5, 5]) {
      const level = lawn(a);
      const states = fly(level, 12, 0, 3000);
      const end = states[states.length - 1]!;
      expect(end.speedMs).toBeLessThan(SHOT.settledSpeedMs * 4);
      const shot = runHeadlessShot(level, 12, 0);
      expect(shot.steps).toBeLessThan(SHOT.timeoutSeconds / DT);
    }
  });

  it('is frame-rate independent: same outcome, end point and step count at 30, 60 and 144 Hz', () => {
    const run = (hz: number, angle: number, power: number) => {
      const level = lawn(-3.5);
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
    for (const [angle, power] of [[35, 70], [60, 55], [20, 90]] as const) {
      const base = run(60, angle, power);
      expect(run(30, angle, power)).toEqual(base);
      expect(run(144, angle, power)).toEqual(base);
    }
  });

  it('the swept guard and Matter agree: strong wind never lets the ball through a thin wall, either way', () => {
    for (const a of [-WIND.maxAccelerationMs2, WIND.maxAccelerationMs2]) {
      const level: LevelData = {
        ...lawn(a),
        // 0.2 m: the thinnest collider the thickness rule allows.
        obstacles: [{ id: 'thin', box: { minX: 14, maxX: 14.2, minY: 1.6, maxY: 40 }, material: 'wood', ricochet: false }],
      };
      for (let angle = AIM.minAngleDeg; angle <= AIM.maxAngleDeg; angle += 10) {
        const states = fly(level, angle, 100, 400);
        for (const s of states) {
          // Tailwind drives into the wall, headwind blows the ball back; neither tunnels.
          if (s.xSim > 14 - R && s.ySim > 1.6 && s.xSim < 14.2 + R) expect(s.xSim).toBeLessThanOrEqual(14 - R + 0.02);
        }
        const crossed = states.some(s => s.xSim > 14.2 + R);
        expect(crossed, `a=${a} angle=${angle}`).toBe(false);
      }
    }
  });

  it('reports the same velocity Matter holds (swept guard sees the wind)', () => {
    const level = lawn(5);
    const w = world(level);
    const m = muzzle(level, 50);
    const body = w.adapter.spawnProjectile(metresToPixels(m.x, PPM), simYToWorldY(m.y, H, PPM), R * PPM, launchVelocityToWorld(13, 50, PPM));
    for (let i = 0; i < 90; i++) {
      Matter.Engine.update(w.engine, DT * 1000);
      const s = w.adapter.stepProjectile(level, R)!;
      expect(s.vxSim).toBeCloseTo(matterVelocityToSpeedMs(body.velocity.x, PPM), 9);
      expect(s.vySim).toBeCloseTo(-matterVelocityToSpeedMs(body.velocity.y, PPM), 9);
    }
  });

  it('a ball bounced off a wall keeps being pushed by the wind afterwards', () => {
    const level: LevelData = {
      ...lawn(-4),
      obstacles: [{ id: 'wall', box: { minX: 8, maxX: 8.6, minY: 1.6, maxY: 40 }, material: 'wood', ricochet: false }],
    };
    const states = fly(level, 20, 60, 400);
    const bounce = states.findIndex(s => s.obstacleContacts.length > 0);
    expect(bounce).toBeGreaterThan(0);
    // After bouncing back the wind keeps adding −4 m/s² of horizontal speed.
    const a = states[bounce + 10]!;
    const b = states[bounce + 40]!;
    if (!b.hitGround) expect((b.vxSim - a.vxSim) / (30 * DT)).toBeCloseTo(-4, 1);
  });
});

describe('wind: maps without wind are unchanged', () => {
  it('has no force, no extra state and no wind in the level physics', () => {
    for (const level of MAPS.filter(m => !m.wind)) {
      expect(levelPhysics(level).windMs2).toBe(0);
    }
  });

  for (const [id, shots] of Object.entries(WINDLESS_GOLDEN)) {
    it(`${id}: fixed shots reproduce the pre-wind results bit for bit`, () => {
      const level = MAPS.find(m => m.id === id)!;
      expect(level.wind).toBeUndefined();
      for (const [angle, power, outcome, steps, x, y, rx, ry] of shots) {
        const shot = runHeadlessShot(level, angle, power);
        expect([shot.outcome, shot.steps, shot.endXSim, shot.endYSim], `${id} ${angle}/${power}`).toEqual([outcome, steps, x, y]);
        const rec = recordShot(level, angle, power, 3);
        const last = rec.points[rec.points.length - 1]!;
        expect([last.x, last.y], `${id} ${angle}/${power} recorded`).toEqual([rx, ry]);
      }
    });
  }
});

describe('wind: launch preview', () => {
  it('is the analytic arc, bent by the wind, for the first 0.3 s only', () => {
    const dots = previewDotsPx({ x: 0, y: 0 }, 40, 14, 9.81, 3, PPM, AIM.previewSeconds, 9);
    expect(dots).toHaveLength(9);
    const last = dots[8]!;
    const p = analyticPosition(AIM.previewSeconds, 0, 0, 14 * Math.cos(40 * Math.PI / 180), 14 * Math.sin(40 * Math.PI / 180), 9.81, 3);
    expect(last.x).toBeCloseTo(p.x * PPM, 9);
    expect(last.y).toBeCloseTo(-p.y * PPM, 9);
    // Never a landing point: a 0.3 s stretch, far short of the arc's ~2 s flight.
    expect(Math.hypot(last.x, last.y)).toBeLessThan(14 * AIM.previewSeconds * PPM + 1);
  });

  it('agrees with the simulated flight over the first 0.3 s (within 5 cm), with and without wind', () => {
    for (const a of [undefined, -6, -2, 2.5, 6]) {
      for (const [angle, power] of [[15, 90], [45, 50], [70, 30], [30, 100]] as const) {
        const level = lawn(a);
        const physics = levelPhysics(level);
        const m = muzzle(level, angle);
        const mPx = { x: metresToPixels(m.x, PPM), y: simYToWorldY(m.y, H, PPM) };
        const dots = previewDotsPx(mPx, angle, physics.launchSpeed(power), physics.gravity, physics.windMs2, PPM, AIM.previewSeconds, 9);
        const states = fly(level, angle, power, Math.round(AIM.previewSeconds / DT));
        dots.forEach((dot, i) => {
          const step = Math.round((AIM.previewSeconds * (i + 1)) / 9 / DT);
          const s = states[step - 1]!;
          expect(Math.abs(dot.x - s.xPx), `a=${a} ${angle}/${power} dot ${i}`).toBeLessThan(0.05 * PPM);
          expect(Math.abs(dot.y - s.yPx)).toBeLessThan(0.05 * PPM);
        });
      }
    }
  });

  it('bends towards the way the wind blows', () => {
    const calm = previewDotsPx({ x: 0, y: 0 }, 45, 12, 9.81, 0, PPM, AIM.previewSeconds, 9)[8]!;
    const tail = previewDotsPx({ x: 0, y: 0 }, 45, 12, 9.81, 6, PPM, AIM.previewSeconds, 9)[8]!;
    const head = previewDotsPx({ x: 0, y: 0 }, 45, 12, 9.81, -6, PPM, AIM.previewSeconds, 9)[8]!;
    expect(tail.x).toBeGreaterThan(calm.x);
    expect(head.x).toBeLessThan(calm.x);
    expect(tail.y).toBe(calm.y);
  });
});

describe('wind: level data', () => {
  it('validates the strength and the windsock, and sizes colliders for the speed wind adds', () => {
    const cfg = { maxSpeedMs: 20, dtSeconds: DT, minThicknessMetres: 0.2 };
    expect(validateLevel(lawn(3), cfg).valid).toBe(true);
    expect(validateLevel(lawn(0), cfg).errors.join()).toContain('Wind acceleration');
    expect(validateLevel(lawn(WIND.maxAccelerationMs2 + 1), cfg).errors.join()).toContain('Wind acceleration');
    expect(validateLevel(lawn(Number.NaN), cfg).errors.join()).toContain('Wind acceleration');
    expect(validateLevel({ ...lawn(3), wind: { accelerationMs2: 3, windsockX: 99 } }, cfg).errors.join()).toContain('Windsock');
    const thin = (a?: number): LevelData => ({
      ...lawn(a),
      obstacles: [{ id: 'post', box: { minX: 10, maxX: 10.21, minY: 1.6, maxY: 5 }, material: 'wood', ricochet: false }],
    });
    expect(validateLevel(thin(), cfg).errors).toEqual([]);
    expect(validateLevel(thin(WIND.maxAccelerationMs2), cfg).errors.join()).toContain('post');
  });

  it('is part of the level physics', () => {
    expect(levelPhysics({ wind: { accelerationMs2: -3 } }).windMs2).toBe(-3);
    expect(levelPhysics({}).windMs2).toBe(0);
  });
});

describe('wind: recorded flights (title screen, winning-shot replay)', () => {
  it('include the wind: the recording is a different path than a calm one and matches a live shot', () => {
    const windy = lawn(-5);
    const calm = lawn();
    const a = recordShot(windy, 40, 70, 2);
    const b = recordShot(calm, 40, 70, 2);
    expect(a.points[a.points.length - 1]!.x).toBeLessThan(b.points[b.points.length - 1]!.x - 100);
    const live = fly(windy, 40, 70, 120);
    expect(a.points[120]!.x).toBe(live[119]!.xPx);
    expect(a.points[120]!.y).toBe(live[119]!.yPx);
  });
});
