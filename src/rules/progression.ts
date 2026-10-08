/**
 * Retention: hat unlocks, solo hit streaks and the daily challenge. Pure (no Phaser, no DOM);
 * persisted by storage.ts. Nothing here affects physics or scoring.
 */

export const HAT_ORDER = ['boater', 'bowler', 'fez', 'party', 'propeller', 'chef', 'viking', 'crown'] as const;
export type HatName = typeof HAT_ORDER[number];

export interface Progress {
  totalHits: number;
  hatHits: number;
  trickHits: number;
  currentStreak: number;
  bestStreak: number;
  /** Map ids with a three-star solo result. */
  threeStarMaps: string[];
  /** Daily results by local date key (YYYY-MM-DD): stars (0 = attempted, failed). */
  daily: Record<string, number>;
  selectedHat: HatName;
}

export function freshProgress(): Progress {
  return { totalHits: 0, hatHits: 0, trickHits: 0, currentStreak: 0, bestStreak: 0, threeStarMaps: [], daily: {}, selectedHat: 'boater' };
}

export type ShotOutcome = 'ricochet_body' | 'body' | 'hat_only' | 'miss';

/** Every resolved shot. `streak` counts only in solo/daily (multiplayer turns are shared). */
export function recordShot(p: Progress, outcome: ShotOutcome, countsForStreak: boolean): Progress {
  const body = outcome === 'body' || outcome === 'ricochet_body';
  const next = { ...p, threeStarMaps: [...p.threeStarMaps], daily: { ...p.daily } };
  if (body) next.totalHits++;
  if (outcome === 'ricochet_body') next.trickHits++;
  if (outcome === 'hat_only') next.hatHits++;
  if (countsForStreak) {
    next.currentStreak = body ? p.currentStreak + 1 : 0;
    next.bestStreak = Math.max(p.bestStreak, next.currentStreak);
  }
  return next;
}

export function recordSoloFinish(p: Progress, mapId: string, stars: number): Progress {
  if (stars < 3 || p.threeStarMaps.includes(mapId)) return p;
  return { ...p, threeStarMaps: [...p.threeStarMaps, mapId] };
}

/** Only the first daily attempt of a date is recorded; replays never overwrite it. */
export function recordDaily(p: Progress, dateKey: string, stars: number): Progress {
  if (dateKey in p.daily) return p;
  return { ...p, daily: { ...p.daily, [dateKey]: Math.max(0, Math.min(3, Math.round(stars))) } };
}

export interface HatRule { name: string; hint: string; unlocked: (p: Progress, mapIds: readonly string[]) => boolean }

export const HAT_RULES: Record<HatName, HatRule> = {
  boater: { name: 'Straw boater', hint: 'His usual.', unlocked: () => true },
  bowler: { name: 'Bowler', hint: 'Hit Jonh once.', unlocked: p => p.totalHits >= 1 },
  fez: { name: 'Fez', hint: 'Knock his hat off without touching him.', unlocked: p => p.hatHits >= 1 },
  party: { name: 'Party hat', hint: 'Land a trick shot (ricochet hit).', unlocked: p => p.trickHits >= 1 },
  propeller: { name: 'Propeller cap', hint: 'Three stars on any garden.', unlocked: p => p.threeStarMaps.length >= 1 },
  chef: { name: "Chef's toque", hint: 'Hit Jonh in a Daily Bonk.', unlocked: p => Object.values(p.daily).some(stars => stars > 0) },
  viking: { name: 'Viking helmet', hint: '25 hits in total.', unlocked: p => p.totalHits >= 25 },
  crown: { name: 'Crown', hint: 'Three stars on every garden.', unlocked: (p, maps) => maps.length > 0 && maps.every(m => p.threeStarMaps.includes(m)) },
};

export function unlockedHats(p: Progress, mapIds: readonly string[]): HatName[] {
  return HAT_ORDER.filter(id => HAT_RULES[id].unlocked(p, mapIds));
}

export function newlyUnlocked(before: Progress, after: Progress, mapIds: readonly string[]): HatName[] {
  const had = new Set(unlockedHats(before, mapIds));
  return unlockedHats(after, mapIds).filter(id => !had.has(id));
}

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface DailyPick { mapId: string; positionId: string }

/**
 * Today's challenge: a map and one of its authored, physics-validated multiplayer target
 * positions, chosen deterministically from the date (same for every player that day).
 */
export function dailyChallenge(key: string, maps: ReadonlyArray<{ id: string; multiplayerPositions?: ReadonlyArray<{ id: string }> }>): DailyPick | null {
  const options = maps.flatMap(m => (m.multiplayerPositions ?? []).map(p => ({ mapId: m.id, positionId: p.id })));
  if (options.length === 0) return null;
  return options[hashString(`hit-jonh:${key}`) % options.length]!;
}

/** Consecutive days (ending today or yesterday) with a recorded daily attempt. */
export function dailyStreak(p: Progress, today: Date): number {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!(dateKey(day) in p.daily)) day.setDate(day.getDate() - 1);
  let count = 0;
  while (dateKey(day) in p.daily) {
    count++;
    day.setDate(day.getDate() - 1);
  }
  return count;
}

/** Validates untrusted saved data, falling back field by field. */
export function sanitizeProgress(raw: unknown, mapIds: readonly string[]): Progress {
  const p = freshProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return p;
  const r = raw as Record<string, unknown>;
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(Math.min(v, 1e6)) : 0);
  p.totalHits = count(r.totalHits);
  p.hatHits = count(r.hatHits);
  p.trickHits = count(r.trickHits);
  p.currentStreak = count(r.currentStreak);
  p.bestStreak = Math.max(count(r.bestStreak), p.currentStreak);
  if (Array.isArray(r.threeStarMaps)) p.threeStarMaps = [...new Set(r.threeStarMaps.filter((m): m is string => typeof m === 'string' && mapIds.includes(m)))];
  if (r.daily && typeof r.daily === 'object' && !Array.isArray(r.daily)) {
    for (const [k, v] of Object.entries(r.daily as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'number' && Number.isFinite(v)) p.daily[k] = Math.max(0, Math.min(3, Math.round(v)));
    }
  }
  if (typeof r.selectedHat === 'string' && (HAT_ORDER as readonly string[]).includes(r.selectedHat)) {
    const hat = r.selectedHat as HatName;
    p.selectedHat = HAT_RULES[hat].unlocked(p, mapIds) ? hat : 'boater';
  }
  return p;
}
