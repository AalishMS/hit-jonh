/**
 * Feats: Jonh's long-term goal list (next 10, item 6). Every cosmetic unlock rule appears here as a
 * feat with progress and its rewards, plus a few feats that are only for bragging. Pure: no Phaser,
 * no DOM. The cosmetic rules stay the source of truth for what is unlocked; tests/feats.test.ts
 * proves each feat completes exactly when the cosmetics it lists unlock.
 *
 * [PROPOSED 2026-11-25] Names, wording, grouping and the new bragging feats (Neighbourhood legend,
 * Hat trick, Moonstruck, Long distance, Grand tour, Week of bonks).
 */
import { COSMETIC_GATES as G, type CannonSkinId, type CosmeticContext, type OutfitId } from './cosmetics';
import { bestDailyStreak, type HatName, type Progress } from './progression';

export type FeatGroup = 'hits' | 'tricks' | 'campaign' | 'gardens' | 'daily';

export const FEAT_GROUPS: ReadonlyArray<{ id: FeatGroup; title: string }> = [
  { id: 'hits', title: 'Bonks' },
  { id: 'tricks', title: 'Trick shots' },
  { id: 'campaign', title: 'Campaign' },
  { id: 'gardens', title: 'Gardens' },
  { id: 'daily', title: 'Daily Bonk' },
];

export type FeatReward = { kind: 'hat'; id: HatName } | { kind: 'outfit'; id: OutfitId } | { kind: 'cannon'; id: CannonSkinId };

/** Everything a feat may look at: saved progress, the campaign totals and every map id. */
export interface FeatInput {
  progress: Progress;
  ctx: CosmeticContext;
  mapIds: readonly string[];
}

export interface FeatDef {
  id: string;
  group: FeatGroup;
  name: string;
  /** What to do, as a short instruction. */
  hint: string;
  target: (input: FeatInput) => number;
  value: (input: FeatInput) => number;
  /** Cosmetics this feat unlocks (none: bragging rights only). */
  rewards: readonly FeatReward[];
}

const fixed = (n: number) => () => n;
const hitOn = (mapId: string) => ({ progress }: FeatInput) => (progress.hitMaps.includes(mapId) ? 1 : 0);

export const FEATS: readonly FeatDef[] = [
  { id: 'first-hit', group: 'hits', name: 'First bonk', hint: 'Hit Jonh.', target: fixed(1), value: i => i.progress.totalHits, rewards: [{ kind: 'hat', id: 'bowler' }] },
  { id: 'hats-off', group: 'hits', name: "Hat's off", hint: 'Knock his hat off without touching him.', target: fixed(1), value: i => i.progress.hatHits, rewards: [{ kind: 'hat', id: 'fez' }] },
  { id: 'streak', group: 'hits', name: 'On a roll', hint: `Hit Jonh ${G.streak} times in a row.`, target: fixed(G.streak), value: i => i.progress.bestStreak, rewards: [{ kind: 'outfit', id: 'argyle' }] },
  { id: 'hits25', group: 'hits', name: 'Regular', hint: 'Hit Jonh 25 times.', target: fixed(25), value: i => i.progress.totalHits, rewards: [{ kind: 'hat', id: 'viking' }] },
  { id: 'hits50', group: 'hits', name: 'Menace', hint: `Hit Jonh ${G.totalHits} times.`, target: fixed(G.totalHits), value: i => i.progress.totalHits, rewards: [{ kind: 'outfit', id: 'tracksuit' }] },
  { id: 'hits100', group: 'hits', name: 'Neighbourhood legend', hint: 'Hit Jonh 100 times.', target: fixed(100), value: i => i.progress.totalHits, rewards: [] },

  { id: 'trick', group: 'tricks', name: 'Bank on it', hint: 'Land a trick shot (a ricochet hit).', target: fixed(1), value: i => i.progress.trickHits, rewards: [{ kind: 'hat', id: 'party' }] },
  { id: 'tricks3', group: 'tricks', name: 'Geometry', hint: `Land ${G.tricks} trick shots.`, target: fixed(G.tricks), value: i => i.progress.trickHits, rewards: [{ kind: 'cannon', id: 'pirate' }] },
  { id: 'trick-streak', group: 'tricks', name: 'Hat trick', hint: 'Land 3 trick shots in a row.', target: fixed(3), value: i => i.progress.bestTrickStreak, rewards: [] },

  { id: 'three-star', group: 'campaign', name: 'Clean shot', hint: 'Three stars on any garden.', target: fixed(1), value: i => i.progress.threeStarMaps.length, rewards: [{ kind: 'hat', id: 'propeller' }] },
  { id: 'stars6', group: 'campaign', name: 'Six-pointer', hint: `Earn ${G.stars6} stars in the gardens.`, target: fixed(G.stars6), value: i => i.ctx.stars, rewards: [{ kind: 'cannon', id: 'admiral' }] },
  { id: 'cleared4', group: 'campaign', name: 'Green fingers', hint: `Clear ${G.gardensCleared} gardens.`, target: fixed(G.gardensCleared), value: i => i.ctx.cleared, rewards: [{ kind: 'cannon', id: 'garden' }] },
  { id: 'stars12', group: 'campaign', name: 'Star gazer', hint: `Earn ${G.stars12} stars in the gardens.`, target: fixed(G.stars12), value: i => i.ctx.stars, rewards: [{ kind: 'cannon', id: 'moonshot' }, { kind: 'outfit', id: 'hawaiian' }] },
  { id: 'stars18', group: 'campaign', name: 'Top of the class', hint: `Earn ${G.stars18} stars in the gardens.`, target: fixed(G.stars18), value: i => i.ctx.stars, rewards: [{ kind: 'outfit', id: 'tuxedo' }] },
  { id: 'stars-all', group: 'campaign', name: 'Every last star', hint: 'Three stars on every garden.', target: fixed(G.starsAll), value: i => i.ctx.stars, rewards: [{ kind: 'cannon', id: 'golden' }, { kind: 'hat', id: 'crown' }] },

  { id: 'moon', group: 'gardens', name: 'Moonstruck', hint: 'Hit Jonh at the Lunar Picnic.', target: fixed(1), value: hitOn('moon'), rewards: [] },
  { id: 'valley', group: 'gardens', name: 'Long distance', hint: 'Hit Jonh across the Valley.', target: fixed(1), value: hitOn('valley'), rewards: [] },
  { id: 'every-garden', group: 'gardens', name: 'Grand tour', hint: 'Hit Jonh in every garden.', target: i => i.mapIds.length, value: i => i.mapIds.filter(id => i.progress.hitMaps.includes(id)).length, rewards: [] },

  { id: 'daily-hit', group: 'daily', name: 'Daily bread', hint: 'Hit Jonh in a Daily Bonk.', target: fixed(1), value: i => (Object.values(i.progress.daily).some(stars => stars > 0) ? 1 : 0), rewards: [{ kind: 'hat', id: 'chef' }] },
  { id: 'daily-3', group: 'daily', name: 'Early bird', hint: 'Three stars in a Daily Bonk.', target: fixed(1), value: i => (Object.values(i.progress.daily).some(stars => stars >= 3) ? 1 : 0), rewards: [{ kind: 'outfit', id: 'pyjamas' }] },
  { id: 'daily-days', group: 'daily', name: 'Regular reader', hint: `Play the Daily Bonk on ${G.dailyDays} different days.`, target: fixed(G.dailyDays), value: i => Object.keys(i.progress.daily).length, rewards: [{ kind: 'outfit', id: 'sundayBest' }] },
  { id: 'daily-week', group: 'daily', name: 'Week of bonks', hint: 'Play the Daily Bonk 7 days in a row.', target: fixed(7), value: i => bestDailyStreak(i.progress), rewards: [] },
];

export interface FeatStatus {
  def: FeatDef;
  /** Progress so far, capped at the target. */
  current: number;
  target: number;
  done: boolean;
}

export function featStatus(def: FeatDef, input: FeatInput): FeatStatus {
  const target = Math.max(1, def.target(input));
  const current = Math.max(0, Math.min(target, def.value(input)));
  return { def, current, target, done: current >= target };
}

export function featStatuses(input: FeatInput): FeatStatus[] {
  return FEATS.map(def => featStatus(def, input));
}

export function featsDone(input: FeatInput): number {
  return FEATS.filter(def => featStatus(def, input).done).length;
}

/** Feats completed by the step from `before` to `after` (a shot or a finished run). */
export function newlyCompletedFeats(before: FeatInput, after: FeatInput): FeatDef[] {
  return FEATS.filter(def => !featStatus(def, before).done && featStatus(def, after).done);
}
