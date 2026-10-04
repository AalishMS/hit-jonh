import type { Box2D, LevelData } from './types';

/** A new level view shared by rendering, discrete physics and swept detection. */
export function levelAtMultiplayerPosition(level: LevelData, positionId: string): LevelData {
  const position = level.multiplayerPositions?.find(p => p.id === positionId);
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
    referenceSolutions: position.referenceSolutions,
  };
}
