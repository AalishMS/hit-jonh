import type { Box2D, JonhSpawnData, ObstacleData } from './types';

/** The standard garden frame (SPEC §11): 25.6 × 14.4 m world, ground top at 1.6 m. */
export const GARDEN_BOUNDS: Box2D = { minX: 0, maxX: 25.6, minY: 0, maxY: 14.4 };
export const GARDEN_GROUND = { minX: 0, maxX: 25.6, minY: 0, maxY: 1.6, material: 'grass' };
export const GARDEN_CANNON = { x: 2.5, y: 2.2 };

/** Jonh (0.8 × 1.8 m body, 0.6 × 0.3 m hat) standing centred on `x` on a surface at height `floorY`. */
export function jonhAt(x: number, floorY: number): JonhSpawnData {
  return {
    bodyBox: { minX: x - 0.4, maxX: x + 0.4, minY: floorY, maxY: floorY + 1.8 },
    hatBox: { minX: x - 0.3, maxX: x + 0.3, minY: floorY + 1.8, maxY: floorY + 2.1 },
  };
}

export function obstacle(id: string, minX: number, maxX: number, minY: number, maxY: number, material: string, ricochet: boolean): ObstacleData {
  return { id, box: { minX, maxX, minY, maxY }, material, ricochet };
}
