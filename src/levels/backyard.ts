import type { LevelData } from './types';

export const BACKYARD_LEVEL: LevelData = {
  id: 'backyard',
  name: "Jonh's Backyard",
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
      id: 'garden-shed',
      box: { minX: 10, maxX: 12.6, minY: 1.6, maxY: 4.3 },
      material: 'wood',
      ricochet: true,
    },
  ],
  arrivalLine: 'Much quieter here.',
  multiplayerPositions: [
    { id: 'near', offsetX: -3, referenceSolutions: [{ angleDeg: 65, powerPercent: 31 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 65, powerPercent: 38 }] },
    { id: 'far', offsetX: 3, referenceSolutions: [{ angleDeg: 65, powerPercent: 58 }] },
  ],
  referenceSolutions: [
    { angleDeg: 45, powerPercent: 40 },
    { angleDeg: 65, powerPercent: 55 },
  ],
};
