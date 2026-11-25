import { describe, expect, it } from 'vitest';
import { MAP_IDS } from '../src/levels';
import { CAMPAIGN_ORDER, campaignStatus, type MapRecord } from '../src/rules/campaign';
import {
  CHAPTERS, EXTRAS_CHAPTER_NAME, chapterCompletedBy, chapterLabel, chapterOf, chapterOpenedBy, chapterStatuses,
} from '../src/rules/chapters';

const best = (bestShots: number | null, hasStyle = false): MapRecord => ({ bestShots, hasStyle });
const solo = (...cleared: Array<[string, number]>): Record<string, MapRecord> =>
  Object.fromEntries(cleared.map(([id, shots]) => [id, best(shots)]));
/** The campaign's chaptered gardens; gardens added since (at the end) trail as "More gardens" until regrouped. */
const CHAPTERED = CAMPAIGN_ORDER.filter(id => CHAPTERS.some(c => c.mapIds.includes(id)));
const NEWER = CAMPAIGN_ORDER.filter(id => !CHAPTERED.includes(id));

describe('chapters', () => {
  it('are four chapters of three that cover the campaign order exactly, in order', () => {
    expect(CHAPTERS).toHaveLength(4);
    for (const chapter of CHAPTERS) expect(chapter.mapIds).toHaveLength(3);
    expect(CHAPTERS.flatMap(c => c.mapIds)).toEqual(CAMPAIGN_ORDER.slice(0, CHAPTERED.length));
    for (const chapter of CHAPTERS) expect(chapter.name.trim().length).toBeGreaterThan(0);
    expect(new Set(CHAPTERS.map(c => c.name)).size).toBe(CHAPTERS.length);
  });

  it('group every real map; gardens newer than the chapters trail as extras', () => {
    const chapters = chapterStatuses(campaignStatus(MAP_IDS, {}));
    expect(chapters.map(c => c.number)).toEqual([1, 2, 3, 4, ...(NEWER.length > 0 ? [null] : [])]);
    expect(chapters.flatMap(c => c.entries.map(e => e.mapId))).toEqual(campaignStatus(MAP_IDS, {}).map(e => e.mapId));
  });

  it('a fresh save: only chapter 1 is open, nothing complete, stars 0 of 9', () => {
    const chapters = chapterStatuses(campaignStatus(CHAPTERED, {}));
    expect(chapters.map(c => c.unlocked)).toEqual([true, false, false, false]);
    expect(chapters.map(c => c.complete)).toEqual([false, false, false, false]);
    expect(chapters[0]).toMatchObject({ stars: 0, maxStars: 9, cleared: 0, count: 3, lockedBy: null });
    expect(chapters[1]!.lockedBy).toBe('rooftop');
  });

  it('counts stars and cleared gardens per chapter without changing the star rules', () => {
    const entries = campaignStatus(CAMPAIGN_ORDER, solo(['backyard', 1], ['fence', 2], ['rooftop', 3], ['greenhouse', 1]));
    const [one, two] = chapterStatuses(entries);
    expect(one).toMatchObject({ stars: 3 + 2 + 1, cleared: 3, complete: true }); // shots 1, 2, 3
    expect(two).toMatchObject({ stars: 3, cleared: 1, complete: false, unlocked: true });
    // Chapter 2's first garden unlocked by clearing chapter 1's last, then washday by greenhouse: the campaign's own rule.
    expect(two!.entries.map(e => e.unlocked)).toEqual([true, true, false]);
  });

  it('a chapter is complete on any star, but a record without a hit does not clear a garden', () => {
    const tried = campaignStatus(CAMPAIGN_ORDER, { backyard: best(3), fence: best(3), rooftop: best(null) });
    expect(chapterStatuses(tried)[0]!.complete).toBe(false);
  });

  it('names the chapter a garden opens and its label', () => {
    const entries = campaignStatus(CAMPAIGN_ORDER, {});
    expect(chapterOpenedBy(entries, 'backyard')?.number).toBe(1);
    expect(chapterOpenedBy(entries, 'greenhouse')?.number).toBe(2);
    expect(chapterOpenedBy(entries, 'moon')?.number).toBe(4);
    expect(chapterOpenedBy(entries, 'fence')).toBeNull();
    expect(chapterOpenedBy(entries, 'valley')).toBeNull();
    expect(chapterOpenedBy(entries, 'nowhere')).toBeNull();
    expect(chapterLabel(chapterOf(entries, 'bankshot')!)).toBe('Chapter 3 · Showing Off');
  });

  describe('chapterCompletedBy', () => {
    const before = solo(['backyard', 2], ['fence', 1]);
    const after = { ...before, rooftop: best(3) };

    it('fires when the last garden of a chapter is first cleared', () => {
      const done = chapterCompletedBy(campaignStatus(CAMPAIGN_ORDER, before), campaignStatus(CAMPAIGN_ORDER, after), 'rooftop');
      expect(done?.id).toBe(CHAPTERS[0]!.id);
      expect(done?.stars).toBe(2 + 3 + 1); // shots 2, 1, 3 → 2, 3, 1 stars
    });

    it('fires when the last garden cleared is not the last in order (out-of-order clears)', () => {
      const early = campaignStatus(CAMPAIGN_ORDER, solo(['backyard', 1], ['rooftop', 1]));
      const late = campaignStatus(CAMPAIGN_ORDER, solo(['backyard', 1], ['rooftop', 1], ['fence', 1]));
      expect(chapterCompletedBy(early, late, 'fence')?.number).toBe(1);
    });

    it('does not fire for a garden that leaves the chapter unfinished', () => {
      const partial = campaignStatus(CAMPAIGN_ORDER, solo(['backyard', 1]));
      const next = campaignStatus(CAMPAIGN_ORDER, solo(['backyard', 1], ['fence', 1]));
      expect(chapterCompletedBy(partial, next, 'fence')).toBeNull();
    });

    it('does not fire again on a replay or an improved best (only once)', () => {
      const done = campaignStatus(CAMPAIGN_ORDER, after);
      const improved = campaignStatus(CAMPAIGN_ORDER, { ...after, rooftop: best(1) });
      expect(chapterCompletedBy(done, improved, 'rooftop')).toBeNull();
      expect(chapterCompletedBy(done, done, 'rooftop')).toBeNull();
    });

    it('a save that already had chapters complete gets no celebration for them', () => {
      // Chapter 1 complete and chapter 2 started in an older save; clearing chapter 2's first garden
      // must not celebrate chapter 1 (nor any later chapter).
      const old = campaignStatus(CAMPAIGN_ORDER, solo(['backyard', 1], ['fence', 1], ['rooftop', 1]));
      const next = campaignStatus(CAMPAIGN_ORDER, solo(['backyard', 1], ['fence', 1], ['rooftop', 1], ['greenhouse', 1]));
      for (const id of ['backyard', 'fence', 'rooftop', 'greenhouse']) expect(chapterCompletedBy(old, next, id)).toBeNull();
    });

    it('fires for the final chapter on the last garden, and each chapter on its own', () => {
      const all = CAMPAIGN_ORDER.map(id => [id, 2] as [string, number]);
      for (let c = 0; c < 4; c++) {
        const doneBefore = campaignStatus(CAMPAIGN_ORDER, solo(...all.slice(0, c * 3 + 2)));
        const doneAfter = campaignStatus(CAMPAIGN_ORDER, solo(...all.slice(0, c * 3 + 3)));
        const last = CAMPAIGN_ORDER[c * 3 + 2]!;
        expect(chapterCompletedBy(doneBefore, doneAfter, last)?.number).toBe(c + 1);
      }
    });
  });

  describe('maps outside the chapters', () => {
    const ids = [...CHAPTERED, 'zeta', 'omega'];

    it('form a trailing unnumbered group with no title card and no celebration', () => {
      const entries = campaignStatus(ids, {});
      const chapters = chapterStatuses(entries);
      expect(chapters).toHaveLength(5);
      const extras = chapters.at(-1)!;
      expect(extras).toMatchObject({ number: null, name: EXTRAS_CHAPTER_NAME, count: 2, complete: false });
      expect(chapterLabel(extras)).toBe(EXTRAS_CHAPTER_NAME);
      expect(chapterOpenedBy(entries, 'zeta')).toBeNull();
      const cleared = campaignStatus(ids, solo(...CHAPTERED.map(id => [id, 1] as [string, number]), ['zeta', 1], ['omega', 1]));
      expect(chapterStatuses(cleared).at(-1)!.complete).toBe(false);
      expect(chapterCompletedBy(campaignStatus(ids, solo(...CHAPTERED.map(id => [id, 1] as [string, number]), ['zeta', 1])), cleared, 'omega')).toBeNull();
    });

    it('a game missing some chapter maps drops empty chapters and keeps the numbers of the rest', () => {
      const without = CHAPTERED.filter(id => id !== 'greenhouse' && id !== 'washday' && id !== 'rubber');
      const chapters = chapterStatuses(campaignStatus(without, {}));
      expect(chapters.map(c => c.number)).toEqual([1, 3, 4]);
    });
  });
});
