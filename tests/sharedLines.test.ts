import { describe, expect, it } from 'vitest';
import type { ReactionCategory, ReactionContext } from '../src/rules/reactions';
import { missStreakBefore, SharedLines } from '../src/rules/sharedLines';
import type { ShotRecord } from '../src/rules/onlineTypes';
import type { ClassifiedOutcome } from '../src/sim/classification';

type Moment = { moment: string; pick: (lines: SharedLines, match: string) => string };

const shot = (seq: number, category: ReactionCategory, context: ReactionContext = {}): Moment => ({
  moment: `shot:${seq}`,
  pick: (lines, match) => lines.at(match, `shot:${seq}`).selectReaction(category, context),
});

/** A match as every client presents it: an arrival, shots, Jonh moving after a hit, the winning shot. */
const MATCH: Moment[] = [
  { moment: 'arrival:0', pick: (l, m) => l.at(m, 'arrival:0').selectArrival('backyard') },
  shot(0, 'short', { mapId: 'backyard', missStreak: 1 }),
  shot(1, 'over', { mapId: 'backyard', missStreak: 2 }),
  shot(2, 'hit', { mapId: 'backyard', strength: 'strong' }),
  { moment: 'moved:3', pick: (l, m) => l.at(m, 'moved:3').selectReaction('moved') },
  shot(3, 'hit', { mapId: 'backyard', strength: 'trick', trickKind: 'ricochet' }),
  shot(4, 'miss', { mapId: 'backyard', missStreak: 1, obstacles: [{ id: 'fence', material: 'wood' }] }),
  shot(5, 'hat', { mapId: 'backyard' }),
  { moment: 'winning:6', pick: (l, m) => l.at(m, 'winning:6').selectWinningShot() },
];

const play = (lines: SharedLines, match: string): string[] => MATCH.map(m => m.pick(lines, match));

describe('shared online Jonh lines', () => {
  it('every client picks the same line for every moment of a match', () => {
    const host = play(new SharedLines(), 'K7QPX/123/1');
    const guest = play(new SharedLines(), 'K7QPX/123/1');
    expect(guest).toEqual(host);
    expect(host.every(line => line.length > 0 && line !== '...')).toBe(true);
  });

  it('ignores what a client said before the match (its offline history)', () => {
    const fresh = new SharedLines();
    const busy = new SharedLines();
    // A previous match on this client fills the memory; the new match starts clean on both.
    play(busy, 'AAAAA/9/1');
    expect(play(busy, 'K7QPX/123/1')).toEqual(play(fresh, 'K7QPX/123/1'));
  });

  it('a different match or room picks differently', () => {
    const a = play(new SharedLines(), 'K7QPX/123/1');
    const b = play(new SharedLines(), 'K7QPX/123/2');
    const c = play(new SharedLines(), 'ZZZZZ/456/1');
    expect(b).not.toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('still avoids repeating a recent line within the match', () => {
    const lines = new SharedLines();
    const picks = Array.from({ length: 6 }, (_, i) => lines.at('K7QPX/1/1', `shot:${i}`).selectReaction('short'));
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
  });
});

describe('missStreakBefore', () => {
  const record = (seq: number, outcome: ClassifiedOutcome | null, skipped = false): ShotRecord => ({
    seq, seat: seq % 2, angle: 45, power: 50, outcome, witnessOutcome: null,
    resolution: skipped ? 'skipped' : outcome === null ? null : 'shooter', firedAt: seq, resolvedAt: outcome === null ? null : seq,
  });

  it('counts misses and hat-only hits back to the last body hit', () => {
    const shots = [record(0, 'body'), record(1, 'miss'), record(2, 'hat_only'), record(3, 'miss'), record(4, null)];
    expect(missStreakBefore(shots, 4)).toBe(3);
    expect(missStreakBefore(shots, 2)).toBe(1);
    expect(missStreakBefore(shots, 1)).toBe(0);
    expect(missStreakBefore(shots, 0)).toBe(0);
  });

  it('skips skipped turns, stops at a trick hit and does not depend on list order', () => {
    const shots = [record(3, 'miss'), record(1, 'ricochet_body'), record(2, 'miss', true), record(0, 'miss')];
    expect(missStreakBefore(shots, 4)).toBe(1);
    expect(missStreakBefore(shots, 3)).toBe(0);
  });
});
