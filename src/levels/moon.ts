import { GARDEN_BOUNDS, GARDEN_CANNON, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * Low gravity: shots float and a single power step moves the landing a long way. A boulder and
 * an overhanging rock shelf leave a narrow window; moon dust stops a rolling ball fast. The
 * cannon is detuned so the range stays on the map.
 */
export const MOON_LEVEL: LevelData = {
  id: 'moon',
  name: 'Lunar Picnic',
  difficulty: 2,
  gravityMs2: 2.0,
  launchSpeedScale: 0.6,
  bounds: GARDEN_BOUNDS,
  ground: { minX: 0, maxX: 25.6, minY: 0, maxY: 1.6, material: 'regolith' },
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(20, 1.6),
  obstacles: [
    obstacle('crater-rim', 9.0, 10.2, 1.6, 3.8, 'regolith', false),
    obstacle('floating-rock', 12.5, 14.5, 6.0, 6.8, 'regolith', true),
    obstacle('boulder', 15.6, 16.4, 1.6, 5.0, 'regolith', false),
    obstacle('rock-shelf', 16.8, 23.5, 6.6, 7.2, 'regolith', true),
  ],
  arrivalLine: 'Peace and quiet at last.',
  multiplayerPositions: [
    { id: 'near', offsetX: -2.5, referenceSolutions: [{ angleDeg: 81, powerPercent: 61 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 69, powerPercent: 28 }] },
    { id: 'far', offsetX: 2.5, referenceSolutions: [{ angleDeg: 61, powerPercent: 26 }] },
  ],
  referenceSolutions: [{ angleDeg: 69, powerPercent: 28 }, { angleDeg: 70, powerPercent: 29 }],
};
