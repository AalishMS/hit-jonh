import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * A 4.4 m fence: shots have to drop steeply behind it, and low planters stop a ball that
 * lands short from simply rolling into Jonh.
 */
export const FENCE_LEVEL: LevelData = {
  id: 'fence',
  name: 'The Fence Dispute',
  difficulty: 1,
  bounds: GARDEN_BOUNDS,
  ground: GARDEN_GROUND,
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(17, 1.6),
  obstacles: [
    obstacle('fence', 12.4, 12.65, 1.6, 6.0, 'wood', true),
    obstacle('planter-a', 15.4, 15.7, 1.6, 2.2, 'wood', false),
    obstacle('planter-b', 18.4, 18.7, 1.6, 2.2, 'wood', false),
  ],
  arrivalLine: 'Much quieter here.',
  multiplayerPositions: [
    { id: 'near', offsetX: -3, referenceSolutions: [{ angleDeg: 70, powerPercent: 51 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 47, powerPercent: 41 }] },
    { id: 'far', offsetX: 3, referenceSolutions: [{ angleDeg: 40, powerPercent: 49 }] },
  ],
  referenceSolutions: [{ angleDeg: 47, powerPercent: 41 }, { angleDeg: 48, powerPercent: 40 }],
};
