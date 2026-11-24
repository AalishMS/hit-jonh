import type { Box2D, Point2D } from '../sim/swept';

export type { Box2D, Point2D };

export type ColliderRole = 'ground' | 'jonhBody' | 'jonhHat' | 'obstacle' | 'projectile';

/**
 * A prop that shatters when the ball strikes it hard enough [PROPOSED][TUNE]. Struck softly it is an
 * ordinary solid obstacle. Once broken it is gone (from Matter and the swept guard) for the rest of
 * that shot only; the next attempt starts with it whole again (SPEC §7.2).
 */
export interface BreakableData {
  /** Impact speed into the surface (m/s, along its normal) at or above which it breaks. */
  minImpactSpeedMs: number;
  /** Share of the ball's velocity kept when it smashes through (0–1). The ball is not reflected. */
  speedKept: number;
}

export interface ObstacleData {
  id: string;
  box: Box2D;
  material: string;
  /** Bouncing off it counts as a ricochet. Smashing through a breakable never does. */
  ricochet: boolean;
  breakable?: BreakableData;
}

/**
 * A one-way portal [PROPOSED]. The moment the ball touches the entry disc it reappears at the exit,
 * keeping its speed but heading in the exit's direction. A portal is not a surface: no bounce, never a
 * ricochet or an obstacle contact. Each portal works once per shot (loop guard).
 */
export interface PortalData {
  id: string;
  /** Entry disc in metres; the ball goes through as soon as it touches it. */
  entry: { x: number; y: number; radius: number };
  /** Where the ball's centre reappears, and its new heading (degrees above +x, counter-clockwise). */
  exit: { x: number; y: number; angleDeg: number };
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
  /** One-way portals (see PortalData); none when omitted. */
  portals?: PortalData[];
}
