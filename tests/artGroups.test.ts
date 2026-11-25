import { describe, expect, it } from 'vitest';
import { ALL_ART, ART_GROUPS, CORE_GROUP, cosmeticArtGroups, levelArtGroups, playerBarrelGroups } from '../src/art/library';
import { barrelKey } from '../src/art/cannonArt';
import { obstacleKey } from '../src/art/sceneryArt';
import { MULTIPLAYER } from '../src/config/tuning';
import { MAPS } from '../src/levels';
import { CANNON_SKIN_ORDER, OUTFIT_ORDER } from '../src/rules/cosmetics';
import { HAT_IDS } from '../src/art/jonhArt';
import { outfitKeys } from '../src/art/outfitArt';

describe('lazy art groups', () => {
  it('cover every piece of art exactly once', () => {
    const grouped = [...ART_GROUPS.values()].flat().map(def => def.key);
    expect(grouped.length).toBe(new Set(grouped).size);
    expect(new Set(grouped)).toEqual(new Set(ALL_ART.map(def => def.key)));
  });

  it('keep the boot set small: no map, hat, outfit or painted barrel art in core', () => {
    const core = new Set(ART_GROUPS.get(CORE_GROUP)!.map(def => def.key));
    expect(core.has('cannon-barrel')).toBe(true);
    expect(core.has('jonh-torso')).toBe(false);
    expect(core.size).toBeLessThan(ALL_ART.length / 3);
    for (const level of MAPS) for (const obs of level.obstacles) expect(core.has(obstacleKey(level.id, obs))).toBe(false);
  });

  it('give every garden everything its scenery draws', () => {
    for (const level of MAPS) {
      const keys = new Set(levelArtGroups(level.id).flatMap(group => ART_GROUPS.get(group)!.map(def => def.key)));
      for (const obs of level.obstacles) expect(keys.has(obstacleKey(level.id, obs)), `${level.id}/${obs.id}`).toBe(true);
      expect(keys.has('sun-rays') || level.id === 'moon').toBe(true);
      expect([...keys].some(key => key.startsWith('sky-'))).toBe(true);
      expect([...keys].some(key => key.startsWith('far-'))).toBe(true);
    }
  });

  it('give every hat, outfit, cannon skin and player barrel its own group', () => {
    for (const hat of HAT_IDS) for (const outfit of OUTFIT_ORDER) {
      for (const cannon of CANNON_SKIN_ORDER) {
        const keys = new Set([CORE_GROUP, ...cosmeticArtGroups({ hat, outfit, cannon })].flatMap(group => ART_GROUPS.get(group)!.map(def => def.key)));
        expect(keys.has(`hat-${hat}`)).toBe(true);
        for (const key of Object.values(outfitKeys(outfit))) expect(keys.has(key)).toBe(true);
      }
    }
    for (const color of MULTIPLAYER.colors) for (const pattern of MULTIPLAYER.patterns) {
      const [group] = playerBarrelGroups([{ color, pattern }]);
      expect(ART_GROUPS.get(group!)!.map(def => def.key)).toEqual([barrelKey(color, pattern)]);
    }
  });
});
