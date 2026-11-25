import { GARDEN_BOUNDS, GARDEN_CANNON, jonhAt, obstacle } from './build';
import type { LevelData, ObstacleData } from './types';

/** Jonh's x at the base spot, the ice's top, and his fishing hut (metres) [PROPOSED 2026-11-25][TUNE]. */
const J = 19.6;
const ICE_TOP = 1.85;
/** Open ice in front of the hut: the landing strip. */
const OPEN_ICE = 1.5;
/** From the hut's door to Jonh's spot: the slide under the roof. */
const HUT_DEPTH = 3.4;
/** The door is frozen stuck this far off the ice (the ball is 0.3 m across). */
const DOOR_GAP = 0.35;
const ROOF_Y = 4.3;
const DOOR = J - HUT_DEPTH;

/** Jonh's corner of the pond (the ice and his hut) goes wherever he fishes: see ObstacleData.followsJonh. */
const spot = (o: ObstacleData): ObstacleData => ({ ...o, followsJonh: true });

/**
 * Ice [DECIDED by owner 2026-11-25: "The ball skids when it lands on ice, so you can land short and slide
 * into Jonh"; name, layout and values PROPOSED, TUNE]. A snowy garden with a frozen pond. Jonh is ice
 * fishing inside his little hut on the far side of the pond: the roof stops a lob and the hut's roll-down
 * door is frozen stuck a hand's width off the ice, so nothing flies in. The way in is a low shot that lands
 * short on the open ice in front of the hut and skids under the door and across the floor into him. The
 * snow round the pond swallows a ball, so the pond's near edge matters; land too steep and the bounce hits
 * the door. Target positions move his corner of the pond (ice and hut) with him.
 */
export const POND_LEVEL: LevelData = {
  id: 'pond',
  mechanic: 'ice',
  name: 'Frozen Pond',
  difficulty: 2,
  // Joins the Daily Bonk the day after it shipped, so the Daily of the deploy day stays the one players already had.
  dailyFrom: '2026-11-26',
  bounds: GARDEN_BOUNDS,
  ground: { minX: 0, maxX: 25.6, minY: 0, maxY: 1.6, material: 'snow' },
  cannonSpawn: GARDEN_CANNON,
  jonhSpawn: jonhAt(J, ICE_TOP),
  obstacles: [
    spot(obstacle('pond-ice', DOOR - OPEN_ICE, J + 1.8, 1.6, ICE_TOP, 'ice', false)),
    spot(obstacle('hut-roof', DOOR, J + 1.0, ROOF_Y, ROOF_Y + 0.25, 'wood', false)),
    spot(obstacle('hut-door', DOOR, DOOR + 0.25, ICE_TOP + DOOR_GAP, ROOF_Y, 'canvas', false)),
    spot(obstacle('hut-back', J + 0.75, J + 1.0, ICE_TOP, ROOF_Y, 'wood', false)),
  ],
  arrivalLine: 'Shh. The fish can hear you.',
  multiplayerPositions: [
    { id: 'near', offsetX: -2.4, referenceSolutions: [{ angleDeg: 22, powerPercent: 31 }, { angleDeg: 30, powerPercent: 24 }] },
    { id: 'middle', offsetX: 0, referenceSolutions: [{ angleDeg: 22, powerPercent: 42 }, { angleDeg: 29, powerPercent: 35 }] },
    { id: 'far', offsetX: 2.4, referenceSolutions: [{ angleDeg: 31, powerPercent: 42 }, { angleDeg: 34, powerPercent: 40 }] },
  ],
  referenceSolutions: [{ angleDeg: 22, powerPercent: 42 }, { angleDeg: 29, powerPercent: 35 }],
};
