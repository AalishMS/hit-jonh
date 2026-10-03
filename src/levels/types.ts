import type { Box2D, Point2D } from '../sim/swept';

export type { Box2D, Point2D };

export type ColliderRole = 'ground' | 'jonhBody' | 'jonhHat' | 'obstacle' | 'projectile';

export interface ObstacleData {
  id: string;
  box: Box2D;
  material: string;
  ricochet: boolean;
}

export interface JonhSpawnData {
  bodyBox: Box2D;
  hatBox?: Box2D;
}

export interface ReferenceSolution {
  angleDeg: number;
  powerPercent: number;
}

export interface LevelData {
  id: string;
  name: string;
  bounds: Box2D;
  ground: Box2D & { material: string };
  cannonSpawn: Point2D;
  jonhSpawn: JonhSpawnData;
  obstacles: ObstacleData[];
  referenceSolutions: ReferenceSolution[];
}
