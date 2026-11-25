import { BACKYARD_LEVEL } from './backyard';
import { BANKSHOT_LEVEL } from './bankshot';
import { FENCE_LEVEL } from './fence';
import { GREENHOUSE_LEVEL } from './greenhouse';
import { MAGIC_LEVEL } from './magic';
import { MAGNET_LEVEL } from './magnet';
import { MOON_LEVEL } from './moon';
import { POND_LEVEL } from './pond';
import { ROOFTOP_LEVEL } from './rooftop';
import { RUBBER_LEVEL } from './rubber';
import { SKATEPARK_LEVEL } from './skatepark';
import { STROLL_LEVEL } from './stroll';
import { TRAMPOLINE_LEVEL } from './trampoline';
import { VALLEY_LEVEL } from './valley';
import { WASHDAY_LEVEL } from './washday';
import type { LevelData } from './types';

/** Every map, in menu and tour order. Solo, Daily, hot-seat and online all use this one list. */
export const MAPS: LevelData[] = [
  BACKYARD_LEVEL,
  FENCE_LEVEL,
  ROOFTOP_LEVEL,
  RUBBER_LEVEL,
  BANKSHOT_LEVEL,
  TRAMPOLINE_LEVEL,
  MOON_LEVEL,
  VALLEY_LEVEL,
  GREENHOUSE_LEVEL,
  MAGIC_LEVEL,
  WASHDAY_LEVEL,
  STROLL_LEVEL,
  POND_LEVEL,
  SKATEPARK_LEVEL,
  MAGNET_LEVEL,
];

export const MAP_IDS: readonly string[] = MAPS.map(m => m.id);

export interface MapPreset { id: string; name: string; maps: readonly string[] }

/** Multiplayer map-set shortcuts [PROPOSED]; any distinct subset of MAP_IDS is also allowed. */
export const MAP_PRESETS: readonly MapPreset[] = [
  { id: 'classic', name: 'Classic tour', maps: ['backyard', 'fence', 'rooftop', 'rubber'] },
  { id: 'new', name: 'Trick shots', maps: ['bankshot', 'trampoline', 'moon', 'valley', 'greenhouse', 'magic', 'washday', 'stroll', 'pond', 'skatepark', 'magnet'] },
  { id: 'all', name: 'Every map', maps: MAP_IDS },
];

/** The preset a new hot-seat match or online room starts with. */
export const DEFAULT_MAP_SET: readonly string[] = MAP_PRESETS[0]!.maps;

/** `ids` reordered into tour order (MAPS order), unknown ids dropped. */
export function inTourOrder(ids: Iterable<string>): string[] {
  const chosen = new Set(ids);
  return MAP_IDS.filter(id => chosen.has(id));
}

export { BACKYARD_LEVEL, BANKSHOT_LEVEL, FENCE_LEVEL, GREENHOUSE_LEVEL, MAGIC_LEVEL, MAGNET_LEVEL, MOON_LEVEL, POND_LEVEL, ROOFTOP_LEVEL, RUBBER_LEVEL, SKATEPARK_LEVEL, STROLL_LEVEL, TRAMPOLINE_LEVEL, VALLEY_LEVEL, WASHDAY_LEVEL };
