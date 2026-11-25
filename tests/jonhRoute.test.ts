import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../src/config/tuning';
import { jonhAt, obstacle, GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND } from '../src/levels/build';
import { routeDurationSeconds, routeLegs, routePoseAt, routePoseAtStep, routeSweptBoxes, shiftJonh } from '../src/levels/jonhRoute';
import type { JonhRouteData, LevelData } from '../src/levels/types';
import { validateLevel } from '../src/levels/validation';

const ROUTE: JonhRouteData = {
  waypoints: [
    { dx: 0, pauseS: 0.5 },
    { dx: 3, speedMs: 1.5, pauseS: 1 },
    { dx: 1, speedMs: 1 },
  ],
};

describe('Jonh route (pure function of time since Fire)', () => {
  it('stands at the first stop while aiming and during the opening pause', () => {
    for (const t of [-1, 0, 0.25, 0.5]) {
      expect(routePoseAt(ROUTE, t)).toEqual({ dx: 0, dy: 0, distance: 0, facing: 0, walking: false });
    }
  });

  it('walks each leg at its speed, pauses, turns round and holds at the last stop', () => {
    const mid = routePoseAt(ROUTE, 0.5 + 1); // 1 s into a 1.5 m/s walk
    expect(mid.dx).toBeCloseTo(1.5);
    expect(mid.distance).toBeCloseTo(1.5);
    expect(mid).toMatchObject({ facing: 1, walking: true });
    // Arrives at 0.5 + 2 = 2.5 s, waits until 3.5 s (still facing the way he came).
    expect(routePoseAt(ROUTE, 3)).toMatchObject({ dx: 3, distance: 3, facing: 1, walking: false });
    const back = routePoseAt(ROUTE, 4.5);
    expect(back.dx).toBeCloseTo(2);
    expect(back.distance).toBeCloseTo(4);
    expect(back).toMatchObject({ facing: -1, walking: true });
    expect(routeDurationSeconds(ROUTE)).toBeCloseTo(5.5);
    for (const t of [5.5, 6, 100]) expect(routePoseAt(ROUTE, t)).toMatchObject({ dx: 1, distance: 5, facing: -1, walking: false });
  });

  it('is continuous: no jump between consecutive fixed steps faster than the walking speed allows', () => {
    let prev = routePoseAtStep(ROUTE, 0);
    for (let step = 1; step < 900; step++) {
      const pose = routePoseAtStep(ROUTE, step);
      expect(Math.abs(pose.dx - prev.dx)).toBeLessThanOrEqual(1.5 * PHYSICS.fixedStepSeconds + 1e-12);
      expect(pose.distance).toBeGreaterThanOrEqual(prev.distance);
      prev = pose;
    }
  });

  it('counts time in whole fixed steps, so every caller gets the same pose for the same step', () => {
    expect(routePoseAtStep(ROUTE, 240)).toEqual(routePoseAt(ROUTE, 240 * PHYSICS.fixedStepSeconds));
    expect(routePoseAtStep(ROUTE, 240)).toEqual(routePoseAtStep(ROUTE, 240));
  });

  it('builds timed legs and the boxes Jonh sweeps along them', () => {
    const legs = routeLegs(ROUTE);
    expect(legs.map(l => l.walking)).toEqual([false, true, false, true, false]);
    expect(legs[legs.length - 1]!.end).toBe(Infinity);
    const spawn = jonhAt(10, 1.6);
    const boxes = routeSweptBoxes(spawn, ROUTE);
    const body = boxes.filter(b => b.minY === 1.6);
    expect(Math.min(...body.map(b => b.minX))).toBeCloseTo(9.6);
    expect(Math.max(...body.map(b => b.maxX))).toBeCloseTo(13.4);
    expect(shiftJonh(spawn, 0, 0)).toBe(spawn);
    expect(shiftJonh(spawn, 2, 0).hatBox!.minX).toBeCloseTo(spawn.hatBox!.minX + 2);
  });
});

describe('Jonh route validation', () => {
  const base: LevelData = {
    id: 'route-test', name: 'Route test', difficulty: 1, bounds: GARDEN_BOUNDS, ground: GARDEN_GROUND, cannonSpawn: GARDEN_CANNON,
    jonhSpawn: jonhAt(16, 1.6),
    obstacles: [obstacle('wall', 11, 11.4, 1.6, 5, 'wood', false)],
    referenceSolutions: [{ angleDeg: 45, powerPercent: 50 }],
    multiplayerPositions: [],
    jonhRoute: { waypoints: [{ dx: 0 }, { dx: 3, speedMs: 1.2 }] },
  };
  const config = { maxSpeedMs: 20, dtSeconds: PHYSICS.fixedStepSeconds, minThicknessMetres: 0.2 };
  const errors = (level: LevelData) => validateLevel(level, config).errors;

  it('accepts a level route on the ground', () => {
    expect(errors(base)).toEqual([]);
  });

  it('rejects walking through an obstacle, out of bounds, off his floor, too fast or up and down', () => {
    expect(errors({ ...base, jonhRoute: { waypoints: [{ dx: 0 }, { dx: -5, speedMs: 1 }] } }).join()).toContain('walks through obstacle "wall"');
    expect(errors({ ...base, jonhRoute: { waypoints: [{ dx: 0 }, { dx: 12, speedMs: 1 }] } }).join()).toContain('leaves the level bounds');
    const onDeck = { ...base, jonhSpawn: jonhAt(16, 2), obstacles: [...base.obstacles, obstacle('deck', 15, 18, 1.6, 2, 'wood', false)] };
    expect(errors({ ...onDeck, jonhRoute: { waypoints: [{ dx: 0 }, { dx: 1, speedMs: 1 }] } })).toEqual([]);
    expect(errors({ ...onDeck, jonhRoute: { waypoints: [{ dx: 0 }, { dx: 3, speedMs: 1 }] } }).join()).toContain('leaves his floor');
    expect(errors({ ...base, jonhRoute: { waypoints: [{ dx: 0 }, { dx: 3, speedMs: 5 }] } }).join()).toContain('speed must be');
    expect(errors({ ...base, jonhRoute: { waypoints: [{ dx: 0 }, { dx: 3 }] } }).join()).toContain('speed must be');
    expect(errors({ ...base, jonhRoute: { waypoints: [{ dx: 0 }, { dx: 3, dy: 1, speedMs: 1 }] } }).join()).toContain('must stay level');
    expect(errors({ ...base, jonhRoute: { waypoints: [{ dx: 0 }] } }).join()).toContain('at least two');
  });
});
