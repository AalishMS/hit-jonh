import { GARDEN_BOUNDS, GARDEN_CANNON, GARDEN_GROUND, jonhAt, obstacle, pane } from './build';
import type { BreakableData, LevelData } from './types';

/** Greenhouse glass [PROPOSED][TUNE]: breaks at 6.5 m/s into the pane; the ball keeps 35 % of its velocity. */
const GLASS: BreakableData = { minImpactSpeedMs: 6.5, speedKept: 0.35 };

/**
 * Breakables: Jonh pots seedlings inside a glasshouse. A brick wall taller than he is stops low shots;
 * above it the front window and the four roof panes are glass in a white timber frame. A soft shot
 * bounces off glass; a hard one smashes through and loses most of its speed, so every way in is through
 * a pane: blast through the window and drop onto him, or lob high enough to crash down through the roof.
 */
export const GREENHOUSE_LEVEL: LevelData = {
  id: 'greenhouse',
  mechanic: 'glass',
  name: 'The Greenhouse',
  difficulty: 2,
  bounds: GARDEN_BOUNDS,
  ground: GARDEN_GROUND,
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(18.8, 1.85),
  obstacles: [
    obstacle('brick-front', 14.0, 14.25, 1.6, 3.8, 'concrete', false),
    pane('pane-front', 14.0, 14.25, 3.8, 5.05, GLASS),
    obstacle('frame-0', 14.0, 14.25, 5.05, 5.3, 'wood', false),
    pane('pane-roof-1', 14.25, 15.875, 5.05, 5.3, GLASS),
    obstacle('frame-1', 15.875, 16.125, 5.05, 5.3, 'wood', false),
    pane('pane-roof-2', 16.125, 17.75, 5.05, 5.3, GLASS),
    obstacle('frame-2', 17.75, 18.0, 5.05, 5.3, 'wood', false),
    pane('pane-roof-3', 18.0, 19.625, 5.05, 5.3, GLASS),
    obstacle('frame-3', 19.625, 19.875, 5.05, 5.3, 'wood', false),
    pane('pane-roof-4', 19.875, 21.5, 5.05, 5.3, GLASS),
    obstacle('frame-4', 21.5, 21.75, 5.05, 5.3, 'wood', false),
    obstacle('brick-back', 21.5, 21.75, 1.6, 5.05, 'concrete', false),
    obstacle('greenhouse-floor', 14.25, 21.5, 1.6, 1.85, 'gravel', false),
  ],
  arrivalLine: 'Double glazing. Perfectly safe.',
  multiplayerPositions: [
    { id: 'near', offsetX: -1.9, referenceSolutions: [{ angleDeg: 24, powerPercent: 58 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 53, powerPercent: 46 }] },
    { id: 'far', offsetX: 1.9, referenceSolutions: [{ angleDeg: 44, powerPercent: 57 }] },
  ],
  referenceSolutions: [{ angleDeg: 53, powerPercent: 46 }, { angleDeg: 52, powerPercent: 46 }],
};
