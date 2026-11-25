// tests/friendsBoard.test.ts — the pure friends-board rules shared by the client and convex/boards.ts.
import { describe, expect, it } from 'vitest';
import { FRIENDS_BOARD } from '../src/config/tuning';
import { dailyShotSymbols } from '../src/rules/dailyShare';
import {
  acceptedDays, boardInviteText, boardSummary, checkBoardPost, compareResults, dayKeyOf, dayNumber, isPlausibleDay,
  newlyPosted, ordinal, pendingBoardPosts, rankBoard, resultWords, sanitizeBoardName, starsForRun, streakEnding,
  type BoardMemberView, type BoardResultView,
} from '../src/rules/friendsBoard';
import { dateKey } from '../src/rules/progression';

const result = (stars: number, shots: string, postedAt = 0, streak = 1): BoardResultView => ({ day: 1, stars, shots, streak, postedAt });
const member = (id: string, today: BoardResultView | null, extra: Partial<BoardMemberView> = {}): BoardMemberView =>
  ({ id, name: id.toUpperCase(), mine: false, joinedAt: 0, today, yesterday: null, ...extra });

describe('day numbers', () => {
  it('maps a calendar date to the same whole day everywhere, and back', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    const day = dayNumber('2026-11-25')!;
    expect(dayKeyOf(day)).toBe('2026-11-25');
    expect(dayNumber('2024-02-29')! + 1).toBe(dayNumber('2024-03-01'));
    expect(dayNumber('2026-12-31')! + 1).toBe(dayNumber('2027-01-01'));
  });

  it('rejects anything that is not a real date key', () => {
    for (const bad of ['', '2026-11-5', '2026-13-01', '2026-02-30', '2025-02-29', '25-11-2026', 'today']) expect(dayNumber(bad)).toBeNull();
  });

  it('agrees with the local date key the Daily uses', () => {
    const now = new Date(2026, 10, 25, 23, 59);
    expect(dayKeyOf(dayNumber(dateKey(now))!)).toBe(dateKey(now));
  });

  it('accepts every date that is today somewhere on Earth (UTC−12 to UTC+14), plus a late yesterday', () => {
    for (const hour of [0, 6, 11, 12, 18, 23]) {
      const now = Date.UTC(2026, 10, 25, hour, 30);
      const { min, max } = acceptedDays(now);
      // the local date at the extreme zones
      const west = dayNumber(new Date(now - 12 * 3_600_000).toISOString().slice(0, 10))!;
      const east = dayNumber(new Date(now + 14 * 3_600_000).toISOString().slice(0, 10))!;
      expect(west - 1).toBeGreaterThanOrEqual(min); // west's yesterday, posted late
      expect(east).toBeLessThanOrEqual(max);
      expect(max - min).toBe(FRIENDS_BOARD.acceptDaysBehind + FRIENDS_BOARD.acceptDaysAhead);
    }
  });

  it('only lets a query ask about plain day numbers', () => {
    expect(isPlausibleDay(20_417)).toBe(true);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '20417', null]) expect(isPlausibleDay(bad)).toBe(false);
  });
});

describe('what a post may say', () => {
  it('derives stars from the run: a hit on shot n earns 4 − n, a run without a hit uses all three shots', () => {
    expect(['b', 't', 'mb', 'ht', 'mmb', 'hmt', 'mmm', 'hhh'].map(starsForRun)).toEqual([3, 3, 2, 2, 1, 1, 0, 0]);
    for (const bad of ['', 'm', 'mh', 'bm', 'mmmb', 'mmmm', 'x', 'B']) expect(starsForRun(bad)).toBeNull();
  });

  it('checks the day, then the run, then the streak', () => {
    const now = Date.UTC(2026, 10, 25, 12);
    const day = dayNumber('2026-11-25')!;
    const ok = { day, stars: 2, shots: 'hb', streak: 3 };
    expect(checkBoardPost(ok, now)).toEqual({ ok: true });
    expect(checkBoardPost({ ...ok, day: day + 2 }, now)).toEqual({ ok: false, code: 'BAD_DAY' });
    expect(checkBoardPost({ ...ok, day: day - 3, stars: 9 }, now)).toEqual({ ok: false, code: 'BAD_DAY' });
    expect(checkBoardPost({ ...ok, stars: 3 }, now)).toEqual({ ok: false, code: 'INVALID_RESULT' });
    expect(checkBoardPost({ ...ok, streak: 0 }, now)).toEqual({ ok: false, code: 'INVALID_RESULT' });
  });

  it('cleans names like room names and removes invisible or direction-flipping characters', () => {
    expect(sanitizeBoardName('  Sam  ')).toBe('Sam');
    expect(sanitizeBoardName('\u202eSam\u200b\n')).toBe('Sam');
    expect(sanitizeBoardName('')).toBe('Player 1');
    expect(sanitizeBoardName(42)).toBe('Player 1');
    expect(sanitizeBoardName('x'.repeat(40))).toHaveLength(16);
  });
});

describe('ranking', () => {
  it('orders by stars, then fewer shots, then a trick hit, then who posted first', () => {
    expect(compareResults(result(3, 'b', 9), result(2, 'mt', 1))).toBeLessThan(0);
    expect(compareResults(result(2, 'mt', 9), result(2, 'mb', 1))).toBeLessThan(0);
    expect(compareResults(result(2, 'mb', 1), result(2, 'hb', 2))).toBeLessThan(0);
    expect(compareResults(result(0, 'hhm', 5), result(0, 'mmm', 5))).toBe(0);
  });

  it('ranks who played and lists the rest after, me first among them', () => {
    const rows = rankBoard([
      member('a', result(1, 'mmb', 1)),
      member('b', null, { joinedAt: 5 }),
      member('c', result(3, 'b', 9)),
      member('d', null, { mine: true, joinedAt: 9 }),
      member('e', result(1, 'mmt', 2)),
      member('f', null, { joinedAt: 1 }),
    ], 'today');
    expect(rows.map(r => [r.member.id, r.rank])).toEqual([['c', 1], ['e', 2], ['a', 3], ['d', null], ['f', null], ['b', null]]);
  });

  it('ranks yesterday from yesterday’s results', () => {
    const rows = rankBoard([member('a', result(3, 'b'), { yesterday: result(0, 'mmm') }), member('b', null, { yesterday: result(2, 'mb') })], 'yesterday');
    expect(rows.map(r => [r.member.id, r.rank, r.result?.stars])).toEqual([['b', 1, 2], ['a', 2, 0]]);
  });

  it('sums a day up for screen readers', () => {
    const me = { mine: true };
    expect(boardSummary(rankBoard([member('a', null, me), member('b', null)], 'today'), 'today')).toBe('Today: nobody has played yet.');
    expect(boardSummary(rankBoard([member('a', result(1, 'mmb'), me), member('b', result(3, 'b')), member('c', null)], 'today'), 'today'))
      .toBe("Today: you're 2nd of 2, 1 still to play.");
    expect(boardSummary(rankBoard([member('a', null, me), member('b', result(3, 'b'))], 'yesterday'), 'yesterday'))
      .toBe('Yesterday: nobody has played yet.');
    expect(boardSummary(rankBoard([member('a', null, me), member('b', result(3, 'b'))], 'today'), 'today')).toBe('Today: 1 played, 1 still to play.');
    expect(boardSummary(rankBoard([member('a', result(0, 'mmm'), me)], 'today'), 'today')).toBe("Today: you're 1st of 1, everyone has played.");
  });

  it('writes places and results in words', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
    expect(resultWords(result(2, 'mt'))).toBe('2 of 3 stars, miss then trick hit');
    expect(resultWords(result(0, 'hmm'))).toBe('Jonh won, hat then miss then miss');
    expect(dailyShotSymbols('hmt')).toBe('🎩⬜🎱');
  });

  it('finds other members whose result just arrived', () => {
    const before = [member('a', null), member('b', result(3, 'b')), member('me', null, { mine: true })];
    const after = [member('a', result(2, 'mb')), member('b', result(3, 'b')), member('me', result(1, 'mmb'), { mine: true }), member('c', result(0, 'mmm'))];
    expect(newlyPosted(before, after, 'today').map(m => m.id)).toEqual(['a', 'c']);
    expect(newlyPosted(null, after, 'today')).toEqual([]);
  });

  it('builds the invite text', () => {
    expect(boardInviteText('K7QPXW2M', 'https://example.com/?board=K7QPXW2M')).toBe('Join my Hit Jonh Daily board: K7QPXW2M\nhttps://example.com/?board=K7QPXW2M');
  });
});

describe('what a client still has to post', () => {
  const daily = { '2026-11-22': 1, '2026-11-23': 0, '2026-11-24': 2, '2026-11-25': 3 };
  const shots = { '2026-11-23': 'mmm', '2026-11-24': 'mb', '2026-11-25': 't' };

  it('counts the streak ending on a day', () => {
    expect(streakEnding(daily, '2026-11-25')).toBe(4);
    expect(streakEnding(daily, '2026-11-23')).toBe(2);
    expect(streakEnding(daily, '2026-11-26')).toBe(0);
    expect(streakEnding(daily, 'nope')).toBe(0);
  });

  it('posts yesterday then today, once each, with the counted run and the streak as of that day', () => {
    expect(pendingBoardPosts(daily, shots, '2026-11-25', [])).toEqual([
      { key: '2026-11-24', day: dayNumber('2026-11-24'), stars: 2, shots: 'mb', streak: 3 },
      { key: '2026-11-25', day: dayNumber('2026-11-25'), stars: 3, shots: 't', streak: 4 },
    ]);
    expect(pendingBoardPosts(daily, shots, '2026-11-25', ['2026-11-24']).map(p => p.key)).toEqual(['2026-11-25']);
    expect(pendingBoardPosts(daily, shots, '2026-11-26', ['2026-11-25'])).toEqual([]);
    expect(pendingBoardPosts(daily, shots, 'garbage', [])).toEqual([]);
  });

  it('skips a day without a pattern (an older save) or whose stars disagree with it', () => {
    expect(pendingBoardPosts({ '2026-11-25': 3 }, {}, '2026-11-25', [])).toEqual([]);
    expect(pendingBoardPosts({ '2026-11-25': 3 }, { '2026-11-25': 'mb' }, '2026-11-25', [])).toEqual([]);
  });
});
