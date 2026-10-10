import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * A tall wall leaves only a narrow direct gap under the rubber ceiling; banking off the
 * ceiling is the comfortable way in. Jonh's sandpit stops a ball that lands short.
 */
export const RUBBER_LEVEL: LevelData = {
  id: 'rubber',
  name: 'Rubber Yard',
  difficulty: 2,
  bounds: GARDEN_BOUNDS,
  ground: GARDEN_GROUND,
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(18, 1.85),
  obstacles: [
    obstacle('wall', 12.0, 12.22, 1.6, 7.3, 'concrete', false),
    obstacle('rubber_ceiling', 8.0, 21.0, 9.0, 9.5, 'rubber', true),
    obstacle('sandpit', 13.0, 23.0, 1.6, 1.85, 'sand', false),
  ],
  arrivalLine: 'At least it is bouncy.',
  multiplayerPositions: [
    { id: 'near', offsetX: -2.5, referenceSolutions: [{ angleDeg: 57, powerPercent: 40 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 49, powerPercent: 76 }] },
    { id: 'far', offsetX: 2.5, referenceSolutions: [{ angleDeg: 42, powerPercent: 93 }] },
  ],
  referenceSolutions: [{ angleDeg: 49, powerPercent: 76 }, { angleDeg: 53, powerPercent: 57 }],
};
