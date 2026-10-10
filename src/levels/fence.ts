import type { LevelData } from './types';

export const FENCE_LEVEL: LevelData = {
  id: 'fence',
  name: "The Fence Dispute",
  difficulty: 1,
  bounds: {
    minX: 0,
    maxX: 25.6,
    minY: 0,
    maxY: 14.4,
  },
  ground: {
    minX: 0,
    maxX: 25.6,
    minY: 0,
    maxY: 1.6,
    material: 'grass',
  },
  cannonSpawn: {
    x: 2.5,
    y: 2.2,
  },
  jonhSpawn: {
    bodyBox: {
      minX: 16.6,
      maxX: 17.4,
      minY: 1.6,
      maxY: 3.4,
    },
    hatBox: {
      minX: 16.7,
      maxX: 17.3,
      minY: 3.4,
      maxY: 3.7,
    },
  },
  obstacles: [
    {
      id: 'fence',
      box: {
        minX: 11.89,
        maxX: 12.11,
        minY: 1.6,
        maxY: 3.4,
      },
      material: 'wood',
      ricochet: true,
    }
  ],
  arrivalLine: 'Much quieter here.',
  multiplayerPositions: [
    { id: 'near', offsetX: -3, referenceSolutions: [{ angleDeg: 65, powerPercent: 34 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 65, powerPercent: 44 }] },
    { id: 'far', offsetX: 3, referenceSolutions: [{ angleDeg: 65, powerPercent: 55 }] },
  ],
  referenceSolutions: [
    { angleDeg: 45, powerPercent: 24 },
  ],
};
