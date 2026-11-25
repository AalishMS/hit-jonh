import { describe, expect, it } from 'vitest';
import { COSMETIC_GATES, sanitizeCannonSkin, unlockedCannonSkins, unlockedOutfits } from '../src/rules/cosmetics';
import { FIRST_RELEASE_MAPS, freshProgress, recordEarned, sanitizeProgress, unlockedHats, type Progress } from '../src/rules/progression';

const TWELVE = [...FIRST_RELEASE_MAPS, 'greenhouse', 'magic', 'washday', 'stroll'];
const noStars = { stars: 0, cleared: 0 };

/** A save's progress as JSON would bring it back (what `sanitizeProgress` sees). */
const reload = (p: Progress, mapIds: readonly string[], ctx = noStars) => sanitizeProgress(JSON.parse(JSON.stringify(p)), mapIds, ctx);

describe('earned cosmetics stay earned (next 10, item 2)', () => {
  it('keeps the Crown after new gardens join', () => {
    const crowned = { ...freshProgress(), threeStarMaps: [...FIRST_RELEASE_MAPS], selectedHat: 'crown' as const };
    // Earned with eight gardens...
    const saved = reload(crowned, FIRST_RELEASE_MAPS);
    expect(saved.earnedHats).toContain('crown');
    expect(saved.selectedHat).toBe('crown');
    // ...still worn after four more gardens are added, although its rule now asks for twelve.
    const later = reload(saved, TWELVE);
    expect(unlockedHats(later, TWELVE)).toContain('crown');
    expect(later.selectedHat).toBe('crown');
  });

  it('gives a first-release save its Crown once (no earned lists yet)', () => {
    const legacy: Record<string, unknown> = { ...freshProgress(), threeStarMaps: [...FIRST_RELEASE_MAPS], selectedHat: 'crown' };
    delete legacy.earnedHats;
    delete legacy.earnedCannons;
    delete legacy.earnedOutfits;
    const migrated = sanitizeProgress(legacy, TWELVE);
    expect(migrated.earnedHats).toContain('crown');
    expect(migrated.selectedHat).toBe('crown');

    // Only a save without the earned lists is migrated: a current save must earn the Crown on all twelve.
    const current = sanitizeProgress({ ...legacy, earnedHats: [] }, TWELVE);
    expect(current.earnedHats).not.toContain('crown');
    expect(current.selectedHat).toBe('boater');

    // A first-release save short of the eight does not get it.
    const short = sanitizeProgress({ ...legacy, threeStarMaps: FIRST_RELEASE_MAPS.slice(1) }, TWELVE);
    expect(short.earnedHats).not.toContain('crown');
  });

  it('keeps star-gated cannons and outfits when the star gate rises', () => {
    const allStars = { stars: COSMETIC_GATES.starsAll, cleared: TWELVE.length };
    const golden = recordEarned({ ...freshProgress(), selectedCannon: 'golden' }, TWELVE, allStars);
    expect(golden.earnedCannons).toEqual(expect.arrayContaining(['golden', 'moonshot', 'admiral', 'garden']));
    expect(golden.earnedOutfits).toEqual(expect.arrayContaining(['hawaiian', 'tuxedo']));
    // Fewer stars than the gate now asks for (more gardens): still unlocked, still selectable.
    const fewer = { stars: COSMETIC_GATES.starsAll - 6, cleared: TWELVE.length - 2 };
    expect(unlockedCannonSkins(golden, fewer)).toContain('golden');
    expect(unlockedOutfits(golden, noStars)).toContain('tuxedo');
    expect(sanitizeCannonSkin('golden', golden, fewer)).toBe('golden');
    expect(reload(golden, TWELVE, fewer).selectedCannon).toBe('golden');
  });

  it('records what is unlocked on every load and never removes anything', () => {
    const p = { ...freshProgress(), totalHits: 30 };
    const saved = reload(p, TWELVE);
    expect(saved.earnedHats).toEqual(['boater', 'bowler', 'viking']);
    expect(saved.earnedCannons).toEqual(['classic']);
    expect(saved.earnedOutfits).toEqual(['cardigan']);
    // recordEarned is a no-op (same object) when nothing new was earned.
    expect(recordEarned(saved, TWELVE, noStars)).toBe(saved);
    // Losing the underlying counts (it can't happen in play, only by editing) keeps the earned items.
    const edited = reload({ ...saved, totalHits: 0 }, TWELVE);
    expect(unlockedHats(edited, TWELVE)).toEqual(expect.arrayContaining(['bowler', 'viking']));
  });

  it('sanitizes the earned lists', () => {
    const raw = { ...freshProgress(), earnedHats: ['crown', 'crown', 'tophat', 7, null], earnedCannons: ['golden', 'laser'], earnedOutfits: 'tuxedo' };
    const p = sanitizeProgress(raw, TWELVE);
    expect(p.earnedHats).toEqual(['boater', 'crown']);
    expect(p.earnedCannons).toEqual(['golden', 'classic']);
    expect(p.earnedOutfits).toEqual(['cardigan']);
  });
});
