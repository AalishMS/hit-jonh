import { BACKYARD_LEVEL } from './backyard';
import { FENCE_LEVEL } from './fence';
import { ROOFTOP_LEVEL } from './rooftop';
import { RUBBER_LEVEL } from './rubber';
import type { LevelData } from './types';

/** Every map, in menu and tour order. Solo, Daily, hot-seat and online all use this one list. */
export const MAPS: LevelData[] = [
  BACKYARD_LEVEL,
  FENCE_LEVEL,
  ROOFTOP_LEVEL,
  RUBBER_LEVEL,
];

export const MAP_IDS: readonly string[] = MAPS.map(m => m.id);

export interface MapPreset { id: string; name: string; maps: readonly string[] }

/** Multiplayer map-set shortcuts [PROPOSED]; any distinct subset of MAP_IDS is also allowed. */
export const MAP_PRESETS: readonly MapPreset[] = [
  { id: 'classic', name: 'Classic tour', maps: ['backyard', 'fence', 'rooftop', 'rubber'] },
  { id: 'all', name: 'Every map', maps: MAP_IDS },
];

/** The preset a new hot-seat match or online room starts with. */
export const DEFAULT_MAP_SET: readonly string[] = MAP_PRESETS[0]!.maps;

/** `ids` reordered into tour order (MAPS order), unknown ids dropped. */
export function inTourOrder(ids: Iterable<string>): string[] {
  const chosen = new Set(ids);
  return MAP_IDS.filter(id => chosen.has(id));
}

export { BACKYARD_LEVEL, FENCE_LEVEL, ROOFTOP_LEVEL, RUBBER_LEVEL };
