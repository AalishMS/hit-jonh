import { jonhAt, obstacle } from './build';
import type { LevelData } from './types';

/**
 * Very zoomed out: a 64 m map (camera at 0.4×). The cannon sits on a cliff; Jonh stands on one
 * of three narrow rock pillars across the valley, with a grain silo in the way. The cannon is
 * uprated to reach him, so the landing moves about a metre per power step.
 */
export const VALLEY_LEVEL: LevelData = {
  id: 'valley',
  name: 'Across the Valley',
  difficulty: 3,
  launchSpeedScale: 1.6,
  bounds: { minX: 0, maxX: 64, minY: 0, maxY: 28 },
  ground: { minX: 0, maxX: 64, minY: 0, maxY: 1.6, material: 'grass' },
  cannonSpawn: { x: 2.5, y: 12.6 },
  jonhSpawn: jonhAt(51, 8.0),
  obstacles: [
    obstacle('cliff', 0, 6.0, 1.6, 12.0, 'rock', false),
    obstacle('grain-silo', 24.0, 26.0, 1.6, 18.0, 'steel', true),
    obstacle('pillar-a', 47.5, 48.5, 1.6, 8.0, 'rock', false),
    obstacle('pillar-b', 50.5, 51.5, 1.6, 8.0, 'rock', false),
    obstacle('pillar-c', 53.5, 54.5, 1.6, 8.0, 'rock', false),
  ],
  arrivalLine: 'Let them try from over there.',
  multiplayerPositions: [
    { id: 'near', offsetX: -3, referenceSolutions: [{ angleDeg: 33, powerPercent: 48 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 30, powerPercent: 53 }] },
    { id: 'far', offsetX: 3, referenceSolutions: [{ angleDeg: 35, powerPercent: 54 }] },
  ],
  referenceSolutions: [{ angleDeg: 30, powerPercent: 53 }, { angleDeg: 32, powerPercent: 52 }],
};
