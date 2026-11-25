import { describe, expect, it } from 'vitest';
import Matter, { type Body, type Engine } from '@matter-js';
import { AIM, PHYSICS, PROJECTILE, SHOT, WORLD } from '../src/config/tuning';
import { MAPS, STROLL_LEVEL } from '../src/levels';
import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt } from '../src/levels/build';
import { routePoseAtStep, shiftJonh, type RoutePose } from '../src/levels/jonhRoute';
import { levelPhysics } from '../src/levels/levelPhysics';
import { levelAtMultiplayerPosition } from '../src/levels/multiplayerPositions';
import type { Box2D, LevelData } from '../src/levels/types';
import { validateLevel } from '../src/levels/validation';
import { MatterAdapter, type ProjectileState } from '../src/physics/matterAdapter';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { recordShot, sampleRecordedJonh } from '../src/physics/shotRecorder';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { FixedStepper } from '../src/sim/fixedStep';
import { launchVelocityToWorld, matterGravityY, metresToPixels, pixelsToMetres, simYToWorldY, worldYToSimY } from '../src/sim/units';

const ppm = WORLD.pixelsPerMetre;
const H = WORLD.designHeightPx;

function setup(level: LevelData): { engine: Engine; adapter: MatterAdapter; jonhBody: Body; hat: Body | undefined } {
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: matterGravityY(levelPhysics(level).gravity, ppm, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale },
  });
  const adapter = new MatterAdapter(engine.world, ppm, H);
  adapter.setupLevel(level);
  const bodies: Body[] = engine.world.bodies;
  return { engine, adapter, jonhBody: bodies.find(b => b.label === 'jonhBody')!, hat: bodies.find(b => b.label === 'jonhHat') };
}

function fire(level: LevelData, adapter: MatterAdapter, angleDeg: number, powerPercent: number): void {
  const rad = angleDeg * Math.PI / 180;
  const offset = AIM.barrelLengthMetres + PROJECTILE.radiusMetres + AIM.muzzleGapMetres;
  adapter.spawnProjectile(
    metresToPixels(level.cannonSpawn.x + offset * Math.cos(rad), ppm),
    simYToWorldY(level.cannonSpawn.y + offset * Math.sin(rad), H, ppm),
    PROJECTILE.radiusMetres * ppm,
    launchVelocityToWorld(levelPhysics(level).launchSpeed(powerPercent), angleDeg, ppm),
  );
}

/** The Matter body's box in metres (sim y up). */
function matterBox(body: Body): Box2D {
  return {
    minX: pixelsToMetres(body.bounds.min.x, ppm), maxX: pixelsToMetres(body.bounds.max.x, ppm),
    minY: worldYToSimY(body.bounds.max.y, H, ppm), maxY: worldYToSimY(body.bounds.min.y, H, ppm),
  };
}

function expectBoxClose(actual: Box2D, expected: Box2D): void {
  for (const k of ['minX', 'maxX', 'minY', 'maxY'] as const) expect(actual[k]).toBeCloseTo(expected[k], 6);
}

const middle = levelAtMultiplayerPosition(STROLL_LEVEL, 'middle');
const ref = middle.referenceSolutions[0]!;

describe('Walking Jonh: physics', () => {
  it('Matter colliders, the swept guard box and the route agree on every fixed step', () => {
    const { engine, adapter, jonhBody, hat } = setup(middle);
    expectBoxClose(matterBox(jonhBody), middle.jonhSpawn.bodyBox);
    fire(middle, adapter, 25, 100); // a long miss: he walks the whole way
    let checked = 0;
    for (let step = 1; step <= 900; step++) {
      // Before step k is simulated, everything has him where the route puts him during step k.
      const expected = shiftJonh(middle.jonhSpawn, routePoseAtStep(middle.jonhRoute!, step).dx, 0);
      expectBoxClose(matterBox(jonhBody), expected.bodyBox);
      expectBoxClose(matterBox(hat!), expected.hatBox!);
      expectBoxClose(adapter.jonhBodyBox(middle), expected.bodyBox);
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      const state = adapter.stepProjectile(middle, PROJECTILE.radiusMetres)!;
      checked++;
      if (state.hitJonh || state.hitHat) break;
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('stops for good at the first touch; the hit is recorded once and never changes', () => {
    const { engine, adapter, jonhBody } = setup(middle);
    fire(middle, adapter, ref.angleDeg, ref.powerPercent);
    const attempt = new ShotAttemptMachine(middle.bounds.maxX, SHOT.settledSpeedMs, SHOT.settledSeconds, SHOT.timeoutSeconds, SHOT.boundsMarginMetres, middle.bounds.minY);
    attempt.fire(ref.angleDeg, ref.powerPercent);
    let hitStep: number | null = null;
    let resolvedAt: number | null = null;
    let impact = 0;
    let pose: RoutePose | null = null;
    let at: Box2D | null = null;
    for (let step = 1; step <= 1800; step++) {
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      const state = adapter.stepProjectile(middle, PROJECTILE.radiusMetres)!;
      if (state.hitJonh && hitStep === null) {
        hitStep = step;
        impact = state.impactSpeedMs;
        pose = adapter.jonhRoutePose;
        at = matterBox(jonhBody);
        // He was where the route had him during that step, and he is still there.
        expect(pose).toEqual(routePoseAtStep(middle.jonhRoute!, step));
      }
      if (hitStep !== null) {
        expect(state.hitJonh).toBe(true);
        expect(state.impactSpeedMs).toBe(impact);
        expect(adapter.jonhRoutePose).toEqual(pose);
        expectBoxClose(matterBox(jonhBody), at!);
      }
      if (resolvedAt === null) {
        const result = attempt.step(PHYSICS.fixedStepSeconds, { x: state.xSim, y: state.ySim, speed: state.speedMs, hitBody: state.hitJonh, hitHat: state.hitHat });
        if (result.resolved) { resolvedAt = step; expect(result.outcome).toBe('hit'); }
      }
      if (hitStep !== null && step > hitStep + 240) break;
    }
    expect(hitStep).not.toBeNull();
    expect(resolvedAt).toBe(hitStep);
    // He had actually walked: the hit is on the move, not at his starting spot.
    expect(Math.abs(pose!.dx)).toBeGreaterThan(0.1);
  });

  it('a scene reset (and every new shot) puts him back at the start of his route (SPEC §7.2)', () => {
    const { engine, adapter, jonhBody } = setup(middle);
    fire(middle, adapter, 25, 100);
    for (let i = 0; i < 400; i++) { Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000); adapter.stepProjectile(middle, PROJECTILE.radiusMetres); }
    expect(adapter.jonhRoutePose!.dx).not.toBe(0);
    adapter.removeProjectile();
    expect(adapter.jonhRoutePose).toEqual(routePoseAtStep(middle.jonhRoute!, 0));
    expectBoxClose(matterBox(jonhBody), middle.jonhSpawn.bodyBox);
    fire(middle, adapter, 25, 100);
    expect(adapter.jonhRoutePose).toEqual(routePoseAtStep(middle.jonhRoute!, 1));
  });

  it('walking into a ball that is lying still counts as a touch and shoves it his way [PROPOSED]', () => {
    const level: LevelData = {
      id: 'shove', name: 'Shove', difficulty: 1, bounds: GARDEN_BOUNDS, ground: GARDEN_GROUND, cannonSpawn: GARDEN_CANNON,
      jonhSpawn: jonhAt(12, 1.6), obstacles: [], referenceSolutions: [], multiplayerPositions: [],
      jonhRoute: { waypoints: [{ dx: 0 }, { dx: -6, speedMs: 1.5 }] },
    };
    const { engine, adapter } = setup(level);
    const r = PROJECTILE.radiusMetres;
    adapter.spawnProjectile(metresToPixels(10, ppm), simYToWorldY(1.6 + r, H, ppm), r * ppm, { x: 0, y: 0 });
    let state: ProjectileState | null = null;
    for (let i = 0; i < 240 && !state?.hitJonh; i++) {
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      state = adapter.stepProjectile(level, r);
    }
    expect(state!.hitJonh).toBe(true);
    // Weak/strong uses the ball's own speed [PROPOSED]: a ball he walks into is a weak hit.
    expect(state!.impactSpeedMs).toBeLessThan(1);
    expect(state!.vxSim).toBeLessThan(0);
  });

  it('never tunnels through a walking Jonh at the top ball speed, from any angle', () => {
    // A deliberately harsh rig: a fast cannon (×1.6, 32 m/s) and Jonh pacing at the walking limit.
    const fast: LevelData = {
      id: 'tunnel', name: 'Tunnel', difficulty: 1, bounds: GARDEN_BOUNDS, ground: GARDEN_GROUND, cannonSpawn: GARDEN_CANNON,
      jonhSpawn: jonhAt(9, 1.6), obstacles: [], referenceSolutions: [{ angleDeg: 10, powerPercent: 100 }], multiplayerPositions: [],
      launchSpeedScale: 1.6,
      jonhRoute: { waypoints: [{ dx: 0 }, { dx: -2, speedMs: 2 }, { dx: 2, speedMs: 2 }, { dx: -2, speedMs: 2 }] },
    };
    expect(validateLevel(fast, { maxSpeedMs: 20, dtSeconds: PHYSICS.fixedStepSeconds, minThicknessMetres: 0.2 }).errors).toEqual([]);
    let hits = 0;
    for (const level of [fast, ...STROLL_LEVEL.multiplayerPositions.map(p => levelAtMultiplayerPosition(STROLL_LEVEL, p.id))]) {
      for (let angle = AIM.minAngleDeg; angle <= AIM.maxAngleDeg; angle += 1) {
        const { engine, adapter } = setup(level);
        fire(level, adapter, angle, 100);
        const r = PROJECTILE.radiusMetres;
        let prev = { x: level.cannonSpawn.x, y: level.cannonSpawn.y };
        for (let step = 1; step <= 600; step++) {
          const box = adapter.jonhBodyBox(level);
          Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
          const state = adapter.stepProjectile(level, r)!;
          if (state.hitJonh) { hits++; break; }
          const curr = { x: state.xSim, y: state.ySim };
          const inside = curr.x > box.minX && curr.x < box.maxX && curr.y > box.minY && curr.y < box.maxY;
          const crossed = ((prev.x + r <= box.minX && curr.x - r >= box.maxX) || (prev.x - r >= box.maxX && curr.x + r <= box.minX)) &&
            Math.max(prev.y, curr.y) - r < box.maxY && Math.min(prev.y, curr.y) + r > box.minY;
          expect(inside || crossed, `${level.id} ${angle}° step ${step}`).toBe(false);
          prev = curr;
          if (curr.x > level.bounds.maxX + 1 || curr.x < -1) break;
        }
      }
    }
    expect(hits).toBeGreaterThan(0);
  }, 120_000);

  it('every other map keeps a still Jonh: no route pose, nothing recorded for him', () => {
    for (const level of MAPS.filter(m => !m.jonhRoute)) {
      const { adapter, jonhBody } = setup(level);
      expect(adapter.jonhRoutePose).toBeNull();
      expect(adapter.jonhRoutePoseAt(1)).toBeNull();
      fire(level, adapter, 45, 50);
      expectBoxClose(matterBox(jonhBody), level.jonhSpawn.bodyBox);
      expect(recordShot(level, 45, 50, 1).jonh).toBeNull();
    }
    expect(MAPS.filter(m => m.jonhRoute).map(m => m.id)).toEqual(['stroll']);
  });
});

/** One shot played frame by frame through FixedStepper at `hz`, as the scene does. */
function playAt(level: LevelData, angle: number, power: number, hz: number) {
  const { engine, adapter } = setup(level);
  fire(level, adapter, angle, power);
  const stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
  const attempt = new ShotAttemptMachine(level.bounds.maxX, SHOT.settledSpeedMs, SHOT.settledSeconds, SHOT.timeoutSeconds, SHOT.boundsMarginMetres, level.bounds.minY);
  attempt.fire(angle, power);
  let steps = 0;
  for (let frame = 0; frame < hz * 20; frame++) {
    const n = stepper.advance(1 / hz, PHYSICS.maxStepsPerFrame);
    for (let i = 0; i < n; i++) {
      Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
      steps++;
      const state = adapter.stepProjectile(level, PROJECTILE.radiusMetres)!;
      const result = attempt.step(PHYSICS.fixedStepSeconds, { x: state.xSim, y: state.ySim, speed: state.speedMs, hitBody: state.hitJonh, hitHat: state.hitHat });
      if (result.resolved) return { outcome: result.outcome, steps, x: state.xSim, y: state.ySim, jonh: adapter.jonhRoutePose, impact: state.impactSpeedMs };
    }
  }
  throw new Error('unresolved');
}

describe('Walking Jonh: determinism and replays', () => {
  it('outcome, step count, end point and where he stopped are identical at 30, 60 and 144 Hz', () => {
    const aims: Array<[number, number]> = [[ref.angleDeg, ref.powerPercent], [45, 30], [60, 45], [30, 70], [70, 60]];
    for (const [angle, power] of aims) {
      const expected = playAt(middle, angle, power, 60);
      for (const hz of [30, 144]) expect(playAt(middle, angle, power, hz), `${angle}/${power} at ${hz} Hz`).toEqual(expected);
      expect(runHeadlessShot(middle, angle, power).steps).toBe(expected.steps);
    }
  });

  it('the recorded flight carries his route, in step with the ball, stopping at the contact', () => {
    for (const position of STROLL_LEVEL.multiplayerPositions) {
      const level = levelAtMultiplayerPosition(STROLL_LEVEL, position.id);
      const { angleDeg, powerPercent } = position.referenceSolutions[0]!;
      const shot = recordShot(level, angleDeg, powerPercent);
      expect(shot.contactIndex).not.toBeNull();
      expect(shot.jonh).toHaveLength(shot.points.length);
      shot.points.forEach((p, i) => expect(shot.jonh![i]).toEqual(routePoseAtStep(level.jonhRoute!, Math.round(p.t / PHYSICS.fixedStepSeconds))));
      // The replay samples the same pose the live shot had at that simulated time.
      const contactT = shot.points[shot.contactIndex!]!.t;
      expect(sampleRecordedJonh(shot, contactT)).toEqual(routePoseAtStep(level.jonhRoute!, shot.contactIndex!));
      expect(sampleRecordedJonh(shot, contactT / 2)).toEqual(routePoseAtStep(level.jonhRoute!, Math.floor(shot.contactIndex! / 2 + 1e-9)));
      // And the live adapter, asked for the same moment after the hit, agrees (the in-game slow-mo replay).
      const { engine, adapter } = setup(level);
      fire(level, adapter, angleDeg, powerPercent);
      for (let i = 0; i < 1800; i++) {
        Matter.Engine.update(engine, PHYSICS.fixedStepSeconds * 1000);
        if (adapter.stepProjectile(level, PROJECTILE.radiusMetres)!.hitJonh) break;
      }
      expect(adapter.jonhRoutePoseAt(contactT)).toEqual(sampleRecordedJonh(shot, contactT));
      expect(adapter.jonhRoutePoseAt(contactT + 3)).toEqual(sampleRecordedJonh(shot, contactT));
      expect(adapter.jonhRoutePoseAt(contactT / 2)).toEqual(sampleRecordedJonh(shot, contactT / 2));
    }
  });
});

describe('The Afternoon Stroll is a timing challenge', () => {
  it('the walk changes which aims hit at every target position', () => {
    for (const position of STROLL_LEVEL.multiplayerPositions) {
      const walking = levelAtMultiplayerPosition(STROLL_LEVEL, position.id);
      const still: LevelData = { ...walking };
      delete still.jonhRoute;
      let differ = 0;
      for (let angle = 40; angle <= 70; angle += 5) {
        for (let power = 30; power <= 60; power += 5) {
          const a = runHeadlessShot(walking, angle, power).outcome === 'body';
          const b = runHeadlessShot(still, angle, power).outcome === 'body';
          if (a !== b) differ++;
        }
      }
      expect(differ, position.id).toBeGreaterThan(0);
    }
  }, 60_000);

  it('has an obstacle that blocks low shots and a route that walks into the shade of the tree', () => {
    expect(STROLL_LEVEL.obstacles.find(o => o.id === 'hedge')!.box.maxY).toBeGreaterThan(5);
    const canopy = STROLL_LEVEL.obstacles.find(o => o.id === 'pear-tree')!.box;
    const end = Math.max(...STROLL_LEVEL.jonhRoute!.waypoints.map(w => w.dx)) + STROLL_LEVEL.jonhSpawn.bodyBox.minX;
    expect(end).toBeGreaterThan(canopy.minX);
  });
});
