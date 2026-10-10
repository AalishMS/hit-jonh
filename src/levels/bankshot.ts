import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * Ricochet only: Jonh sits in a carport walled off on the cannon side. The way in is over the
 * roof, off the steel billboard behind him and back in under the open end. The gravel driveway
 * stops a ball where it lands.
 */
export const BANKSHOT_LEVEL: LevelData = {
  id: 'bankshot',
  name: 'Billboard Bank Shot',
  difficulty: 2,
  bounds: GARDEN_BOUNDS,
  ground: GARDEN_GROUND,
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(18, 1.85),
  obstacles: [
    obstacle('carport-wall', 12.0, 12.3, 1.6, 6.8, 'concrete', false),
    obstacle('carport-roof', 12.0, 20.4, 6.8, 7.2, 'concrete', false),
    obstacle('driveway', 12.3, 20.4, 1.6, 1.85, 'gravel', false),
    obstacle('billboard', 22.4, 22.8, 1.6, 9.5, 'steel', true),
  ],
  arrivalLine: 'Nobody can reach me in here.',
  multiplayerPositions: [
    { id: 'near', offsetX: -2.5, referenceSolutions: [{ angleDeg: 39, powerPercent: 73 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 62, powerPercent: 54 }] },
    { id: 'far', offsetX: 2, referenceSolutions: [{ angleDeg: 68, powerPercent: 80 }] },
  ],
  referenceSolutions: [{ angleDeg: 62, powerPercent: 54 }, { angleDeg: 68, powerPercent: 67 }],
};
