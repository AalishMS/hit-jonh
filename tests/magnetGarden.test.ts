import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { AudioManager } from '../src/audio/audioManager';
import { AIM, MAGNET, PHYSICS, SHOT } from '../src/config/tuning';
import { fieldGlow, fieldRings, magnetSparks } from '../src/fx/magnetVisuals';
import { MAGNET_LEVEL, MAP_PRESETS, MAPS } from '../src/levels';
import { levelAtMultiplayerPosition } from '../src/levels/multiplayerPositions';
import type { LevelData } from '../src/levels/types';
import { validateLevel } from '../src/levels/validation';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { recordShot } from '../src/physics/shotRecorder';
import { CAMPAIGN_ORDER } from '../src/rules/campaign';
import { MAP_LINES, OBSTACLE_LINES } from '../src/rules/jonhLines';
import { MECHANIC_TIPS } from '../src/rules/mechanicTips';
import { MagnetRenderer } from '../src/render/magnetRenderer';
import { magnetProfile } from '../src/sim/magnet';
import { mapDescription, mapPreview } from '../src/ui/mapPreview';

const isHit = (o: string) => o === 'body' || o === 'ricochet_body';
/** The same garden with the field switched off (the housing stays, as a plain dead obstacle). */
const fieldOff = (level: LevelData): LevelData => ({ ...level, magnet: undefined } as unknown as LevelData);
const positions = () => MAGNET_LEVEL.multiplayerPositions.map(p => levelAtMultiplayerPosition(MAGNET_LEVEL, p.id));

/** Every shot of a 3° × 3% aim grid at every target position, with and without the field (computed once). */
let gridCache: Array<{ angle: number; power: number; on: ReturnType<typeof runHeadlessShot>; off: ReturnType<typeof runHeadlessShot> }> | null = null;
function grid() {
  if (gridCache) return gridCache;
  gridCache = [];
  for (const level of positions()) {
    for (let angle = AIM.minAngleDeg; angle <= AIM.maxAngleDeg; angle += 3) {
      for (let power = 0; power <= 100; power += 3) {
        gridCache.push({ angle, power, on: runHeadlessShot(level, angle, power), off: runHeadlessShot(fieldOff(level), angle, power) });
      }
    }
  }
  return gridCache;
}

describe('magnet garden: The Scrapyard', () => {
  it('is a magnet map in every mode, after the first four chapters in the campaign, with three target positions', () => {
    expect(MAGNET_LEVEL.mechanic).toBe('magnet');
    expect(MAPS).toContain(MAGNET_LEVEL);
    expect(CAMPAIGN_ORDER.indexOf('magnet')).toBeGreaterThan(CAMPAIGN_ORDER.indexOf('valley'));
    expect(MAP_PRESETS.find(p => p.id === 'new')!.maps).toContain('magnet');
    expect(MAGNET_LEVEL.multiplayerPositions).toHaveLength(3);
    expect(MAGNET_LEVEL.ground.material).toBe('gravel');
    expect(MECHANIC_TIPS.magnet).toBe('The magnet pulls the ball. Aim to one side and let it curve in.');
    for (const kind of ['arrival', 'miss', 'hit'] as const) expect(MAP_LINES.magnet![kind].length).toBeGreaterThan(0);
    expect(OBSTACLE_LINES.find(e => e.match.material === 'magnet')!.lines.length).toBeGreaterThan(0);
    expect(mapDescription('magnet')).not.toBe('Find a way to Jonh.');
  });

  it('keeps its magnet within the validated limits: weaker than gravity, in a housing, clear of the cannon', () => {
    const m = MAGNET_LEVEL.magnet!;
    expect(m.accelerationMs2).toBeLessThan(PHYSICS.gravity * MAGNET.maxShareOfGravity + 1e-9);
    expect(m.radius).toBeLessThanOrEqual(MAGNET.maxRadiusMetres);
    const housing = MAGNET_LEVEL.obstacles.find(o => o.id === m.housingId)!;
    expect(housing.material).toBe('magnet');
    // Hung right over the car stack, from a cable out of shot.
    const stack = MAGNET_LEVEL.obstacles.find(o => o.id === 'car-stack')!.box;
    expect(m.x).toBeGreaterThan(stack.minX);
    expect(m.x).toBeLessThan(stack.maxX);
    expect(housing.box.minY).toBeGreaterThan(stack.maxY + 2);
    const cfg = { maxSpeedMs: AIM.maxImpulseNs / 4, dtSeconds: PHYSICS.fixedStepSeconds, minThicknessMetres: 0.2 };
    for (const level of positions()) expect(validateLevel(level, cfg).errors).toEqual([]);
  });

  it('the magnet matters: every reference solution hits with it and misses with the field off', () => {
    const solutions = [
      ...MAGNET_LEVEL.referenceSolutions.map(s => ({ level: MAGNET_LEVEL, ...s })),
      ...MAGNET_LEVEL.multiplayerPositions.flatMap(p =>
        p.referenceSolutions.map(s => ({ level: levelAtMultiplayerPosition(MAGNET_LEVEL, p.id), ...s }))),
    ];
    expect(solutions.length).toBeGreaterThanOrEqual(6);
    for (const { level, angleDeg, powerPercent } of solutions) {
      expect(isHit(runHeadlessShot(level, angleDeg, powerPercent).outcome), `${angleDeg}/${powerPercent}`).toBe(true);
      expect(isHit(runHeadlessShot(fieldOff(level), angleDeg, powerPercent).outcome), `field off ${angleDeg}/${powerPercent}`).toBe(false);
    }
  });

  it('a straight shot misses: most aims that hit with the field off miss with it on, and most hits need the magnet', () => {
    const shots = grid();
    const off = shots.filter(s => isHit(s.off.outcome));
    const on = shots.filter(s => isHit(s.on.outcome));
    const both = on.filter(s => isHit(s.off.outcome));
    expect(off.length).toBeGreaterThan(50);
    expect(on.length).toBeGreaterThan(30);
    // Measured: 21 % of the field-off hits survive, 56 % of the hits need the magnet (3° × 3% grid).
    expect(both.length / off.length).toBeLessThan(0.25);
    expect((on.length - both.length) / on.length).toBeGreaterThan(0.5);
  }, 180_000);

  it('never traps the ball: every aim resolves well before the safety timeout, with or without the field', () => {
    const shots = grid();
    const timeoutSteps = Math.ceil(SHOT.timeoutSeconds / PHYSICS.fixedStepSeconds);
    const slowest = Math.max(...shots.map(s => s.on.steps));
    const slowestOff = Math.max(...shots.map(s => s.off.steps));
    // Measured: 9.0 s with the field (a ball swinging under the magnet after clipping the stack), 8.3 s without.
    expect(slowest * PHYSICS.fixedStepSeconds).toBeLessThan(11);
    expect(slowest).toBeLessThan(timeoutSteps);
    expect(slowest - slowestOff).toBeLessThan(2 / PHYSICS.fixedStepSeconds);
    for (const s of shots) expect(Number.isNaN(s.on.endXSim), `${s.angle}/${s.power}`).toBe(false);
  }, 180_000);

  it('never lets a fast ball through the stack, the magnet or into Jonh, at any angle (swept guard in the field)', () => {
    const solids = [...MAGNET_LEVEL.obstacles.map(o => o.box), MAGNET_LEVEL.jonhSpawn.bodyBox];
    for (let angle = AIM.minAngleDeg; angle <= AIM.maxAngleDeg; angle += 4) {
      for (const power of [100, 75]) {
        const shot = recordShot(MAGNET_LEVEL, angle, power, 4);
        for (const p of shot.points) {
          const x = p.x / 50;
          const y = (560 - p.y) / 50;
          for (const box of solids) {
            const inside = x > box.minX + 1e-3 && x < box.maxX - 1e-3 && y > box.minY + 1e-3 && y < box.maxY - 1e-3;
            expect(inside, `${angle}/${power} at t=${p.t.toFixed(2)}`).toBe(false);
          }
        }
      }
    }
  });

  it('the title-screen / winning-shot recording of a reference solution curves in and hits Jonh', () => {
    const ref = MAGNET_LEVEL.referenceSolutions[0]!;
    const pulled = recordShot(MAGNET_LEVEL, ref.angleDeg, ref.powerPercent);
    expect(pulled.contactIndex).not.toBeNull();
    const plain = recordShot(fieldOff(MAGNET_LEVEL), ref.angleDeg, ref.powerPercent);
    expect(plain.contactIndex).toBeNull();
    expect(pulled.points[150]!.y).not.toBe(plain.points[150]!.y);
  });

  it('the map thumbnail draws the magnet and its reach only for magnet maps', () => {
    expect(mapPreview('magnet')).toContain('class="map-magnet"');
    for (const level of MAPS.filter(m => !m.magnet)) expect(mapPreview(level.id)).not.toContain('map-magnet');
  });
});

describe('magnet visuals (pure)', () => {
  const R = MAGNET_LEVEL.magnet!.radius;
  const full = magnetProfile(R).fullRadius;

  it('rings sit between the inner ring and the reach, and drift inwards over time', () => {
    for (const t of [0, 0.3, 1.1, 2.9, 17]) {
      const rings = fieldRings(R, full, t);
      expect(rings).toHaveLength(MAGNET.ringCount);
      for (const ring of rings) {
        expect(ring.r).toBeGreaterThanOrEqual(full - 1e-9);
        expect(ring.r).toBeLessThanOrEqual(R + 1e-9);
        expect(ring.alpha).toBeGreaterThanOrEqual(0);
        expect(ring.alpha).toBeLessThanOrEqual(MAGNET.ringAlpha);
      }
    }
    // A short moment later every ring is a little further in (none has wrapped round in that time).
    const a = fieldRings(R, full, 0.5);
    const b = fieldRings(R, full, 0.55);
    a.forEach((ring, i) => expect(b[i]!.r).toBeLessThan(ring.r));
  });

  it('glows with the ball\'s proximity and sparks only when it is close', () => {
    expect(fieldGlow(0)).toBe(0);
    expect(fieldGlow(1)).toBe(1);
    expect(fieldGlow(0.7)).toBeGreaterThan(fieldGlow(0.3));
    expect(magnetSparks(MAGNET.sparkProximity - 0.01)).toBe(false);
    expect(magnetSparks(1)).toBe(true);
  });
});

/** A stand-in scene that records what the renderer creates and draws. */
function mockScene() {
  const created: Array<{ kind: string; obj: Record<string, unknown>; calls: Array<[string, unknown[]]> }> = [];
  const make = (kind: string) => {
    const obj: Record<string, unknown> = { destroyed: false, alpha: 1 };
    const calls: Array<[string, unknown[]]> = [];
    const proxy: unknown = new Proxy(obj, {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          if (prop === 'setAlpha') target.alpha = args[0];
          if (prop === 'destroy') target.destroyed = true;
          if (prop === 'clear') calls.length = 0;
          return proxy;
        };
      },
    });
    created.push({ kind, obj, calls });
    return proxy;
  };
  const scene = { add: { graphics: () => make('graphics') } };
  return { scene: scene as unknown as Phaser.Scene, created };
}

describe('MagnetRenderer', () => {
  /** Radii (px) of the full circles the drifting-ring layer drew last. */
  const ringRadii = (created: ReturnType<typeof mockScene>['created']) =>
    created[2]!.calls.filter(([name]) => name === 'strokeCircle').map(([, args]) => args[2] as number);

  it('draws nothing on a map without a magnet', () => {
    const { scene, created } = mockScene();
    const r = new MagnetRenderer(scene, 50, 560);
    r.draw(MAPS[0]!);
    expect(created).toHaveLength(0);
    expect(r.active).toBe(false);
    r.follow({ x: 600, y: 100 });
    expect(r.proximity).toBe(0);
    r.update(0.016, false);
  });

  it('draws the cable, rings and glow; the glow follows the ball and the rings drift unless motion is reduced', () => {
    const { scene, created } = mockScene();
    const r = new MagnetRenderer(scene, 50, 560);
    r.draw(MAGNET_LEVEL);
    expect(r.active).toBe(true);
    expect(created.map(c => c.kind)).toEqual(['graphics', 'graphics', 'graphics', 'graphics', 'graphics']);
    // The cable runs from above the world's top down to the housing.
    const cable = created[0]!.calls.filter(([name]) => name === 'lineBetween').map(([, a]) => a as number[]);
    expect(Math.min(...cable.map(a => Math.min(a[1]!, a[3]!)))).toBeLessThan(0);
    const glow = created[3]!.obj;
    expect(glow.alpha).toBe(0);
    const m = MAGNET_LEVEL.magnet!;
    r.follow({ x: m.x * 50, y: 560 - (m.y - 1) * 50 });
    expect(r.proximity).toBe(1);
    r.update(0.016, false);
    expect(glow.alpha).toBe(1);
    r.follow(null);
    r.update(0.016, false);
    expect(glow.alpha).toBe(0);
    const before = ringRadii(created);
    r.update(0.4, false);
    expect(ringRadii(created)).not.toEqual(before);
    // Reduced motion: the rings hold still where they start (t = 0), however much time passes.
    r.update(0.4, true);
    const held = ringRadii(created);
    r.update(0.7, true);
    expect(ringRadii(created)).toEqual(held);
    expect(held).toEqual(fieldRings(m.radius, magnetProfile(m.radius).fullRadius, 0).flatMap(ring => [ring.r * 50, ring.r * 50])); // a soft edge under a bright line
  });

  it('clears and rebuilds for the next map', () => {
    const { scene, created } = mockScene();
    const r = new MagnetRenderer(scene, 50, 560);
    r.draw(MAGNET_LEVEL);
    r.draw(MAPS[0]!);
    expect(created.every(c => c.obj.destroyed)).toBe(true);
    expect(r.active).toBe(false);
  });
});

describe('magnet hum', () => {
  /** A stand-in AudioContext (there is no WebAudio in node). */
  function fakeContext() {
    let oscillators = 0;
    const param = () => ({
      value: 0,
      setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; },
      setTargetAtTime() { return this; }, cancelScheduledValues() { return this; },
    });
    const node = (extra: Record<string, unknown> = {}) => ({ connect: (to: unknown) => to, disconnect() {}, start() {}, stop() {}, ...extra });
    const ctx = {
      currentTime: 0, sampleRate: 48000, state: 'running', destination: node(),
      createGain() { return node({ gain: param() }); },
      createOscillator() { oscillators++; return node({ frequency: param(), type: 'sine' }); },
      createBufferSource() { return node({ buffer: null, loop: false, playbackRate: param() }); },
      createBiquadFilter() { return node({ frequency: param(), Q: param(), type: 'lowpass' }); },
      createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); },
      createWaveShaper() { return node({ curve: null, oversample: 'none' }); },
      createAnalyser() { return node({ fftSize: 0 }); },
      createBuffer(_c: number, length: number) { const data = new Float32Array(length); return { getChannelData: () => data }; },
      decodeAudioData: () => Promise.resolve({}),
      resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve(),
    };
    return { ctx: ctx as unknown as OfflineAudioContext, oscillators: () => oscillators };
  }

  it('swells while the ball is near the magnet and stops when it is not (or when muted)', () => {
    const fake = fakeContext();
    const audio = new AudioManager(() => 0.5);
    audio.attachContext(fake.ctx);
    const before = fake.oscillators();
    audio.setMagnetHum(null);
    expect(audio.magnetHumPlaying).toBe(false);
    audio.setMagnetHum(0.6);
    expect(audio.magnetHumPlaying).toBe(true);
    expect(fake.oscillators() - before).toBe(2);
    audio.setMagnetHum(0.9);
    expect(fake.oscillators() - before).toBe(2); // the same hum, louder
    audio.setMagnetHum(0);
    expect(audio.magnetHumPlaying).toBe(false);
    audio.setMuted(true);
    audio.setMagnetHum(1);
    expect(audio.magnetHumPlaying).toBe(false);
    audio.destroy();
  });
});
