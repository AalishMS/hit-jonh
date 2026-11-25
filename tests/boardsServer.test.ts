// tests/boardsServer.test.ts — convex/boards.ts's handler logic against an in-memory stand-in for `ctx.db`
// (tests/fakeConvexDb.ts, which also undoes a throwing "mutation" like Convex does). This proves the functions'
// own rules: validation, membership, caps, rate limit, first-post-wins, what a query reveals, isolation between
// boards and cleanup. It is NOT a Convex runtime: validators, indexes, OCC and deployment are not exercised.
import { describe, expect, it } from 'vitest';
import { ConvexError } from 'convex/values';
import {
  boardView, cleanupBoardsBatch, createBoardFor, joinBoardFor, leaveBoardFor, myBoardsFor, postResultFor,
} from '../convex/boards';
import { FRIENDS_BOARD, ONLINE } from '../src/config/tuning';
import { dayNumber, type BoardPost, type BoardSnapshot } from '../src/rules/friendsBoard';
import { fakeDb } from './fakeConvexDb';

const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
const TODAY = dayNumber('2026-11-25')!;
const REFILL = FRIENDS_BOARD.actionRefillSeconds * 1000;
const tok = (c: string) => c.repeat(32);
const [ANN, BO, CY] = [tok('a'), tok('b'), tok('c')];

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try { await promise; } catch (e) { if (e instanceof ConvexError) return (e.data as { code: string }).code; throw e; }
  return null;
}

/** A world with a clock; every call is one transaction, and the clock moves a full refill between calls by default. */
function world() {
  const w = fakeDb();
  let now = NOW;
  const tick = (ms = REFILL) => { now += ms; return now; };
  return {
    ...w,
    get now() { return now; },
    tick,
    create: (token: string, name = 'Ann', at = tick()) => w.transact(ctx => createBoardFor(ctx, { token, name }, at)),
    join: (code: string, token: string, name = 'Bo', at = tick()) => w.transact(ctx => joinBoardFor(ctx, { code, token, name }, at)),
    leave: (code: string, token: string) => w.transact(ctx => leaveBoardFor(ctx, { code, token })),
    post: (token: string, post: Partial<BoardPost> = {}, at = tick()) =>
      w.transact(ctx => postResultFor(ctx, { token, day: TODAY, stars: 2, shots: 'mb', streak: 1, ...post }, at)),
    view: (code: string, token: string, day = TODAY) => boardView(w.ctx, { code, token, day }),
    mine: (token: string) => myBoardsFor(w.ctx, { token }),
  };
}

const members = (snap: BoardSnapshot | null) => {
  if (!snap?.joined) throw new Error('not a member view');
  return snap.members;
};

describe('createBoard', () => {
  it('makes a board with a long room-alphabet code and the creator as its only member', async () => {
    const w = world();
    const code = await w.create(ANN, '  Ann  ');
    expect(code).toMatch(new RegExp(`^[${ONLINE.codeAlphabet}]{${FRIENDS_BOARD.codeLength}}$`));
    expect(FRIENDS_BOARD.codeLength).toBeGreaterThanOrEqual(8);
    expect(w.rows('boards')).toHaveLength(1);
    expect(w.rows('boardMembers')).toHaveLength(1);
    expect(w.rows('boardPlayers')[0]).toMatchObject({ token: ANN, name: 'Ann' });
    expect(members(await w.view(code, ANN))).toEqual([expect.objectContaining({ name: 'Ann', mine: true, today: null, yesterday: null })]);
  });

  it('retries a code that is already taken', async () => {
    const w = world();
    const fixed = () => 0; // always the first code
    const first = await w.transact(ctx => createBoardFor(ctx, { token: ANN, name: 'Ann' }, w.tick(), fixed));
    let calls = 0;
    const second = await w.transact(ctx => createBoardFor(ctx, { token: BO, name: 'Bo' }, w.tick(), () => (calls++ < ONLINE.codeLength ? 0 : 0.5)));
    expect(second).not.toBe(first);
  });

  it('sanitizes names like rooms do, and strips control and bidi characters', async () => {
    const w = world();
    const code = await w.create(ANN, '\u202eevil\u0007 name that is far too long');
    const [me] = members(await w.view(code, ANN));
    expect(me!.name).toBe('evil name that i');
    await w.join(code, BO, '   ');
    expect(members(await w.view(code, BO)).map(m => m.name)).toEqual(['evil name that i', 'Player 1']);
  });

  it('refuses a malformed token', async () => {
    const w = world();
    expect(await codeOf(w.create('not-a-token'))).toBe('NOT_MEMBER');
    expect(w.rows('boards')).toEqual([]);
  });

  it(`caps one browser at ${FRIENDS_BOARD.maxBoardsPerPlayer} boards, and a refused create costs nothing`, async () => {
    const w = world();
    for (let i = 0; i < FRIENDS_BOARD.maxBoardsPerPlayer; i++) await w.create(ANN);
    const before = { ...w.rows('boardPlayers')[0]! };
    expect(await codeOf(w.create(ANN, 'Ann', before.at as number))).toBe('TOO_MANY_BOARDS');
    expect(w.rows('boards')).toHaveLength(FRIENDS_BOARD.maxBoardsPerPlayer);
    expect(w.rows('boardPlayers')[0]).toEqual(before); // the allowance was not spent
  });
});

describe('joinBoard', () => {
  it('joins by code; joining again only renames me', async () => {
    const w = world();
    const code = await w.create(ANN);
    await w.join(code, BO, 'Bo');
    await w.join(code, BO, 'Bobby');
    expect(w.rows('boardMembers')).toHaveLength(2);
    expect(members(await w.view(code, ANN)).map(m => m.name)).toEqual(['Ann', 'Bobby']);
  });

  it('refuses an unknown code and a malformed token', async () => {
    const w = world();
    const code = await w.create(ANN);
    expect(await codeOf(w.join('ZZZZZZZZ', BO))).toBe('NOT_FOUND');
    // A short (room-length) or lower-case code is never looked up.
    expect(await codeOf(w.join(code.slice(0, 5), BO))).toBe('NOT_FOUND');
    expect(await codeOf(w.join(code.toLowerCase(), BO))).toBe('NOT_FOUND');
    expect(await codeOf(w.join(code, 'B'))).toBe('NOT_MEMBER');
    expect(w.rows('boardMembers')).toHaveLength(1);
    expect(w.rows('boardPlayers')).toHaveLength(1); // a refused join leaves no player row behind
  });

  it(`is capped at ${FRIENDS_BOARD.maxMembers} members`, async () => {
    const w = world();
    const code = await w.create(ANN);
    for (let i = 1; i < FRIENDS_BOARD.maxMembers; i++) await w.join(code, i.toString(16).padStart(32, '0'));
    expect(await codeOf(w.join(code, BO))).toBe('FULL');
    expect(w.rows('boardMembers')).toHaveLength(FRIENDS_BOARD.maxMembers);
    // an existing member can still re-join (rename) a full board
    expect(await codeOf(w.join(code, ANN, 'Annie'))).toBeNull();
  });

  it(`refuses a browser already in ${FRIENDS_BOARD.maxBoardsPerPlayer} boards`, async () => {
    const w = world();
    const target = await w.create(BO);
    for (let i = 0; i < FRIENDS_BOARD.maxBoardsPerPlayer; i++) await w.create(ANN);
    expect(await codeOf(w.join(target, ANN))).toBe('TOO_MANY_BOARDS');
  });
});

describe('rate limit', () => {
  it(`allows a burst of ${FRIENDS_BOARD.actionBurst} writes, then one per ${FRIENDS_BOARD.actionRefillSeconds} s, per browser`, async () => {
    const w = world();
    const at = w.now;
    const code = await w.create(ANN, 'Ann', at);
    for (let i = 1; i < FRIENDS_BOARD.actionBurst; i++) await w.join(code, ANN, `Ann ${i}`, at);
    expect(await codeOf(w.join(code, ANN, 'Spam', at))).toBe('RATE_LIMITED');
    expect(await codeOf(w.create(ANN, 'Spam', at + REFILL / 2))).toBe('RATE_LIMITED');
    expect(await codeOf(w.join(code, BO, 'Bo', at))).toBeNull(); // another browser has its own allowance
    expect(await codeOf(w.join(code, ANN, 'Ann again', at + REFILL))).toBeNull();
  });

  it('counts posts too (a duplicate post is free)', async () => {
    const w = world();
    const at = w.now;
    const code = await w.create(ANN, 'Ann', at);
    for (let i = 1; i < FRIENDS_BOARD.actionBurst; i++) await w.join(code, ANN, 'Ann', at);
    expect(await codeOf(w.post(ANN, {}, at))).toBe('RATE_LIMITED');
    expect(await w.post(ANN, {}, at + REFILL)).toEqual({ stored: true });
    expect(await w.post(ANN, {}, at + REFILL)).toEqual({ stored: false });
  });
});

describe('postResult', () => {
  it('stores my result once; a replay or a retry never changes it', async () => {
    const w = world();
    const code = await w.create(ANN);
    expect(await w.post(ANN, { stars: 2, shots: 'mb', streak: 4 })).toEqual({ stored: true });
    expect(await w.post(ANN, { stars: 3, shots: 'b', streak: 4 })).toEqual({ stored: false });
    const [me] = members(await w.view(code, ANN));
    expect(me!.today).toMatchObject({ day: TODAY, stars: 2, shots: 'mb', streak: 4 });
    expect(w.rows('boardResults')).toHaveLength(1);
  });

  it('needs a board membership', async () => {
    const w = world();
    expect(await codeOf(w.post(ANN))).toBe('NOT_MEMBER');
    expect(await codeOf(w.post('nope'))).toBe('NOT_MEMBER');
    const code = await w.create(ANN);
    await w.leave(code, ANN);
    expect(await codeOf(w.post(ANN))).toBe('NOT_MEMBER');
    expect(w.rows('boardResults')).toEqual([]);
  });

  it('accepts every date that is today somewhere, plus a late yesterday, and nothing else', async () => {
    const w = world();
    await w.create(ANN);
    const at = Date.UTC(2026, 10, 25, 0, 30); // early in the UTC day
    const days = [TODAY - 3, TODAY - 2, TODAY - 1, TODAY, TODAY + 1, TODAY + 2];
    const codes: Array<string | null> = [];
    for (const day of days) codes.push(await codeOf(w.post(ANN, { day }, at + codes.length * REFILL)));
    expect(codes).toEqual(['BAD_DAY', null, null, null, null, 'BAD_DAY']);
    expect(await codeOf(w.post(ANN, { day: TODAY + 0.5 }))).toBe('BAD_DAY');
    expect(await codeOf(w.post(ANN, { day: Number.NaN }))).toBe('BAD_DAY');
  });

  it('refuses results that are not a finished Daily run, or whose stars disagree with the pattern', async () => {
    const w = world();
    await w.create(ANN);
    const bad: Array<Partial<BoardPost>> = [
      { stars: 3, shots: 'mb' }, { stars: 1, shots: 'b' }, { stars: 4, shots: 'b' }, { stars: -1, shots: 'mmm' },
      { stars: 2.5, shots: 'mb' }, { stars: 0, shots: 'mm' }, { stars: 0, shots: '' }, { stars: 1, shots: 'mmmb' },
      { stars: 2, shots: 'bm' }, { stars: 0, shots: 'mmx' }, { stars: 3, shots: 'B' }, { stars: 0, shots: 'mmmm' },
      { streak: 0 }, { streak: -2 }, { streak: 1.5 }, { streak: FRIENDS_BOARD.maxStreak + 1 },
    ];
    for (const post of bad) expect(await codeOf(w.post(ANN, post)), JSON.stringify(post)).toBe('INVALID_RESULT');
    expect(w.rows('boardResults')).toEqual([]);
  });

  it('accepts every real run shape', async () => {
    const good: Array<Partial<BoardPost>> = [
      { stars: 3, shots: 'b' }, { stars: 3, shots: 't' }, { stars: 2, shots: 'hb' }, { stars: 1, shots: 'mht' },
      { stars: 0, shots: 'mmm' }, { stars: 0, shots: 'hhm' },
    ];
    for (const post of good) {
      const w = world();
      await w.create(ANN);
      expect(await w.post(ANN, post), JSON.stringify(post)).toEqual({ stored: true });
    }
  });

  it('keeps my boards alive for the cleanup, touching each at most hourly', async () => {
    const w = world();
    const code = await w.create(ANN);
    const board = () => w.rows('boards').find(b => b.code === code)!;
    const created = board().updatedAt as number;
    await w.post(ANN, { day: TODAY - 1 }, created + 60_000);
    expect(board().updatedAt).toBe(created);
    const later = created + FRIENDS_BOARD.touchEveryMinutes * 60_000;
    await w.post(ANN, { day: TODAY }, later);
    expect(board().updatedAt).toBe(later);
  });
});

describe('getBoard', () => {
  it('returns null for an unknown code and only a member count to a non-member', async () => {
    const w = world();
    const code = await w.create(ANN);
    await w.post(ANN);
    expect(await w.view('ZZZZZ', ANN)).toBeNull();
    expect(await w.view(code, BO)).toEqual({ code, joined: false, memberCount: 1 });
    expect(await w.view(code, 'garbage')).toEqual({ code, joined: false, memberCount: 1 });
  });

  it('shows members today and yesterday, marks me, and never returns a token', async () => {
    const w = world();
    const code = await w.create(ANN, 'Ann');
    await w.join(code, BO, 'Bo');
    await w.join(code, CY, 'Cy');
    await w.post(ANN, { day: TODAY, stars: 3, shots: 'b', streak: 2 });
    await w.post(ANN, { day: TODAY - 1, stars: 0, shots: 'mmm', streak: 1 });
    await w.post(BO, { day: TODAY - 1, stars: 1, shots: 'hmt', streak: 1 });
    const snap = await w.view(code, BO);
    const list = members(snap);
    expect(list.map(m => [m.name, m.mine, m.today?.stars ?? null, m.yesterday?.stars ?? null])).toEqual([
      ['Ann', false, 3, 0], ['Bo', true, null, 1], ['Cy', false, null, null],
    ]);
    const json = JSON.stringify(snap);
    for (const token of [ANN, BO, CY]) expect(json).not.toContain(token);
    expect(json).not.toContain('playerId');
  });

  it('isolates boards: a result shows on each of my boards, but members never leak across', async () => {
    const w = world();
    const one = await w.create(ANN, 'Ann');
    const two = await w.create(CY, 'Cy');
    await w.join(one, BO, 'Bo');
    await w.join(two, BO, 'Bo');
    await w.post(BO, { stars: 3, shots: 't' });
    await w.post(ANN, { stars: 1, shots: 'mmb' });
    await w.post(CY, { stars: 0, shots: 'mmm' });
    expect(members(await w.view(one, ANN)).map(m => [m.name, m.today?.shots])).toEqual([['Ann', 'mmb'], ['Bo', 't']]);
    expect(members(await w.view(two, CY)).map(m => [m.name, m.today?.shots])).toEqual([['Cy', 'mmm'], ['Bo', 't']]);
    expect(await w.view(two, ANN)).toEqual({ code: two, joined: false, memberCount: 2 });
    expect((await w.mine(BO)).map(b => b.code)).toEqual([one, two]);
    expect((await w.mine(ANN)).map(b => [b.code, b.memberCount])).toEqual([[one, 2]]);
    expect(await w.mine(tok('d'))).toEqual([]);
  });

  it('refuses a day that is not a plain day number', async () => {
    const w = world();
    const code = await w.create(ANN);
    expect(await codeOf(w.view(code, ANN, 1.5))).toBe('BAD_DAY');
    expect(await codeOf(w.view(code, ANN, -1))).toBe('BAD_DAY');
  });
});

describe('leaveBoard', () => {
  it('is idempotent; the last member out deletes the board, and a boardless player goes with their results', async () => {
    const w = world();
    const code = await w.create(ANN);
    const other = await w.create(ANN);
    await w.join(code, BO);
    await w.post(ANN);
    await w.post(BO);
    await w.leave(code, BO);
    await w.leave(code, BO);
    await w.leave('ZZZZZ', BO);
    expect(members(await w.view(code, ANN)).map(m => m.name)).toEqual(['Ann']);
    expect(w.rows('boardPlayers').map(p => p.token)).toEqual([ANN]);
    expect(w.rows('boardResults')).toHaveLength(1);
    await w.leave(code, ANN);
    expect(await w.view(code, ANN)).toBeNull();
    expect(w.rows('boardResults')).toHaveLength(1); // still in `other`
    await w.leave(other, ANN);
    expect(w.rows('boards')).toEqual([]);
    expect(w.rows('boardPlayers')).toEqual([]);
    expect(w.rows('boardResults')).toEqual([]);
  });
});

describe('cleanup', () => {
  it(`deletes results older than ${FRIENDS_BOARD.keepResultsDays} days and boards idle for ${FRIENDS_BOARD.idleBoardDays}`, async () => {
    const w = world();
    const live = await w.create(ANN, 'Ann');
    const idle = await w.create(BO, 'Bo');
    await w.join(idle, CY, 'Cy');
    await w.join(live, CY, 'Cy');
    await w.post(ANN, { day: TODAY });
    const later = NOW + (FRIENDS_BOARD.idleBoardDays + 1) * 86_400_000;
    const laterDay = TODAY + FRIENDS_BOARD.idleBoardDays + 1;
    // keep `live` busy until `later`
    await w.post(ANN, { day: laterDay }, later - 60_000);
    expect(await w.transact(ctx => cleanupBoardsBatch(ctx, later))).toBe(false);
    expect(w.rows('boards').map(b => b.code)).toEqual([live]);
    expect(w.rows('boardPlayers').map(p => p.name).sort()).toEqual(['Ann', 'Cy']); // Bo was only on the idle board
    expect(w.rows('boardResults').map(r => r.day)).toEqual([laterDay]);
  });

  it('asks for another pass when a batch is full', async () => {
    const w = fakeDb({ boardResults: Array.from({ length: 205 }, (_, i) => ({ _id: `boardResults:${i}`, playerId: 'p', day: 1, stars: 0, shots: 'mmm', streak: 1, postedAt: 0 })) });
    expect(await w.transact(ctx => cleanupBoardsBatch(ctx, NOW))).toBe(true);
    expect(await w.transact(ctx => cleanupBoardsBatch(ctx, NOW))).toBe(false);
    expect(w.rows('boardResults')).toEqual([]);
  });
});
