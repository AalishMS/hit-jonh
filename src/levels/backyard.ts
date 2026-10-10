import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * A tall shed blocks low shots and an apple tree shades Jonh from high lobs: thread the gap
 * between the shed roof and the canopy (or bounce in off either).
 */
export const BACKYARD_LEVEL: LevelData = {
  id: 'backyard',
  name: "Jonh's Backyard",
  difficulty: 1,
  bounds: GARDEN_BOUNDS,
  ground: GARDEN_GROUND,
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(18, 1.6),
  obstacles: [
    obstacle('garden-shed', 11.0, 13.4, 1.6, 5.0, 'wood', true),
    obstacle('apple-tree', 14.4, 23.2, 5.6, 6.4, 'leaves', true),
    obstacle('tree-trunk', 22.6, 23.0, 1.6, 5.6, 'wood', false),
  ],
  arrivalLine: 'Much quieter here.',
  multiplayerPositions: [
    { id: 'near', offsetX: -3, referenceSolutions: [{ angleDeg: 35, powerPercent: 53 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 56, powerPercent: 32 }] },
    { id: 'far', offsetX: 3, referenceSolutions: [{ angleDeg: 40, powerPercent: 38 }] },
  ],
  referenceSolutions: [{ angleDeg: 56, powerPercent: 32 }, { angleDeg: 57, powerPercent: 31 }],
};
