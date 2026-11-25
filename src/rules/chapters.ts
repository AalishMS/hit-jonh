/**
 * Campaign chapters [PROPOSED 2026-11-25, owner-approved idea: "groups of 3 with a chapter-complete
 * moment and a title card per chapter"]. The 15 gardens of `CAMPAIGN_ORDER` are grouped into five
 * chapters of three. Chapters are only a way of grouping and celebrating: unlock rules and star rules
 * stay exactly as in rules/campaign.ts. Pure: derived from `CampaignEntry` lists, no Phaser, no storage.
 *
 * A chapter is complete when all of its gardens are cleared (any star). Nothing is stored for it: a
 * result completes a chapter "for the first time" exactly when the chapter was not complete in the
 * campaign status before the result and is after it, so it fires once, and a save that already has
 * chapters complete is never celebrated retroactively.
 *
 * Maps outside every chapter (new maps join the campaign at the end) form a trailing, unnumbered
 * "More gardens" group with no title card and no chapter-complete moment (it is open-ended).
 */

import type { CampaignEntry } from './campaign';

export interface ChapterDef {
  id: string;
  name: string;
  /** The chapter's gardens, in campaign order. */
  mapIds: readonly string[];
}

/**
 * The chapters [PROPOSED]: one beat of the campaign each (Jonh at ease, hazards, showing off, going too far, and
 * Chapter 5 [PROPOSED 2026-11-25]: Jonh hides in a hut, a shelter and a scrapyard, and the ice, the ramp and the
 * magnet find him anyway).
 */
export const CHAPTERS: readonly ChapterDef[] = [
  { id: 'one', name: 'Jonh Is Reading', mapIds: ['backyard', 'fence', 'rooftop'] },
  { id: 'two', name: 'Mild Inconveniences', mapIds: ['greenhouse', 'washday', 'rubber'] },
  { id: 'three', name: 'Showing Off', mapIds: ['bankshot', 'magic', 'stroll'] },
  { id: 'four', name: 'Going Too Far', mapIds: ['moon', 'trampoline', 'valley'] },
  { id: 'five', name: 'Nowhere to Hide', mapIds: ['pond', 'skatepark', 'magnet'] },
];

export const EXTRAS_CHAPTER_ID = 'extras';
export const EXTRAS_CHAPTER_NAME = 'More gardens';

export interface ChapterStatus {
  id: string;
  /** 1-based chapter number; null for the trailing "More gardens" group. */
  number: number | null;
  name: string;
  entries: CampaignEntry[];
  stars: number;
  maxStars: number;
  /** Gardens cleared (any star). */
  cleared: number;
  count: number;
  /** Every garden cleared. Never true for the open-ended "More gardens" group. */
  complete: boolean;
  /** At least one of its gardens can be played (a locked chapter's first garden is locked). */
  unlocked: boolean;
  /** For a locked chapter: the garden to clear to open it. */
  lockedBy: string | null;
}

function statusOf(id: string, number: number | null, name: string, entries: CampaignEntry[]): ChapterStatus {
  const cleared = entries.filter(e => e.cleared).length;
  const first = entries[0];
  return {
    id, number, name, entries,
    stars: entries.reduce((sum, e) => sum + e.stars, 0),
    maxStars: entries.length * 3,
    cleared,
    count: entries.length,
    complete: number !== null && entries.length > 0 && cleared === entries.length,
    unlocked: entries.some(e => e.unlocked),
    lockedBy: first && !first.unlocked ? first.lockedBy : null,
  };
}

/**
 * The chapters present in `entries` (a map missing from the game is skipped, an empty chapter is
 * dropped), in campaign order, then the unnumbered "More gardens" group if any garden is left over.
 */
export function chapterStatuses(entries: readonly CampaignEntry[]): ChapterStatus[] {
  const byMap = new Map(entries.map(e => [e.mapId, e]));
  const grouped = new Set<string>();
  const out: ChapterStatus[] = [];
  CHAPTERS.forEach((chapter, i) => {
    const mine = chapter.mapIds.map(id => byMap.get(id)).filter((e): e is CampaignEntry => e !== undefined);
    for (const e of mine) grouped.add(e.mapId);
    if (mine.length) out.push(statusOf(chapter.id, i + 1, chapter.name, mine));
  });
  const rest = entries.filter(e => !grouped.has(e.mapId));
  if (rest.length) out.push(statusOf(EXTRAS_CHAPTER_ID, null, EXTRAS_CHAPTER_NAME, rest));
  return out;
}

/** The chapter a garden belongs to, or null if the garden is not in the campaign. */
export function chapterOf(entries: readonly CampaignEntry[], mapId: string): ChapterStatus | null {
  return chapterStatuses(entries).find(c => c.entries.some(e => e.mapId === mapId)) ?? null;
}

/**
 * The numbered chapter whose first garden is `mapId` (that garden shows the chapter on its title
 * card), or null for any other garden and for the "More gardens" group.
 */
export function chapterOpenedBy(entries: readonly CampaignEntry[], mapId: string): ChapterStatus | null {
  const chapter = chapterOf(entries, mapId);
  return chapter && chapter.number !== null && chapter.entries[0]?.mapId === mapId ? chapter : null;
}

/**
 * The chapter this result completed for the first time: the garden's chapter is complete in `after`
 * and was not in `before` (the campaign status from the saved bests before and after the result).
 */
export function chapterCompletedBy(before: readonly CampaignEntry[], after: readonly CampaignEntry[], mapId: string): ChapterStatus | null {
  const now = chapterOf(after, mapId);
  if (!now || !now.complete) return null;
  const was = chapterOf(before, mapId);
  return was && was.id === now.id && was.complete ? null : now;
}

/** "Chapter 2 · Mild Inconveniences" for a numbered chapter, the plain name otherwise. */
export function chapterLabel(chapter: Pick<ChapterStatus, 'number' | 'name'>): string {
  return chapter.number === null ? chapter.name : `Chapter ${chapter.number} · ${chapter.name}`;
}
