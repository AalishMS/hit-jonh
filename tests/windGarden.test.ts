import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { WIND_ART } from '../src/art/windArt';
import { AIM, WIND } from '../src/config/tuning';
import { sockChain, SOCK, sockLift, streakAlpha, streakDriftPxPerSecond, windCaption, windDirection, windSpoken } from '../src/fx/windVisuals';
import { MAPS, WASHDAY_LEVEL } from '../src/levels';
import { levelPhysics } from '../src/levels/levelPhysics';
import { levelAtMultiplayerPosition } from '../src/levels/multiplayerPositions';
import type { LevelData } from '../src/levels/types';
import { runHeadlessShot } from '../src/physics/headlessShot';
import { recordShot } from '../src/physics/shotRecorder';
import { CAMPAIGN_ORDER } from '../src/rules/campaign';
import { MAP_LINES } from '../src/rules/jonhLines';
import { registerArtMeta } from '../src/render/artTextures';
import { WindRenderer } from '../src/render/windRenderer';
import { mapDescription, mapPreview } from '../src/ui/mapPreview';

const isHit = (o: string) => o === 'body' || o === 'ricochet_body';
/** The same level with the wind removed. */
const calm = (level: LevelData): LevelData => ({ ...level, wind: undefined } as unknown as LevelData);

describe('wind garden: Windy Washday', () => {
  it('is a windy map with a blocking wall, in every mode and the Trick shots preset', () => {
    expect(WASHDAY_LEVEL.wind?.accelerationMs2).toBeLessThan(0);
    expect(MAPS).toContain(WASHDAY_LEVEL);
    expect(WASHDAY_LEVEL.multiplayerPositions).toHaveLength(3);
    expect(WASHDAY_LEVEL.obstacles.some(o => o.id === 'garden-wall')).toBe(true);
    expect(levelPhysics(WASHDAY_LEVEL).windMs2).toBe(WASHDAY_LEVEL.wind!.accelerationMs2);
    expect(CAMPAIGN_ORDER).toContain('washday');
    expect(MAP_LINES.washday!.arrival.length).toBeGreaterThan(0);
    expect(MAP_LINES.washday!.miss.length).toBeGreaterThan(0);
    expect(MAP_LINES.washday!.hit.length).toBeGreaterThan(0);
    expect(mapDescription('washday')).not.toBe('Find a way to Jonh.');
  });

  it('wind matters: every reference solution hits with the wind and misses without it', () => {
    const solutions = [
      ...WASHDAY_LEVEL.referenceSolutions.map(s => ({ level: WASHDAY_LEVEL, ...s })),
      ...WASHDAY_LEVEL.multiplayerPositions.flatMap(p =>
        p.referenceSolutions.map(s => ({ level: levelAtMultiplayerPosition(WASHDAY_LEVEL, p.id), ...s }))),
    ];
    expect(solutions.length).toBeGreaterThanOrEqual(5);
    for (const { level, angleDeg, powerPercent } of solutions) {
      expect(isHit(runHeadlessShot(level, angleDeg, powerPercent).outcome), `${angleDeg}/${powerPercent}`).toBe(true);
      expect(isHit(runHeadlessShot(calm(level), angleDeg, powerPercent).outcome), `calm ${angleDeg}/${powerPercent}`).toBe(false);
    }
  });

  it('shots that ignore the wind almost always miss: the aims that hit in calm air rarely hit in the wind', () => {
    const calmHits: Array<[number, number]> = [];
    for (let angle = AIM.minAngleDeg; angle <= AIM.maxAngleDeg; angle += 2) {
      for (let power = 0; power <= 100; power += 2) {
        if (isHit(runHeadlessShot(calm(WASHDAY_LEVEL), angle, power).outcome)) calmHits.push([angle, power]);
      }
    }
    expect(calmHits.length).toBeGreaterThan(20);
    const stillHit = calmHits.filter(([a, p]) => isHit(runHeadlessShot(WASHDAY_LEVEL, a, p).outcome));
    expect(stillHit.length / calmHits.length).toBeLessThan(0.15);
  }, 120_000);

  it('never lets a fast ball through the wall or into Jonh, at any angle (swept guard under wind)', () => {
    // Re-uses the real adapter through recordShot: the recorded centre never sits inside a solid.
    const solids = [...WASHDAY_LEVEL.obstacles.map(o => o.box), WASHDAY_LEVEL.jonhSpawn.bodyBox];
    for (let angle = AIM.minAngleDeg; angle <= AIM.maxAngleDeg; angle += 4) {
      for (const power of [100, 75]) {
        const shot = recordShot(WASHDAY_LEVEL, angle, power, 4);
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

  it('the title-screen / winning-shot recording of a reference solution flies in the wind and hits Jonh', () => {
    const ref = WASHDAY_LEVEL.referenceSolutions[0]!;
    const windy = recordShot(WASHDAY_LEVEL, ref.angleDeg, ref.powerPercent);
    expect(windy.contactIndex).not.toBeNull();
    const calmShot = recordShot(calm(WASHDAY_LEVEL), ref.angleDeg, ref.powerPercent);
    expect(calmShot.contactIndex).toBeNull();
    expect(windy.points[60]!.x).toBeLessThan(calmShot.points[60]!.x);
  });

  it('the map thumbnail draws the windsock and arrow only for windy maps', () => {
    expect(mapPreview('washday')).toContain('class="map-wind"');
    for (const level of MAPS.filter(m => !m.wind)) expect(mapPreview(level.id)).not.toContain('map-wind');
  });

  it('keeps wind within the validated limits and clear of the cannon', () => {
    const a = Math.abs(WASHDAY_LEVEL.wind!.accelerationMs2);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(WIND.maxAccelerationMs2);
    expect(WASHDAY_LEVEL.wind!.windsockX!).toBeGreaterThan(WASHDAY_LEVEL.cannonSpawn.x + 2);
    expect(WASHDAY_LEVEL.wind!.windsockX!).toBeLessThan(WASHDAY_LEVEL.obstacles.find(o => o.id === 'garden-wall')!.box.minX);
  });
});

describe('wind visuals (pure)', () => {
  it('captions the wind with its direction and strength', () => {
    expect(windCaption(-3)).toBe('Wind ← 3');
    expect(windCaption(2.5)).toBe('Wind → 2.5');
    expect(windCaption(2.04)).toBe('Wind → 2');
    expect(windCaption(0)).toBe('Calm');
    expect(windSpoken(-3)).toContain('towards the cannon');
    expect(windSpoken(3)).toContain('towards Jonh');
    expect(windDirection(-0.1)).toBe(-1);
    expect(windDirection(4)).toBe(1);
  });

  it('lifts the sock with the wind and flies it level at the flat strength', () => {
    expect(sockLift(0)).toBe(0);
    expect(sockLift(WIND.sockFlatMs2)).toBe(1);
    expect(sockLift(-WIND.sockFlatMs2 * 3)).toBe(1);
    expect(sockLift(-2.5)).toBeCloseTo(0.5, 9);
    const tipY = (lift: number) => sockChain(lift, 0, false).at(-1)!.top.y1;
    expect(tipY(1)).toBeCloseTo(-SOCK.tipPx / 2, 6); // level: the tip sits level with the pole
    expect(tipY(0.2)).toBeGreaterThan(tipY(0.6));
    expect(tipY(0)).toBeGreaterThan(tipY(0.2));
    expect(sockChain(0.5, 0, false)).toHaveLength(SOCK.segments);
  });

  it('flutters over time but holds perfectly still without it (reduced motion)', () => {
    const still = JSON.stringify(sockChain(0.7, 0, false));
    expect(JSON.stringify(sockChain(0.7, 3.3, false))).toBe(still);
    expect(JSON.stringify(sockChain(0.7, 3.3, true))).not.toBe(still);
  });

  it('streaks drift the way the wind blows, faster in a stronger wind', () => {
    expect(streakDriftPxPerSecond(-3)).toBeLessThan(0);
    expect(streakDriftPxPerSecond(3)).toBeGreaterThan(0);
    expect(Math.abs(streakDriftPxPerSecond(6))).toBeGreaterThan(Math.abs(streakDriftPxPerSecond(2)));
    expect(streakAlpha(-6)).toBeGreaterThan(streakAlpha(-1));
    expect(streakAlpha(-1)).toBeGreaterThan(0);
  });
});

registerArtMeta(WIND_ART);

function mockScene() {
  const created: Array<{ kind: string; obj: Record<string, unknown> }> = [];
  const make = (kind: string, extra: Record<string, unknown> = {}) => {
    const obj: Record<string, unknown> = { destroyed: false, x: 0, y: 0, scaleX: 1, scaleY: 1, ...extra };
    const proxy: unknown = new Proxy(obj, {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        return (...args: unknown[]) => {
          if (prop === 'setPosition') { target.x = args[0]; target.y = args[1]; }
          if (prop === 'setScale') { target.scaleX = args[0]; target.scaleY = args[1] ?? args[0]; }
          if (prop === 'setAlpha') target.alpha = args[0];
          if (prop === 'destroy') target.destroyed = true;
          if (prop === 'clear') (target.clears as number)++;
          return proxy;
        };
      },
    });
    created.push({ kind, obj });
    return proxy;
  };
  const scene = {
    add: {
      graphics: () => make('graphics', { clears: 0 }),
      text: (_x: number, _y: number, text: string) => make('text', { text }),
      image: (x: number, y: number, key: string) => make('image', { x, y, texture: { key } }),
    },
  };
  return { scene: scene as unknown as Phaser.Scene, created };
}

describe('WindRenderer', () => {
  it('draws nothing on a calm level', () => {
    const { scene, created } = mockScene();
    const r = new WindRenderer(scene, 50, 560, 1280);
    r.draw(calm(WASHDAY_LEVEL));
    expect(created).toHaveLength(0);
    expect(r.active).toBe(false);
    r.update(0.016, false);
  });

  it('draws the caption, windsock and streaks, and drifts the streaks downwind', () => {
    const { scene, created } = mockScene();
    const r = new WindRenderer(scene, 50, 560, 1280);
    r.draw(WASHDAY_LEVEL);
    expect(r.active).toBe(true);
    expect(created.find(c => c.kind === 'text')!.obj.text).toBe('Wind ← 3');
    const streaks = created.filter(c => c.kind === 'image');
    expect(streaks).toHaveLength(WIND.streakCount);
    const before = streaks.map(s => s.obj.x as number);
    r.update(0.5, false);
    streaks.forEach((s, i) => {
      const moved = (s.obj.x as number) - before[i]!;
      // Headwind drifts left; a streak that wrapped around the world jumps by the world's width instead.
      expect(moved < 0 || moved > 500).toBe(true);
    });
  });

  it('holds still under reduced motion', () => {
    const { scene, created } = mockScene();
    const r = new WindRenderer(scene, 50, 560, 1280);
    r.draw(WASHDAY_LEVEL);
    const streaks = created.filter(c => c.kind === 'image');
    const before = streaks.map(s => s.obj.x as number);
    r.update(0.5, true);
    expect(streaks.map(s => s.obj.x)).toEqual(before);
  });

  it('clears and rebuilds for the next map', () => {
    const { scene, created } = mockScene();
    const r = new WindRenderer(scene, 50, 560, 1280);
    r.draw(WASHDAY_LEVEL);
    r.draw(calm(WASHDAY_LEVEL));
    expect(created.every(c => c.obj.destroyed)).toBe(true);
    expect(r.active).toBe(false);
  });
});
