import type { LevelData } from './types';

export const RUBBER_LEVEL: LevelData = {
  id: 'rubber',
  name: "Rubber Yard",
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
      minX: 17.6,
      maxX: 18.4,
      minY: 1.6,
      maxY: 3.4,
    },
    hatBox: {
      minX: 17.7,
      maxX: 18.3,
      minY: 3.4,
      maxY: 3.7,
    },
  },
  obstacles: [
    {
      id: 'wall',
      box: {
        minX: 12.0,
        maxX: 12.22,
        minY: 1.6,
        maxY: 7.0,
      },
      material: 'concrete',
      ricochet: false,
    },
    {
      id: 'rubber_ceiling',
      box: {
        minX: 8.0,
        maxX: 18.0,
        minY: 9.0,
        maxY: 9.5,
      },
      material: 'rubber',
      ricochet: true,
    }
  ],
  arrivalLine: 'At least it is bouncy.',
  multiplayerPositions: [
    { id: 'near', offsetX: -2, referenceSolutions: [{ angleDeg: 37, powerPercent: 68 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 34, powerPercent: 88 }] },
    { id: 'far', offsetX: 3, referenceSolutions: [{ angleDeg: 34, powerPercent: 89 }] },
  ],
  referenceSolutions: [
    { angleDeg: 34, powerPercent: 88 },
    { angleDeg: 48, powerPercent: 45 },
  ],
};
