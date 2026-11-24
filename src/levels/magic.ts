import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * Portals: Jonh waits on stage inside the magician's sealed tent, out of reach of any direct shot.
 * A magic hoop floats over the lawn; whatever goes through it pops out of a second hoop just inside
 * the tent with the same speed, tossed up and on towards him [PROPOSED]. So the angle only has to
 * thread the hoop, and the power decides where the ball comes down. Velvet walls and the carpeted
 * stage swallow misses.
 */
export const MAGIC_LEVEL: LevelData = {
  id: 'magic',
  name: 'The Magic Act',
  difficulty: 2,
  bounds: GARDEN_BOUNDS,
  ground: GARDEN_GROUND,
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(18.5, 2.0),
  obstacles: [
    obstacle('tent-front', 13.0, 13.3, 1.6, 8.5, 'velvet', false),
    obstacle('tent-roof', 13.0, 24.5, 8.5, 8.8, 'velvet', false),
    obstacle('tent-back', 24.2, 24.5, 1.6, 8.5, 'velvet', false),
    obstacle('stage', 13.3, 24.2, 1.6, 2.0, 'rug', false),
  ],
  portals: [{ id: 'hoops', entry: { x: 8.5, y: 6.5, radius: 0.6 }, exit: { x: 14.3, y: 3.4, angleDeg: 65 } }],
  arrivalLine: 'Sealed tent. No tricks.',
  multiplayerPositions: [
    { id: 'near', offsetX: -2, referenceSolutions: [{ angleDeg: 55, powerPercent: 24 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 48, powerPercent: 29 }] },
    { id: 'far', offsetX: 2, referenceSolutions: [{ angleDeg: 42, powerPercent: 40 }] },
  ],
  referenceSolutions: [{ angleDeg: 48, powerPercent: 29 }, { angleDeg: 47, powerPercent: 29 }],
};
