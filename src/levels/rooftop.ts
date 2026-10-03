import type { LevelData } from './types';

export const ROOFTOP_LEVEL: LevelData = {
  id: 'rooftop',
  name: "Rooftop Lunch",
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
      minY: 6.6,
      maxY: 8.4,
    },
    hatBox: {
      minX: 17.7,
      maxX: 18.3,
      minY: 8.4,
      maxY: 8.7,
    },
  },
  obstacles: [
    {
      id: 'building',
      box: {
        minX: 15,
        maxX: 22,
        minY: 1.6,
        maxY: 6.6,
      },
      material: 'concrete',
      ricochet: true,
    }
  ],
  arrivalLines: [
    { x: 17.6 },
    { x: 18.4 }
  ],
  referenceSolutions: [
    { angleDeg: 45, powerPercent: 50 },
  ],
};
