import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * The skate ramp [PROPOSED 2026-11-25; mechanic DECIDED by owner the same day]: Jonh hides in a brick
 * shelter with a "NO BALL GAMES" sign, walled off on the cannon's side and roofed over, open only at the
 * back. Every cannon shot travels away from the cannon, so nothing fired can reach him directly. Behind
 * the shelter stands a half-pipe: a tall vertical wall on the far side and a lower 40° lip facing Jonh.
 * Land the ball in the half-pipe; it runs up the tall wall, comes back down and rolls out over the low
 * lip, lobbing into the shelter. The curve is one exact arc (RampData, sim/arc.ts). The shelter is tall
 * so a lob off the lip can sail over a nearer spot and drop on a deeper one: every target position
 * has shots that reach it alone.
 */
export const SKATEPARK_LEVEL: LevelData = {
  id: 'skatepark',
  mechanic: 'ramp',
  name: 'Skate Park',
  difficulty: 2,
  bounds: GARDEN_BOUNDS,
  ground: GARDEN_GROUND,
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(16, 1.6),
  obstacles: [
    obstacle('shelter-wall', 12.6, 13.0, 1.6, 6.6, 'concrete', false),
    obstacle('shelter-roof', 12.6, 19.0, 6.6, 7.1, 'gravel', false),
    // The deck behind the half-pipe's tall wall, flush with its top.
    obstacle('ramp-deck', 24.7, 25.6, 1.6, 4.62, 'wood', false),
  ],
  ramps: [
    // 3 m riding radius, 0.3 m of plywood; its bottom sits 2 cm above the lawn. From the low lip at
    // -140° (x 19.1 m, 1.1 m up; it launches the ball back at 40°) round to the top of the tall wall at
    // 0° (x 24.4 m, 3 m up, vertical).
    { id: 'half-pipe', centre: { x: 21.4, y: 4.62 }, radius: 3, thickness: 0.3, startDeg: -140, endDeg: 0, material: 'plywood', ricochet: false },
  ],
  arrivalLine: 'Nothing gets in here. I read the sign.',
  multiplayerPositions: [
    { id: 'near', offsetX: -2, referenceSolutions: [{ angleDeg: 45, powerPercent: 62 }, { angleDeg: 47, powerPercent: 61 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 56, powerPercent: 65 }, { angleDeg: 60, powerPercent: 68 }] },
    { id: 'far', offsetX: 2, referenceSolutions: [{ angleDeg: 63, powerPercent: 57 }, { angleDeg: 76, powerPercent: 93 }] },
  ],
  referenceSolutions: [{ angleDeg: 56, powerPercent: 65 }, { angleDeg: 60, powerPercent: 68 }],
};
