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
  /**
   * Part of Jonh's own spot [PROPOSED 2026-11-25] (Frozen Pond: his fishing hut and the ice it stands on):
   * at a multiplayer target position it moves with him by the position's offsetX, like his tea table, so
   * every position keeps the same hut and landing strip. Fixed when omitted (every other map).
   */
  followsJonh?: boolean;
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

/**
 * A constant wind [PROPOSED]: a horizontal acceleration on the ball only (never Jonh, obstacles or
 * contacts), applied in the fixed step the same way gravity is. Positive blows towards +x (towards
 * Jonh's side), negative back towards the cannon. Scenery draws a windsock and streaks from it.
 */
export interface WindData {
  accelerationMs2: number;
  /** Where the windsock stands (metres); WIND.defaultSockXMetres when omitted. */
  windsockX?: number;
}

/**
 * One stop on Jonh's walking route [PROPOSED 2026-11-25]. Offsets are metres from his spawn, so a
 * multiplayer target position (which shifts the spawn) shifts the whole route with him.
 */
export interface JonhRouteWaypoint {
  dx: number;
  /** Vertical offset (m); 0 when omitted. Validation keeps his feet on a surface. */
  dy?: number;
  /** Walking speed on the way to this stop (m/s) [TUNE]; ignored on the first stop. */
  speedMs?: number;
  /** Seconds he waits here before walking on; the last stop holds for good. 0 when omitted. */
  pauseS?: number;
}

/**
 * A predictable walk timed from Fire [DECIDED by owner 2026-11-25 for one garden only; PROPOSED data].
 * He stands at the first stop while the player aims; from the moment the ball is fired his offset is
 * a pure function of simulated time (fixed steps since Fire): see levels/jonhRoute.ts.
 */
export interface JonhRouteData {
  /** At least two stops; the first is where he waits while the player aims (normally dx 0). */
  waypoints: JonhRouteWaypoint[];
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
  /**
   * Walking Jonh only: extra seconds he waits at the start of his route before setting off at this
   * position (a phase shift of the whole walk) [PROPOSED 2026-11-25]; 0 when omitted.
   */
  routeDelayS?: number;
  referenceSolutions: ReferenceSolution[];
}

/** The one new thing a garden introduces, for its first-meeting tip (rules/mechanicTips.ts). */
export type MechanicId = 'glass' | 'wind' | 'rubber' | 'bank' | 'portal' | 'walking' | 'lowGravity' | 'trampoline' | 'longShot' | 'ice';

export interface LevelData {
  id: string;
  name: string;
  /** The garden's new mechanic, explained once by a first-meeting tip; none for the basic gardens. */
  mechanic?: MechanicId;
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
  /** Constant wind on the ball (see WindData); none when omitted, and the map plays exactly as before. */
  wind?: WindData;
  /** Jonh walks this route during the shot (see JonhRouteData); he stands still when omitted. */
  jonhRoute?: JonhRouteData;
}
