import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * Trampoline shots: Jonh reads on a covered balcony behind a tall hedge. Drop the ball over the
 * hedge onto the trampoline and let it spring up under the roof (bounces off the balcony's roof
 * and back wall count as trick shots too). A very rare flat lob can still sneak in directly.
 */
export const TRAMPOLINE_LEVEL: LevelData = {
  id: 'trampoline',
  name: 'Bounce House',
  difficulty: 3,
  bounds: GARDEN_BOUNDS,
  ground: GARDEN_GROUND,
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(20.4, 5.25),
  obstacles: [
    obstacle('hedge', 10.6, 11.4, 1.6, 9.2, 'leaves', false),
    obstacle('trampoline', 12.2, 15.8, 1.6, 2.1, 'trampoline', true),
    obstacle('house', 17.0, 24.5, 1.6, 5.0, 'concrete', false),
    obstacle('balcony-rug', 17.0, 24.0, 5.0, 5.25, 'rug', false),
    obstacle('balcony-roof', 13.6, 24.5, 9.6, 10.0, 'concrete', true),
    obstacle('balcony-back', 24.0, 24.5, 5.25, 9.6, 'concrete', true),
  ],
  arrivalLine: 'Finally, a hedge tall enough.',
  multiplayerPositions: [
    { id: 'near', offsetX: -1.8, referenceSolutions: [{ angleDeg: 77, powerPercent: 68 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 80, powerPercent: 74 }] },
    { id: 'far', offsetX: 1.6, referenceSolutions: [{ angleDeg: 70, powerPercent: 55 }] },
  ],
  referenceSolutions: [{ angleDeg: 80, powerPercent: 74 }, { angleDeg: 81, powerPercent: 80 }],
};
