import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * The big magnet [DECIDED by owner 2026-11-25: "A scrapyard magnet bends the ball's path toward it.
 * Aim off to one side and let it curve in."; name, layout and values PROPOSED, TUNE]. Jonh has found
 * a quiet corner of the scrapyard behind a stack of crushed cars. A crane (out of shot) dangles its
 * electromagnet on a cable right above the stack. The cannonball is iron: within 7 m of the magnet it
 * is pulled towards it, at full strength inside the inner ring. A lob aimed straight at Jonh is
 * dragged off its line and misses; a soft lob that would die on the stack is lifted over it and
 * carried in, and a high lob over the top of the magnet is hauled down onto him. Touching the magnet
 * ends the shot: the ball sticks to it. The gravel yard kills a ball's roll.
 */
export const MAGNET_LEVEL: LevelData = {
  id: 'magnet',
  mechanic: 'magnet',
  name: 'The Scrapyard',
  difficulty: 2,
  bounds: GARDEN_BOUNDS,
  ground: { ...GARDEN_GROUND, material: 'gravel' },
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(18.4, 1.6),
  obstacles: [
    obstacle('car-stack', 12.6, 14.2, 1.6, 6.0, 'scrap', false),
    // The electromagnet's housing (a 1 m disc seen side-on); the ball sticks to it.
    obstacle('magnet', 12.5, 13.5, 9.35, 9.85, 'magnet', false),
  ],
  magnet: { x: 13.0, y: 9.6, radius: 7, accelerationMs2: 8, housingId: 'magnet' },
  arrivalLine: 'Peace and quiet. Apart from the magnet.',
  // References [TUNE]: "dive" shots go up over the magnet and are hauled down onto Jonh; "lift" shots
  // would die on the stack but are carried over it. Each hits only with the magnet (tested).
  multiplayerPositions: [
    { id: 'near', offsetX: -2.0, referenceSolutions: [{ angleDeg: 74, powerPercent: 75 }, { angleDeg: 73, powerPercent: 74 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 71, powerPercent: 73 }, { angleDeg: 71, powerPercent: 74 }] },
    { id: 'far', offsetX: 1.6, referenceSolutions: [{ angleDeg: 58, powerPercent: 32 }, { angleDeg: 64, powerPercent: 55 }] },
  ],
  referenceSolutions: [{ angleDeg: 71, powerPercent: 73 }, { angleDeg: 71, powerPercent: 74 }],
};
