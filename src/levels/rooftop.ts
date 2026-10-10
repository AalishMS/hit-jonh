import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * Jonh lunches on a gravel roof behind a parapet, under a high awning: no skidding in along the
 * roof (gravel stops a ball dead) and no dropping straight down on him.
 */
export const ROOFTOP_LEVEL: LevelData = {
  id: 'rooftop',
  name: 'Rooftop Lunch',
  difficulty: 1,
  bounds: GARDEN_BOUNDS,
  ground: GARDEN_GROUND,
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(18, 6.85),
  obstacles: [
    obstacle('building', 15, 22, 1.6, 6.6, 'concrete', true),
    obstacle('parapet', 15.0, 15.3, 6.6, 7.9, 'concrete', true),
    obstacle('roof-gravel', 15.3, 22.0, 6.6, 6.85, 'gravel', false),
    obstacle('awning', 16.0, 22.0, 10.4, 10.8, 'wood', true),
    obstacle('awning-post', 21.75, 22.0, 6.85, 10.4, 'wood', false),
  ],
  arrivalLine: 'Much quieter here.',
  multiplayerPositions: [
    { id: 'near', offsetX: -2, referenceSolutions: [{ angleDeg: 47, powerPercent: 55 }] },
    { id: 'middle', offsetX: 0.5, referenceSolutions: [{ angleDeg: 37, powerPercent: 91 }] },
    { id: 'far', offsetX: 3, referenceSolutions: [{ angleDeg: 41, powerPercent: 75 }] },
  ],
  referenceSolutions: [{ angleDeg: 34, powerPercent: 95 }, { angleDeg: 34, powerPercent: 94 }],
};
