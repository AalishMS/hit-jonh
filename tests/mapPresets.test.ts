import { describe, expect, it } from 'vitest';
import { MULTIPLAYER } from '../src/config/tuning';
import { DEFAULT_MAP_SET, inTourOrder, MAP_IDS, MAP_PRESETS, MAPS } from '../src/levels';
import { MultiplayerMatchMachine } from '../src/rules/multiplayerMatch';
import { validMaps } from '../src/rules/onlineRules';

const setups = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: i, pattern: 'solid', lastAngle: 45, lastPower: 50 }));

describe('one map list for every mode', () => {
  it('every map is playable in hot-seat and online', () => {
    for (const map of MAPS) {
      expect(map.multiplayerPositions).toHaveLength(MULTIPLAYER.shotsPerRound);
      expect(validMaps([map.id])).toBe(true);
      expect(() => new MultiplayerMatchMachine(setups(2), [map.id])).not.toThrow();
    }
  });

  it('presets are valid, distinct map sets in tour order', () => {
    expect(new Set(MAP_PRESETS.map(p => p.id)).size).toBe(MAP_PRESETS.length);
    for (const preset of MAP_PRESETS) {
      expect(validMaps(preset.maps)).toBe(true);
      expect(inTourOrder(preset.maps)).toEqual([...preset.maps]);
    }
    expect(validMaps(DEFAULT_MAP_SET)).toBe(true);
    expect(MAP_PRESETS.find(p => p.id === 'all')!.maps).toEqual(MAP_IDS);
  });

  it('orders picks by tour order and drops unknown ids', () => {
    expect(inTourOrder(['rooftop', 'nowhere', 'backyard'])).toEqual(['backyard', 'rooftop']);
  });
});
