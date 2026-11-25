import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * Wind [PROPOSED 2026-11-25]: a steady 3 m/s² headwind blows from Jonh's side back towards the cannon
 * (the windsock stands on the lawn at 7 m). A 6 m garden wall stops low shots, so every shot is a lob
 * with plenty of hang time, and the wind drags it backwards the whole way: aim well past Jonh and let
 * the breeze bring it in. A calm-air solution misses by metres. A low planter stops short rollers.
 */
export const WASHDAY_LEVEL: LevelData = {
  id: 'washday',
  name: 'Windy Washday',
  difficulty: 2,
  bounds: GARDEN_BOUNDS,
  ground: GARDEN_GROUND,
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(19, 1.6),
  obstacles: [
    obstacle('garden-wall', 10.6, 11.1, 1.6, 6.0, 'concrete', false),
    obstacle('planter-a', 15.4, 15.7, 1.6, 2.3, 'wood', false),
  ],
  wind: { accelerationMs2: -3, windsockX: 7 },
  arrivalLine: 'Lovely breeze. Do mind the sheets.',
  multiplayerPositions: [
    { id: 'near', offsetX: -2, referenceSolutions: [{ angleDeg: 41, powerPercent: 50 }, { angleDeg: 47, powerPercent: 56 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 45, powerPercent: 60 }, { angleDeg: 47, powerPercent: 62 }] },
    { id: 'far', offsetX: 2, referenceSolutions: [{ angleDeg: 37, powerPercent: 64 }, { angleDeg: 37, powerPercent: 66 }] },
  ],
  referenceSolutions: [{ angleDeg: 45, powerPercent: 60 }, { angleDeg: 47, powerPercent: 62 }],
};
