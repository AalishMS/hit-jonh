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

export interface MultiplayerPosition {
  id: string;
  offsetX: number;
  referenceSolutions: ReferenceSolution[];
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
  /** Exactly MULTIPLAYER.shotsPerRound target positions: every map is playable in every mode. */
  multiplayerPositions: MultiplayerPosition[];
  arrivalLine?: string;
  /** Shown as pips in the map pickers: 1 easy, 3 hardest. */
  difficulty: 1 | 2 | 3;
  /** Gravity on this map (m/s²); PHYSICS.gravity when omitted. */
  gravityMs2?: number;
  /** Multiplies the cannon's whole launch-speed range on this map; 1 when omitted. */
  launchSpeedScale?: number;
}
