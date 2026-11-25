import { describe, expect, it } from 'vitest';
import Matter, { type Body } from '@matter-js';
import { AIM, FX, MATERIALS, PHYSICS, PROJECTILE, SHOT, WORLD } from '../src/config/tuning';
import { fastForwardTarget, slideReachMetres } from '../src/fx/settleClock';
import { MAP_PRESETS, MAPS, POND_LEVEL } from '../src/levels';
import { jonhAt } from '../src/levels/build';
import { levelPhysics } from '../src/levels/levelPhysics';
import { levelAtMultiplayerPosition } from '../src/levels/multiplayerPositions';
import type { LevelData } from '../src/levels/types';
import { validateLevel } from '../src/levels/validation';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { MatterAdapter, type ProjectileState } from '../src/physics/matterAdapter';
import { recordShot } from '../src/physics/shotRecorder';
import { CAMPAIGN_ORDER } from '../src/rules/campaign';
import { MAP_LINES } from '../src/rules/jonhLines';
import { MECHANIC_TIPS } from '../src/rules/mechanicTips';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { FixedStepper } from '../src/sim/fixedStep';
import { launchVelocityToWorld, matterGravityY, muzzleSpawnPx } from '../src/sim/units';
import { mapDescription, mapPreview } from '../src/ui/mapPreview';

const PPM = WORLD.pixelsPerMetre;
const H = WORLD.designHeightPx;
const R = PROJECTILE.radiusMetres;
const DT = PHYSICS.fixedStepSeconds;
const ICE = POND_LEVEL.obstacles.find(o => o.id === 'pond-ice')!;
const ICE_TOP = ICE.box.maxY;
const SLIDE_FRICTION = MATERIALS.ice.slideFrictionMs2;

const isHit = (o: string) => o === 'body' || o === 'ricochet_body';
/** The same garden with the pond made of another material (same geometry). */
const pondOf = (level: LevelData, material: string): LevelData =>
  ({ ...level, obstacles: level.obstacles.map(o => o.id === 'pond-ice' ? { ...o, material } : o) });
const positions = () => POND_LEVEL.multiplayerPositions.map(p => ({ id: p.id, level: levelAtMultiplayerPosition(POND_LEVEL, p.id), refs: p.referenceSolutions }));

interface Step { state: ProjectileState; body: Body; resolved: boolean; reason: string | null }

/** Flies one shot through the real adapter and shot rules, keeping every fixed step. */
function fly(level: LevelData, angle: number, power: number): Step[] {
  const physics = levelPhysics(level);
  const engine = Matter.Engine.create({ gravity: { x: 0, y: matterGravityY(physics.gravity, PPM, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale } });
  const adapter = new MatterAdapter(engine.world, PPM, H);
  adapter.setupLevel(level);
  const start = muzzleSpawnPx(level.cannonSpawn, angle, AIM.barrelLengthMetres + R + AIM.muzzleGapMetres, PPM, H);
  const body = adapter.spawnProjectile(start.x, start.y, R * PPM, launchVelocityToWorld(physics.launchSpeed(power), angle, PPM));
  const attempt = new ShotAttemptMachine(level.bounds.maxX, SHOT.settledSpeedMs, SHOT.settledSeconds, SHOT.timeoutSeconds, SHOT.boundsMarginMetres, level.bounds.minY);
  attempt.fire(angle, power);
  const steps: Step[] = [];
  for (let i = 0; i < Math.ceil(SHOT.timeoutSeconds / DT) + 1; i++) {
    Matter.Engine.update(engine, DT * 1000);
    const state = adapter.stepProjectile(level, R)!;
    const r = attempt.step(DT, { x: state.xSim, y: state.ySim, speed: state.speedMs, hitBody: state.hitJonh, hitHat: state.hitHat });
    steps.push({ state, body, resolved: r.resolved, reason: attempt.missReason });
    if (r.resolved) return steps;
  }
  throw new Error(`${angle}/${power} never resolved`);
}

/** What touched the ball first: 'jonh', an obstacle id or 'ground'; null if nothing did. */
function firstContact(steps: Step[]): { what: string; x: number } | null {
  for (const { state: s } of steps) {
    if (s.hitJonh) return { what: 'jonh', x: s.xSim };
    if (s.obstacleContacts.length > 0) return { what: s.obstacleContacts[0]!.id, x: s.xSim };
    if (s.hitGround) return { what: 'ground', x: s.xSim };
  }
  return null;
}

describe('ice garden: Frozen Pond', () => {
  it('is an ice garden in every mode, last in the campaign and in the Trick shots preset', () => {
    expect(MAPS.at(-1)).toBe(POND_LEVEL);
    expect(POND_LEVEL.mechanic).toBe('ice');
    expect(CAMPAIGN_ORDER.at(-1)).toBe('pond');
    expect(MAP_PRESETS.find(p => p.id === 'new')!.maps).toContain('pond');
    expect(POND_LEVEL.multiplayerPositions).toHaveLength(3);
    expect(POND_LEVEL.ground.material).toBe('snow');
    expect(ICE.material).toBe('ice');
    for (const part of ['hut-roof', 'hut-door', 'hut-back']) expect(POND_LEVEL.obstacles.some(o => o.id === part)).toBe(true);
    expect(MECHANIC_TIPS.ice).toMatch(/short/i);
    for (const k of ['arrival', 'miss', 'hit'] as const) expect(MAP_LINES.pond![k].length).toBeGreaterThan(0);
    expect(MAP_LINES.pond!.arrival).toContain(POND_LEVEL.arrivalLine);
    expect(mapDescription('pond')).not.toBe('Find a way to Jonh.');
    expect(mapPreview('pond')).toContain('class="map-ice"');
    for (const level of MAPS.filter(m => m.id !== 'pond')) expect(mapPreview(level.id)).not.toContain('map-ice');
  });

  it('ice is frictionless in Matter, does not damp a roll, and slows a skid evenly; snow swallows a landing', () => {
    expect(MATERIALS.ice.friction).toBe(0);
    expect(MATERIALS.ice.rollingDamping).toBe(1);
    expect(SLIDE_FRICTION).toBeGreaterThan(0);
    expect(SLIDE_FRICTION).toBeLessThan(3);
    expect(MATERIALS.ice.restitution).toBeLessThanOrEqual(MATERIALS.grass.restitution);
    expect(MATERIALS.snow.tangentKept).toBeLessThan(0.5);
  });

  it('ice matters: every reference solution lands short on the ice and slides in, and stops short on snow or grass', () => {
    const shots = [
      ...POND_LEVEL.referenceSolutions.map(s => ({ level: POND_LEVEL, ...s })),
      ...positions().flatMap(p => p.refs.map(s => ({ level: p.level, ...s }))),
    ];
    expect(shots.length).toBeGreaterThanOrEqual(6);
    for (const { level, angleDeg, powerPercent } of shots) {
      const tag = `${level.jonhSpawn.bodyBox.minX}: ${angleDeg}/${powerPercent}`;
      const steps = fly(level, angleDeg, powerPercent);
      expect(steps.at(-1)!.state.hitJonh, tag).toBe(true);
      // It landed on the open ice in front of the hut, a long way short of Jonh, and skidded in.
      const door = level.obstacles.find(o => o.id === 'hut-door')!.box;
      const landed = firstContact(steps)!;
      expect(landed.what, tag).toBe('pond-ice');
      expect(landed.x, tag).toBeLessThan(door.minX);
      expect(level.jonhSpawn.bodyBox.minX - landed.x, tag).toBeGreaterThan(3);
      // From the landing on, it stays on the ice (no skipping) and glides most of the way.
      const after = steps.slice(steps.findIndex(s => s.state.obstacleContacts.length > 0));
      for (const s of after) expect(s.state.ySim - (ICE_TOP + R), tag).toBeLessThan(0.05);
      expect(after.filter(s => s.state.slidingOn === 'ice').length / after.length, tag).toBeGreaterThan(0.6);
      for (const material of ['snow', 'grass']) {
        expect(isHit(runHeadlessShot(pondOf(level, material), angleDeg, powerPercent).outcome), `${tag} on ${material}`).toBe(false);
      }
    }
  });

  it('the hut blocks everything else: on a 5°×5% grid every hit skidded in along the ice, and with no ice nothing hits', () => {
    for (const { id, level } of positions()) {
      let hits = 0;
      for (let angle = AIM.minAngleDeg; angle <= AIM.maxAngleDeg; angle += 5) {
        for (let power = 0; power <= 100; power += 5) {
          const steps = fly(level, angle, power);
          const end = steps.at(-1)!.state;
          if (end.hitJonh) {
            hits++;
            // On the ice before it reached him (a few skim in under the door, grazing its edge, then land).
            expect(end.obstacleContacts.map(o => o.id), `${id} ${angle}/${power}`).toContain('pond-ice');
            expect(firstContact(steps)!.what, `${id} ${angle}/${power}`).not.toBe('jonh');
          }
          expect(isHit(runHeadlessShot(pondOf(level, 'snow'), angle, power).outcome), `${id} ${angle}/${power} on snow`).toBe(false);
        }
      }
      expect(hits, id).toBeGreaterThan(0);
    }
  }, 120_000);

  it('a plain lob is blocked: lobs that would drop straight onto Jonh land on the hut roof', () => {
    const noHut: LevelData = { ...POND_LEVEL, obstacles: POND_LEVEL.obstacles.filter(o => !o.id.startsWith('hut-')) };
    for (const [angle, power] of [[55, 50], [60, 53], [65, 60], [70, 68]] as const) {
      expect(firstContact(fly(noHut, angle, power))!.what, `${angle}/${power} without the hut`).toBe('jonh');
      const real = fly(POND_LEVEL, angle, power);
      expect(firstContact(real)!.what, `${angle}/${power}`).toBe('hut-roof');
      expect(real.at(-1)!.state.hitJonh).toBe(false);
    }
  });

  it('the ball skids: it keeps its speed on landing, rides the ice without spinning or bobbing, and slows at the slide friction', () => {
    const ref = POND_LEVEL.referenceSolutions[0]!;
    const steps = fly(POND_LEVEL, ref.angleDeg, ref.powerPercent);
    const firstSlide = steps.findIndex(s => s.state.slidingOn === 'ice');
    expect(firstSlide).toBeGreaterThan(0);
    const before = steps.findIndex(s => s.state.obstacleContacts.length > 0) - 1;
    // Nearly all the horizontal speed survives the landing (the bounce never brakes it along the ice).
    expect(steps[firstSlide]!.state.vxSim).toBeGreaterThan(0.95 * steps[before]!.state.vxSim);
    const gliding = steps.filter(s => s.state.slidingOn === 'ice');
    for (const s of gliding) {
      expect(s.state.ySim).toBeCloseTo(ICE_TOP + R, 9);
      expect(Math.abs(s.state.vySim)).toBe(0);
      expect(s.body.angularVelocity).toBe(0);
    }
    for (let i = firstSlide + 1; i < steps.length - 1; i++) {
      const [a, b] = [steps[i - 1]!.state, steps[i]!.state];
      if (a.slidingOn !== 'ice' || b.slidingOn !== 'ice') continue;
      expect(a.vxSim - b.vxSim).toBeCloseTo(SLIDE_FRICTION * DT, 6);
    }
  });

  it('a long, slow slide is never cut short: it keeps going past the settle threshold and well inside the timeout', () => {
    // A high lob that lands on the open ice slowly, glides for over a second and creeps the last of the
    // way into Jonh at under 2 m/s.
    const steps = fly(POND_LEVEL, 67, 48);
    const end = steps.at(-1)!.state;
    expect(end.hitJonh).toBe(true);
    expect(steps.filter(s => s.state.slidingOn === 'ice').length * DT).toBeGreaterThan(1);
    expect(steps.filter(s => s.state.slidingOn === 'ice' && s.state.speedMs < 2).length * DT).toBeGreaterThan(0.5);
    expect(end.impactSpeedMs).toBeLessThan(2);
    expect(steps.length * DT).toBeLessThan(SHOT.timeoutSeconds / 3);
    // Presentation: a skid that will reach Jonh plays in real time; one that will stop well short may hurry.
    const jonh = POND_LEVEL.jonhSpawn.bodyBox;
    const hurry = (vx: number, x: number) => fastForwardTarget({
      landed: true, speedMs: Math.abs(vx), distanceToJonhMetres: jonh.minX - x, impactActive: false,
      slideReachMetres: slideReachMetres(vx, true, SLIDE_FRICTION),
    });
    expect(hurry(3, jonh.minX - 3.5)).toBe(1); // reaches him (3²/2.4 ≈ 3.75 m)
    expect(hurry(1, jonh.minX - 5)).toBe(FX.settleFastForward); // stops 4.6 m short
    expect(hurry(-2, jonh.minX - 4)).toBe(FX.settleFastForward); // skidding away from him
    expect(slideReachMetres(-2, true, SLIDE_FRICTION)).toBe(0);
    expect(slideReachMetres(2, false, SLIDE_FRICTION)).toBe(0);
    expect(slideReachMetres(2, true, undefined)).toBe(0);
  });

  it('a ball that skids off the end of the ice drops onto the snow and stops dead', () => {
    // The pond with no hut and Jonh far off on the snow: a reference shot skids the whole pond.
    const open: LevelData = { ...POND_LEVEL, jonhSpawn: jonhAt(25, POND_LEVEL.ground.maxY), obstacles: [ICE] };
    const ref = POND_LEVEL.referenceSolutions[0]!;
    const steps = fly(open, ref.angleDeg, ref.powerPercent);
    const end = steps.at(-1)!;
    expect(end.state.hitJonh).toBe(false);
    expect(end.reason).toBe('settled');
    // Off the end it drops 0.25 m onto the snow, which swallows it: it stops within a metre of landing.
    const onSnow = steps.find(s => s.state.hitGround)!.state;
    expect(onSnow.xSim).toBeGreaterThan(ICE.box.maxX);
    expect(end.state.xSim - onSnow.xSim).toBeLessThan(1);
    expect(end.state.ySim).toBeCloseTo(POND_LEVEL.ground.maxY + R, 1);
    expect(steps.length * DT).toBeLessThan(6);
  });

  it('snow swallows a ball: one that lands short of the pond stops within a metre', () => {
    for (const [angle, power] of [[5, 60], [5, 75], [10, 35]] as const) {
      const steps = fly(POND_LEVEL, angle, power);
      const landed = firstContact(steps)!;
      expect(landed.what).toBe('ground');
      expect(steps.at(-1)!.reason).toBe('settled');
      expect(steps.at(-1)!.state.xSim - landed.x).toBeLessThan(1);
      expect(steps.at(-1)!.state.xSim).toBeLessThan(ICE.box.minX);
    }
  });

  it('target positions move his hut and its ice with him; nothing moves on any other map', () => {
    const before = JSON.stringify(POND_LEVEL);
    for (const p of POND_LEVEL.multiplayerPositions) {
      const level = levelAtMultiplayerPosition(POND_LEVEL, p.id);
      level.obstacles.forEach((o, i) => {
        const base = POND_LEVEL.obstacles[i]!;
        expect(o.box.minX).toBeCloseTo(base.box.minX + p.offsetX, 9);
        expect(o.box.maxY).toBe(base.box.maxY);
      });
      expect(validateLevel(level, { maxSpeedMs: AIM.maxImpulseNs / PROJECTILE.massKg, dtSeconds: DT, minThicknessMetres: 0.2 }).valid).toBe(true);
    }
    expect(JSON.stringify(POND_LEVEL)).toBe(before);
    for (const base of MAPS.filter(m => m.id !== 'pond')) {
      for (const p of base.multiplayerPositions) expect(levelAtMultiplayerPosition(base, p.id).obstacles).toBe(base.obstacles);
    }
  });

  it('is frame-rate independent: same outcome, end point and step count at 30, 60 and 144 Hz', () => {
    const run = (hz: number, angle: number, power: number) => {
      const level = POND_LEVEL;
      const physics = levelPhysics(level);
      const engine = Matter.Engine.create({ gravity: { x: 0, y: matterGravityY(physics.gravity, PPM, PHYSICS.matterGravityScale), scale: PHYSICS.matterGravityScale } });
      const adapter = new MatterAdapter(engine.world, PPM, H);
      adapter.setupLevel(level);
      const start = muzzleSpawnPx(level.cannonSpawn, angle, AIM.barrelLengthMetres + R + AIM.muzzleGapMetres, PPM, H);
      adapter.spawnProjectile(start.x, start.y, R * PPM, launchVelocityToWorld(physics.launchSpeed(power), angle, PPM));
      const stepper = new FixedStepper(DT, PHYSICS.maxStepsPerFrame);
      const attempt = new ShotAttemptMachine(level.bounds.maxX, SHOT.settledSpeedMs, SHOT.settledSeconds, SHOT.timeoutSeconds, SHOT.boundsMarginMetres, level.bounds.minY);
      attempt.fire(angle, power);
      let steps = 0;
      for (let frame = 0; frame < hz * 30; frame++) {
        for (let i = stepper.advance(1 / hz); i > 0; i--) {
          Matter.Engine.update(engine, DT * 1000);
          steps++;
          const s = adapter.stepProjectile(level, R)!;
          const r = attempt.step(DT, { x: s.xSim, y: s.ySim, speed: s.speedMs, hitBody: s.hitJonh, hitHat: s.hitHat });
          if (r.resolved) return { steps, x: s.xPx, y: s.yPx, hit: s.hitJonh, reason: attempt.missReason };
        }
      }
      throw new Error('unresolved');
    };
    for (const [angle, power] of [[22, 42], [67, 48], [30, 50]] as const) {
      const base = run(60, angle, power);
      expect(run(30, angle, power)).toEqual(base);
      expect(run(144, angle, power)).toEqual(base);
    }
  });

  it('the title-screen / winning-shot recording of a reference solution skids in and hits Jonh at the same step', () => {
    for (const { level, refs } of positions()) {
      const ref = refs[0]!;
      const recorded = recordShot(level, ref.angleDeg, ref.powerPercent);
      expect(recorded.contactIndex).not.toBeNull();
      expect(recorded.contactIndex).toBe(runHeadlessShot(level, ref.angleDeg, ref.powerPercent).steps);
      // The recorded path runs along the ice top for a while before the hit.
      const onIce = recorded.points.filter(p => Math.abs((H - p.y) / PPM - (ICE_TOP + R)) < 1e-9);
      expect(onIce.length).toBeGreaterThan(10);
    }
  });

  it('never lets a fast ball through the door, the roof, the ice or into Jonh, at any angle', () => {
    for (const { level } of positions()) {
      const solids = [...level.obstacles.map(o => o.box), level.jonhSpawn.bodyBox];
      for (let angle = AIM.minAngleDeg; angle <= AIM.maxAngleDeg; angle += 4) {
        for (const power of [100, 75, 40]) {
          for (const p of recordShot(level, angle, power, 6).points) {
            const x = p.x / PPM;
            const y = (H - p.y) / PPM;
            for (const box of solids) {
              const inside = x > box.minX + 1e-3 && x < box.maxX - 1e-3 && y > box.minY + 1e-3 && y < box.maxY - 1e-3;
              expect(inside, `${angle}/${power} at t=${p.t.toFixed(2)}`).toBe(false);
            }
          }
        }
      }
    }
  }, 60_000);
});
