import { describe, expect, it } from 'vitest';
import { FEATS, FEAT_GROUPS, featStatus, featStatuses, featsDone, newlyCompletedFeats, type FeatInput, type FeatReward } from '../src/rules/feats';
import { CANNON_SKIN_ORDER, CANNON_SKIN_RULES, COSMETIC_GATES, DEFAULT_CANNON_SKIN, DEFAULT_OUTFIT, OUTFIT_ORDER, OUTFIT_RULES } from '../src/rules/cosmetics';
import { HAT_ORDER, HAT_RULES, bestDailyStreak, freshProgress, recordShot, sanitizeProgress, type Progress } from '../src/rules/progression';
import { MAP_IDS } from '../src/levels';

const unlocked = (r: FeatReward, input: FeatInput): boolean =>
  r.kind === 'hat' ? HAT_RULES[r.id].unlocked(input.progress, input.mapIds)
    : r.kind === 'outfit' ? OUTFIT_RULES[r.id].unlocked(input.progress, input.ctx)
      : CANNON_SKIN_RULES[r.id].unlocked(input.progress, input.ctx);

/** A consistent player state: `threeStar` gardens with three stars, `extraStars` more elsewhere. */
function state(over: Partial<Progress>, threeStar: number, extraStars: number, cleared: number, dailyDays: number[] = []): FeatInput {
  const daily: Record<string, number> = {};
  dailyDays.forEach((stars, i) => { daily[`2026-11-${String(i + 1).padStart(2, '0')}`] = stars; });
  const progress: Progress = { ...freshProgress(), threeStarMaps: MAP_IDS.slice(0, threeStar), daily, ...over };
  const stars = threeStar * 3 + (threeStar < MAP_IDS.length ? extraStars : 0);
  return { progress, ctx: { stars, cleared: Math.max(cleared, threeStar) }, mapIds: MAP_IDS };
}

const SAMPLES: FeatInput[] = [
  state({}, 0, 0, 0),
  state({ totalHits: 1, bestStreak: 1, currentStreak: 1 }, 0, 2, 1, [0]),
  state({ totalHits: 24, hatHits: 1, trickHits: 2, bestStreak: 4 }, 1, 2, 3, [1, 2]),
  state({ totalHits: 25, hatHits: 3, trickHits: 3, bestStreak: 5 }, 2, 0, 4, [3, 0, 1]),
  state({ totalHits: 49, trickHits: 7, bestStreak: 9 }, 3, 3, 5, [2, 2, 2, 2]),
  state({ totalHits: 50 }, 4, 0, 6),
  state({ totalHits: 120, trickHits: 12 }, 6, 2, 9, [3, 3, 3, 3, 3, 3, 3]),
  state({ totalHits: 300 }, MAP_IDS.length - 1, 2, MAP_IDS.length),
  state({ totalHits: 400 }, MAP_IDS.length, 0, MAP_IDS.length),
];

describe('feats', () => {
  it('complete exactly when the cosmetics they list unlock', () => {
    for (const input of SAMPLES) {
      for (const def of FEATS) {
        const done = featStatus(def, input).done;
        for (const reward of def.rewards) expect([def.id, reward.id, unlocked(reward, input)]).toEqual([def.id, reward.id, done]);
      }
    }
  });

  it('list every unlockable cosmetic exactly once', () => {
    const rewards = FEATS.flatMap(f => f.rewards.map(r => `${r.kind}:${r.id}`));
    expect(new Set(rewards).size).toBe(rewards.length);
    const expected = [
      ...HAT_ORDER.filter(h => h !== 'boater').map(h => `hat:${h}`),
      ...OUTFIT_ORDER.filter(o => o !== DEFAULT_OUTFIT).map(o => `outfit:${o}`),
      ...CANNON_SKIN_ORDER.filter(c => c !== DEFAULT_CANNON_SKIN).map(c => `cannon:${c}`),
    ];
    expect([...rewards].sort()).toEqual([...expected].sort());
  });

  it('have unique ids, known groups and capped progress', () => {
    expect(new Set(FEATS.map(f => f.id)).size).toBe(FEATS.length);
    for (const f of FEATS) expect(FEAT_GROUPS.map(g => g.id)).toContain(f.group);
    const statuses = featStatuses(SAMPLES[8]!);
    for (const s of statuses) expect(s.current).toBeLessThanOrEqual(s.target);
    expect(featsDone(SAMPLES[0]!)).toBe(0);
    expect(featStatus(FEATS.find(f => f.id === 'stars-all')!, SAMPLES[8]!).target).toBe(COSMETIC_GATES.starsAll);
  });

  it('track the new counters: trick streaks and the gardens Jonh was hit in', () => {
    let p = freshProgress();
    p = recordShot(p, 'ricochet_body', true, 'bankshot');
    p = recordShot(p, 'ricochet_body', true, 'bankshot');
    expect(p.trickStreak).toBe(2);
    p = recordShot(p, 'body', true, 'moon');
    expect(p.trickStreak).toBe(0);
    expect(p.bestTrickStreak).toBe(2);
    // Multiplayer shots never touch streaks but do count where Jonh was hit.
    p = recordShot(p, 'body', false, 'valley');
    expect(p.hitMaps).toEqual(['bankshot', 'moon', 'valley']);
    const input = { progress: p, ctx: { stars: 0, cleared: 0 }, mapIds: MAP_IDS };
    expect(featStatus(FEATS.find(f => f.id === 'moon')!, input).done).toBe(true);
    expect(featStatus(FEATS.find(f => f.id === 'every-garden')!, input)).toMatchObject({ current: 3, target: MAP_IDS.length, done: false });
    // Saved values are sanitized.
    const saved = sanitizeProgress({ trickStreak: 2, bestTrickStreak: 1, hitMaps: ['moon', 'mars', 'moon', 4] }, MAP_IDS);
    expect(saved).toMatchObject({ trickStreak: 2, bestTrickStreak: 2, hitMaps: ['moon'] });
  });

  it('count the best run of consecutive Daily Bonk days', () => {
    const p = { ...freshProgress(), daily: { '2026-11-01': 1, '2026-11-02': 0, '2026-11-03': 3, '2026-11-05': 1, '2026-10-31': 2, '2026-12-01': 1 } };
    expect(bestDailyStreak(p)).toBe(4); // 31 Oct – 3 Nov, across the month end
    expect(bestDailyStreak(freshProgress())).toBe(0);
  });

  it('report what a step completed', () => {
    const before = state({ totalHits: 24 }, 0, 0, 0);
    const after = state({ totalHits: 25 }, 0, 0, 0);
    expect(newlyCompletedFeats(before, after).map(f => f.id)).toEqual(['hits25']);
    expect(newlyCompletedFeats(after, after)).toEqual([]);
  });
});
