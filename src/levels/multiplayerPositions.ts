import type { Box2D, LevelData } from './types';

/** A new level view shared by rendering, discrete physics and swept detection. */
export function levelAtMultiplayerPosition(level: LevelData, positionId: string): LevelData {
  const position = level.multiplayerPositions.find(p => p.id === positionId);
  if (!position) throw new RangeError(`Unknown multiplayer position ${positionId} on ${level.id}`);
  const shift = (box: Box2D): Box2D => ({
    ...box, minX: box.minX + position.offsetX, maxX: box.maxX + position.offsetX,
  });
  return {
    ...level,
    jonhSpawn: {
      bodyBox: shift(level.jonhSpawn.bodyBox),
      ...(level.jonhSpawn.hatBox ? { hatBox: shift(level.jonhSpawn.hatBox) } : {}),
    },
    // Obstacles that are part of Jonh's spot (Frozen Pond: his hut and the ice) move with him; the rest stay put.
    ...(level.obstacles.some(o => o.followsJonh) ? {
      obstacles: level.obstacles.map(o => o.followsJonh ? { ...o, box: shift(o.box) } : o),
    } : {}),
    referenceSolutions: position.referenceSolutions,
    // Walking Jonh: the route moves with the spawn (offsets are relative); a delay shifts its timing.
    ...(level.jonhRoute && position.routeDelayS ? {
      jonhRoute: {
        waypoints: level.jonhRoute.waypoints.map((w, i) => i === 0 ? { ...w, pauseS: (w.pauseS ?? 0) + position.routeDelayS! } : w),
      },
    } : {}),
  };
}
