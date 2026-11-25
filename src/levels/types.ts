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

/**
 * A curved skate ramp [PROPOSED 2026-11-25]: a thick circular arc whose inner (concave) face the ball
 * rides. It is solved exactly by the swept guard (sim/arc.ts): a ball that lands on it bounces with the
 * material's restitution, a ball moving gently along it rolls (speed changes only by gravity's pull
 * along the curve and a rolling drag), and a ball that rolls past an end leaves along the tangent
 * there, so the lip launches it. Angles are degrees about the centre, counter-clockwise from +x
 * (-90 is straight below the centre): a quarter-pipe that kicks a ball up towards +x runs from -90 to
 * its lip angle, e.g. -30 launches at 60°.
 */
export interface RampData {
  id: string;
  centre: Point2D;
  /** Radius of the riding (inner) face, metres. */
  radius: number;
  /** Solid depth behind the riding face (metres); obeys the thickness rule (SPEC §9.2). */
  thickness: number;
  /** The arc runs counter-clockwise from startDeg to endDeg, 0 < endDeg − startDeg ≤ 180. */
  startDeg: number;
  endDeg: number;
  material: string;
  /** Rolling through it counts as a ricochet (a trick shot). [OPEN] per-map ricochet surfaces (SPEC §7.1). */
  ricochet: boolean;
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
export type MechanicId = 'glass' | 'wind' | 'rubber' | 'bank' | 'portal' | 'walking' | 'lowGravity' | 'trampoline' | 'longShot' | 'ramp';

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
  /** Curved skate ramps (see RampData); none when omitted. */
  ramps?: RampData[];
  /** One-way portals (see PortalData); none when omitted. */
  portals?: PortalData[];
  /** Constant wind on the ball (see WindData); none when omitted, and the map plays exactly as before. */
  wind?: WindData;
  /** Jonh walks this route during the shot (see JonhRouteData); he stands still when omitted. */
  jonhRoute?: JonhRouteData;
}
