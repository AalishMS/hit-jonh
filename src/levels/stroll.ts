import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * Walking Jonh [DECIDED by owner 2026-11-25: "A walking-Jonh garden. A predictable route timed from
 * Fire (a timing challenge)"; name, layout and route PROPOSED, TUNE]. Jonh takes his afternoon stroll
 * up the gravel garden path, newspaper in hand. He stands out on the lawn side while you aim; the
 * moment you fire he waits a beat, then strolls 5 m away from the cannon into the shade of the old
 * pear tree, pauses, and ambles 3 m back. A tall hedge stops low shots and the pear tree's canopy
 * covers the far end of his walk, so a lob has to meet him before he reaches the shade (or a flatter
 * shot has to slip in under the leaves, or bank off them). The gravel kills a ball's roll. The route
 * is the same every shot, so it can be learnt; it is painted on the path.
 * Target positions shift the route (near also sets off 1.5 s later), so each needs its own timing.
 */
export const STROLL_LEVEL: LevelData = {
  id: 'stroll',
  mechanic: 'walking',
  name: 'The Afternoon Stroll',
  difficulty: 2,
  // Joins the Daily Bonk the day after it shipped, so the Daily of the deploy day stays the one players already had.
  dailyFrom: '2026-11-26',
  bounds: GARDEN_BOUNDS,
  ground: GARDEN_GROUND,
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(15.2, 1.85),
  obstacles: [
    obstacle('hedge', 11.4, 12.2, 1.6, 6.4, 'leaves', false),
    obstacle('garden-path', 12.6, 23.4, 1.6, 1.85, 'gravel', false),
    obstacle('pear-tree', 16.8, 25.0, 5.2, 6.0, 'leaves', true),
    obstacle('pear-trunk', 23.6, 24.1, 1.6, 5.2, 'wood', false),
  ],
  // Waits 0.5 s, walks 5 m away from the cannon at 1.25 m/s, pauses 0.4 s, then ambles 3 m back
  // and stays there (6.7 s after Fire).
  jonhRoute: {
    waypoints: [
      { dx: 0, pauseS: 0.5 },
      { dx: 5, speedMs: 1.25, pauseS: 0.4 },
      { dx: 2, speedMs: 1.25 },
    ],
  },
  arrivalLine: 'Just a quick stroll. Nobody bother me.',
  multiplayerPositions: [
    { id: 'near', offsetX: -2.1, routeDelayS: 1.5, referenceSolutions: [{ angleDeg: 45, powerPercent: 47 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 65, powerPercent: 44 }] },
    { id: 'far', offsetX: 2.0, referenceSolutions: [{ angleDeg: 46, powerPercent: 44 }] },
  ],
  referenceSolutions: [{ angleDeg: 65, powerPercent: 44 }, { angleDeg: 65, powerPercent: 45 }],
};
