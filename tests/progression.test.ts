import { describe, expect, it } from 'vitest';
import {
  HAT_ORDER, dailyChallenge, dailyStreak, dateKey, freshProgress, newlyUnlocked, recordDaily, recordShot,
  recordSoloFinish, sanitizeProgress, unlockedHats,
} from '../src/rules/progression';
import { HAT_IDS } from '../src/art/jonhArt';
import { MAPS } from '../src/levels';

const MAP_IDS = MAPS.map(m => m.id);

describe('Progression and unlocks', () => {
  it('has art for every unlockable hat', () => {
    expect([...HAT_ORDER].sort()).toEqual([...HAT_IDS].sort());
  });

  it('counts hits and keeps a solo streak that resets on a miss but not in multiplayer', () => {
    let p = freshProgress();
    p = recordShot(p, 'body', true);
    p = recordShot(p, 'ricochet_body', true);
    expect(p).toMatchObject({ totalHits: 2, trickHits: 1, currentStreak: 2, bestStreak: 2 });
    p = recordShot(p, 'miss', false);
    expect(p.currentStreak).toBe(2);
    p = recordShot(p, 'hat_only', true);
    expect(p).toMatchObject({ hatHits: 1, currentStreak: 0, bestStreak: 2 });
  });

  it('unlocks hats from their milestones, reporting each only once', () => {
    let p = freshProgress();
    expect(unlockedHats(p, MAP_IDS)).toEqual(['boater']);
    const before = p;
    p = recordShot(p, 'ricochet_body', true);
    expect(newlyUnlocked(before, p, MAP_IDS).sort()).toEqual(['bowler', 'party']);
    expect(newlyUnlocked(p, p, MAP_IDS)).toEqual([]);
    p = recordSoloFinish(p, 'fence', 3);
    expect(unlockedHats(p, MAP_IDS)).toContain('propeller');
    expect(unlockedHats(p, MAP_IDS)).not.toContain('crown');
    for (const id of MAP_IDS) p = recordSoloFinish(p, id, 3);
    expect(unlockedHats(p, MAP_IDS)).toContain('crown');
    for (let i = 0; i < 24; i++) p = recordShot(p, 'body', false);
    expect(unlockedHats(p, MAP_IDS)).toContain('viking');
  });

  it('records only the first daily attempt per date and counts consecutive days', () => {
    let p = freshProgress();
    p = recordDaily(p, '2026-10-06', 2);
    p = recordDaily(p, '2026-10-07', 0);
    p = recordDaily(p, '2026-10-07', 3);
    expect(p.daily['2026-10-07']).toBe(0);
    expect(unlockedHats(p, MAP_IDS)).toContain('chef');
    expect(dailyStreak(p, new Date(2026, 9, 7, 15))).toBe(2);
    expect(dailyStreak(p, new Date(2026, 9, 8, 9))).toBe(2);
    expect(dailyStreak(p, new Date(2026, 9, 9, 9))).toBe(0);
  });

  it('picks the same valid daily challenge for a date and varies across dates', () => {
    const a = dailyChallenge('2026-10-07', MAPS)!;
    expect(dailyChallenge('2026-10-07', MAPS)).toEqual(a);
    const map = MAPS.find(m => m.id === a.mapId)!;
    expect(map.multiplayerPositions!.some(p => p.id === a.positionId)).toBe(true);
    const picks = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(dailyChallenge(dateKey(new Date(2026, 0, 1 + i)), MAPS))));
    expect(picks.size).toBeGreaterThan(4);
    expect(dailyChallenge('x', [])).toBeNull();
  });

  it('sanitizes corrupt saved progress and never keeps a locked selected hat', () => {
    expect(sanitizeProgress('nope', MAP_IDS)).toEqual(freshProgress());
    const p = sanitizeProgress({ totalHits: -4, hatHits: 2.7, trickHits: 'x', threeStarMaps: ['fence', 'mars', 3], daily: { '2026-10-07': 9, bad: 1 }, selectedHat: 'crown' }, MAP_IDS);
    expect(p).toMatchObject({ totalHits: 0, hatHits: 2, trickHits: 0, threeStarMaps: ['fence'], daily: { '2026-10-07': 3 }, selectedHat: 'boater' });
    expect(sanitizeProgress({ hatHits: 1, selectedHat: 'fez' }, MAP_IDS).selectedHat).toBe('fez');
  });
});
