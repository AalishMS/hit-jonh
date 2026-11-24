import { describe, expect, it } from 'vitest';
import { cannonSkinFigureSvg, cannonSkinKeys } from '../src/art/cannonArt';
import { ALL_ART } from '../src/art/library';
import { outfitFigureSvg, outfitKeys } from '../src/art/outfitArt';
import { MAP_IDS } from '../src/levels';
import { CAMPAIGN_ORDER } from '../src/rules/campaign';
import {
  CANNON_SKIN_ORDER, CANNON_SKIN_RULES, COSMETIC_GATES, OUTFIT_ORDER, OUTFIT_RULES, cosmeticContext,
  newlyUnlockedCannonSkins, newlyUnlockedOutfits, unlockedCannonSkins, unlockedOutfits, type CosmeticContext,
} from '../src/rules/cosmetics';
import { freshProgress, recordDaily, recordShot, sanitizeProgress } from '../src/rules/progression';

const none: CosmeticContext = { stars: 0, cleared: 0 };
const withStars = (stars: number, cleared = 0): CosmeticContext => ({ stars, cleared });

describe('cosmetic unlock rules', () => {
  it('a fresh save has only the classic cannon and the cardigan', () => {
    expect(unlockedCannonSkins(freshProgress(), none)).toEqual(['classic']);
    expect(unlockedOutfits(freshProgress(), none)).toEqual(['cardigan']);
    expect(freshProgress()).toMatchObject({ selectedCannon: 'classic', selectedOutfit: 'cardigan' });
  });

  it('gives every item a name and a hint', () => {
    for (const id of CANNON_SKIN_ORDER) expect(CANNON_SKIN_RULES[id].name.length + CANNON_SKIN_RULES[id].hint.length).toBeGreaterThan(5);
    for (const id of OUTFIT_ORDER) expect(OUTFIT_RULES[id].name.length + OUTFIT_RULES[id].hint.length).toBeGreaterThan(5);
  });

  it('opens the star gates at 6, 12, 18 and 24 stars', () => {
    expect(unlockedCannonSkins(freshProgress(), withStars(5))).toEqual(['classic']);
    expect(unlockedCannonSkins(freshProgress(), withStars(6))).toContain('admiral');
    expect(unlockedCannonSkins(freshProgress(), withStars(12))).toContain('moonshot');
    expect(unlockedOutfits(freshProgress(), withStars(11))).not.toContain('hawaiian');
    expect(unlockedOutfits(freshProgress(), withStars(12))).toContain('hawaiian');
    expect(unlockedOutfits(freshProgress(), withStars(18))).toContain('tuxedo');
    expect(unlockedCannonSkins(freshProgress(), withStars(23))).not.toContain('golden');
    expect(unlockedCannonSkins(freshProgress(), withStars(24))).toContain('golden');
    expect(COSMETIC_GATES.stars24).toBe(CAMPAIGN_ORDER.length * 3);
  });

  it('opens the feat gates', () => {
    expect(unlockedCannonSkins(freshProgress(), withStars(0, 3))).not.toContain('garden');
    expect(unlockedCannonSkins(freshProgress(), withStars(0, 4))).toContain('garden');
    const tricks = { ...freshProgress(), trickHits: 3 };
    expect(unlockedCannonSkins(tricks, none)).toContain('pirate');
    expect(unlockedCannonSkins({ ...tricks, trickHits: 2 }, none)).not.toContain('pirate');
    expect(unlockedOutfits({ ...freshProgress(), bestStreak: 5 }, none)).toContain('argyle');
    expect(unlockedOutfits({ ...freshProgress(), bestStreak: 4 }, none)).not.toContain('argyle');
    expect(unlockedOutfits({ ...freshProgress(), totalHits: 50 }, none)).toContain('tracksuit');
    expect(unlockedOutfits({ ...freshProgress(), totalHits: 49 }, none)).not.toContain('tracksuit');
    expect(unlockedOutfits(recordDaily(freshProgress(), '2026-11-01', 3), none)).toContain('pyjamas');
    expect(unlockedOutfits(recordDaily(freshProgress(), '2026-11-01', 2), none)).not.toContain('pyjamas');
    let days = freshProgress();
    for (const d of ['2026-11-01', '2026-11-03', '2026-11-09']) days = recordDaily(days, d, 0);
    expect(unlockedOutfits(days, none)).toContain('sundayBest');
    expect(unlockedOutfits({ ...days, daily: { '2026-11-01': 1, '2026-11-02': 1 } }, none)).not.toContain('sundayBest');
  });

  it('reports what a step newly unlocked, and never re-reports', () => {
    let p = freshProgress();
    for (let i = 0; i < 5; i++) p = recordShot(p, 'body', true);
    expect(newlyUnlockedOutfits(freshProgress(), p, none)).toEqual(['argyle']);
    expect(newlyUnlockedOutfits(p, p, none)).toEqual([]);
    expect(newlyUnlockedCannonSkins(p, p, withStars(5), withStars(6))).toEqual(['admiral']);
    expect(newlyUnlockedCannonSkins(p, p, withStars(6), withStars(24))).toEqual(['moonshot', 'golden']);
  });

  it('derives stars and gardens cleared from the saved solo bests', () => {
    const solo = { [CAMPAIGN_ORDER[0]!]: { bestShots: 1, hasStyle: false }, [CAMPAIGN_ORDER[1]!]: { bestShots: 3, hasStyle: true } };
    expect(cosmeticContext(MAP_IDS, solo)).toEqual({ stars: 4, cleared: 2 });
    expect(cosmeticContext(MAP_IDS, {})).toEqual(none);
  });
});

describe('saved cosmetic selection', () => {
  it('old saves without the new fields get the defaults', () => {
    const p = sanitizeProgress({ totalHits: 3, selectedHat: 'bowler' }, MAP_IDS);
    expect(p).toMatchObject({ selectedHat: 'bowler', selectedCannon: 'classic', selectedOutfit: 'cardigan' });
  });

  it('unknown ids and non-strings fall back to the default', () => {
    const raw = { selectedCannon: 'rocket', selectedOutfit: 42 };
    expect(sanitizeProgress(raw, MAP_IDS, withStars(24, 8))).toMatchObject({ selectedCannon: 'classic', selectedOutfit: 'cardigan' });
  });

  it('a locked selection falls back; an unlocked one is kept', () => {
    expect(sanitizeProgress({ selectedCannon: 'golden', selectedOutfit: 'tuxedo' }, MAP_IDS, withStars(17, 8))).toMatchObject({ selectedCannon: 'classic', selectedOutfit: 'cardigan' });
    expect(sanitizeProgress({ selectedCannon: 'golden', selectedOutfit: 'tuxedo' }, MAP_IDS, withStars(24, 8))).toMatchObject({ selectedCannon: 'golden', selectedOutfit: 'tuxedo' });
    expect(sanitizeProgress({ bestStreak: 5, selectedOutfit: 'argyle' }, MAP_IDS).selectedOutfit).toBe('argyle');
    expect(sanitizeProgress({ bestStreak: 4, selectedOutfit: 'argyle' }, MAP_IDS).selectedOutfit).toBe('cardigan');
  });
});

describe('cosmetic art', () => {
  const keys = new Set(ALL_ART.map(a => a.key));

  it('registers art for every skin and outfit under the documented keys', () => {
    for (const id of CANNON_SKIN_ORDER) for (const key of Object.values(cannonSkinKeys(id))) expect(keys.has(key), key).toBe(true);
    for (const id of OUTFIT_ORDER) for (const key of Object.values(outfitKeys(id))) expect(keys.has(key), key).toBe(true);
  });

  it('keeps unique keys', () => {
    expect(keys.size).toBe(ALL_ART.length);
  });

  it('draws each variant on exactly the same canvas and pivot as the original', () => {
    const byKey = new Map(ALL_ART.map(a => [a.key, a]));
    const same = (a: string, b: string) => {
      const x = byKey.get(a)!, y = byKey.get(b)!;
      expect([x.w, x.h, x.ax, x.ay, x.scale], `${a} vs ${b}`).toEqual([y.w, y.h, y.ax, y.ay, y.scale]);
    };
    for (const id of CANNON_SKIN_ORDER) {
      const k = cannonSkinKeys(id), c = cannonSkinKeys('classic');
      same(k.barrel, c.barrel); same(k.carriage, c.carriage); same(k.wheel, c.wheel);
    }
    for (const id of OUTFIT_ORDER) {
      const k = outfitKeys(id), c = outfitKeys('cardigan');
      same(k.torso, c.torso); same(k.legs, c.legs); same(k.armFront, c.armFront); same(k.armBack, c.armBack);
    }
  });

  it('builds a wardrobe preview figure for every item', () => {
    for (const id of CANNON_SKIN_ORDER) expect(cannonSkinFigureSvg(id)).toContain('<svg');
    for (const id of OUTFIT_ORDER) expect(outfitFigureSvg(id)).toContain('class="jonh-figure"');
  });
});
