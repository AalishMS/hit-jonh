// convex/boards.ts — Daily Bonk friends boards (spec §6.2). A private board reached only by its code: friends
// compare today's (and yesterday's) Daily result. No public listing, no global ranking, no accounts.
//
// Results are self-reported: the server checks that a post is a well-formed Daily run for a plausible date, but
// never re-simulates it. Each handler's logic lives in an exported function taking `now`, so the tests can run it
// against an in-memory database (tests/boardsServer.test.ts).
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { FRIENDS_BOARD } from '../src/config/tuning';
import {
  checkBoardPost, isPlausibleDay, sanitizeBoardName, type BoardErrorCode, type BoardMemberView, type BoardPost,
  type BoardResultView, type BoardSnapshot, type MyBoardEntry,
} from '../src/rules/friendsBoard';
import { takeEmoteToken } from '../src/rules/onlineEmotes';
import { generateBoardCode, normalizeBoardCode } from '../src/rules/roomCode';

type Reader = Pick<QueryCtx, 'db'>;
type Writer = Pick<MutationCtx, 'db'>;

const DAY_MS = 86_400_000;
const isToken = (token: string) => /^[0-9a-f]{32}$/.test(token);

function fail(code: BoardErrorCode): never {
  throw new ConvexError({ code });
}

async function findPlayer(ctx: Reader, token: string): Promise<Doc<'boardPlayers'> | null> {
  if (!isToken(token)) return null;
  return ctx.db.query('boardPlayers').withIndex('by_token', q => q.eq('token', token)).unique();
}

async function findBoard(ctx: Reader, code: string): Promise<Doc<'boards'> | null> {
  if (normalizeBoardCode(code) !== code) return null;
  return ctx.db.query('boards').withIndex('by_code', q => q.eq('code', code)).unique();
}

async function findMembership(ctx: Reader, boardId: Id<'boards'>, playerId: Id<'boardPlayers'>): Promise<Doc<'boardMembers'> | null> {
  return ctx.db.query('boardMembers').withIndex('by_board_and_player', q => q.eq('boardId', boardId).eq('playerId', playerId)).unique();
}

/** A board's members, oldest first; joins are capped, so the bound is the cap. */
async function listMembers(ctx: Reader, boardId: Id<'boards'>): Promise<Doc<'boardMembers'>[]> {
  return ctx.db.query('boardMembers').withIndex('by_board', q => q.eq('boardId', boardId)).take(FRIENDS_BOARD.maxMembers);
}

async function listMemberships(ctx: Reader, playerId: Id<'boardPlayers'>): Promise<Doc<'boardMembers'>[]> {
  return ctx.db.query('boardMembers').withIndex('by_player', q => q.eq('playerId', playerId)).take(FRIENDS_BOARD.maxBoardsPerPlayer);
}

/**
 * The caller, after spending one write from their allowance. A browser seen for the first time gets a player row
 * with a full allowance. `name` (when given) becomes the name every board shows. Any later failure in the same
 * mutation rolls this back, so a refused create or join costs nothing.
 */
async function spendAction(ctx: Writer, token: string, name: string | null, now: number): Promise<Doc<'boardPlayers'>> {
  if (!isToken(token)) fail('NOT_MEMBER');
  const existing = await findPlayer(ctx, token);
  const taken = takeEmoteToken(existing ? { tokens: existing.tokens, at: existing.at } : null, now,
    FRIENDS_BOARD.actionBurst, FRIENDS_BOARD.actionRefillSeconds);
  if (!taken.ok) fail('RATE_LIMITED');
  const fields = { tokens: taken.bucket.tokens, at: taken.bucket.at, ...(name !== null ? { name: sanitizeBoardName(name) } : {}) };
  if (existing) {
    await ctx.db.patch('boardPlayers', existing._id, fields);
    return { ...existing, ...fields };
  }
  const id = await ctx.db.insert('boardPlayers', { token, name: sanitizeBoardName(name ?? ''), ...fields });
  return (await ctx.db.get('boardPlayers', id))!;
}

/** Deletes a player who belongs to no board any more, with their results (they are only ever shown on boards). */
async function dropPlayerIfBoardless(ctx: Writer, playerId: Id<'boardPlayers'>): Promise<void> {
  if (await ctx.db.query('boardMembers').withIndex('by_player', q => q.eq('playerId', playerId)).first()) return;
  for (;;) {
    const rows = await ctx.db.query('boardResults').withIndex('by_player_and_day', q => q.eq('playerId', playerId)).take(100);
    for (const row of rows) await ctx.db.delete('boardResults', row._id);
    if (rows.length < 100) break;
  }
  await ctx.db.delete('boardPlayers', playerId);
}

async function deleteBoardCascade(ctx: Writer, boardId: Id<'boards'>): Promise<void> {
  for (const member of await listMembers(ctx, boardId)) {
    await ctx.db.delete('boardMembers', member._id);
    await dropPlayerIfBoardless(ctx, member.playerId);
  }
  await ctx.db.delete('boards', boardId);
}

// ---------- Mutations ----------

export async function createBoardFor(ctx: Writer, args: { token: string; name: string }, now: number, random: () => number = Math.random): Promise<string> {
  const me = await spendAction(ctx, args.token, args.name, now);
  if ((await listMemberships(ctx, me._id)).length >= FRIENDS_BOARD.maxBoardsPerPlayer) fail('TOO_MANY_BOARDS');
  let code = generateBoardCode(random);
  for (let attempt = 0; attempt < 10 && (await findBoard(ctx, code)); attempt++) code = generateBoardCode(random);
  if (await findBoard(ctx, code)) throw new Error('Could not allocate a board code');
  const boardId = await ctx.db.insert('boards', { code, createdAt: now, updatedAt: now });
  await ctx.db.insert('boardMembers', { boardId, playerId: me._id, joinedAt: now });
  return code;
}

/** Joining a board I'm already in only updates my name. */
export async function joinBoardFor(ctx: Writer, args: { code: string; token: string; name: string }, now: number): Promise<void> {
  if (!isToken(args.token)) fail('NOT_MEMBER');
  const board = (await findBoard(ctx, args.code)) ?? fail('NOT_FOUND');
  const me = await spendAction(ctx, args.token, args.name, now);
  if (await findMembership(ctx, board._id, me._id)) return;
  if ((await listMembers(ctx, board._id)).length >= FRIENDS_BOARD.maxMembers) fail('FULL');
  if ((await listMemberships(ctx, me._id)).length >= FRIENDS_BOARD.maxBoardsPerPlayer) fail('TOO_MANY_BOARDS');
  await ctx.db.insert('boardMembers', { boardId: board._id, playerId: me._id, joinedAt: now });
  await ctx.db.patch('boards', board._id, { updatedAt: now });
}

/** Idempotent. The last member out deletes the board; a player left in no board is deleted with their results. */
export async function leaveBoardFor(ctx: Writer, args: { code: string; token: string }): Promise<void> {
  const me = await findPlayer(ctx, args.token);
  const board = await findBoard(ctx, args.code);
  if (!me || !board) return;
  const membership = await findMembership(ctx, board._id, me._id);
  if (!membership) return;
  await ctx.db.delete('boardMembers', membership._id);
  if (!(await ctx.db.query('boardMembers').withIndex('by_board', q => q.eq('boardId', board._id)).first())) {
    await ctx.db.delete('boards', board._id);
  }
  await dropPlayerIfBoardless(ctx, me._id);
}

/**
 * Stores my result for a day, once: a repeat (another tab, a retry after a lost reply, a replay of the Daily)
 * stores nothing and says so. Only a player in at least one board may post.
 */
export async function postResultFor(ctx: Writer, args: BoardPost & { token: string }, now: number): Promise<{ stored: boolean }> {
  const me = (await findPlayer(ctx, args.token)) ?? fail('NOT_MEMBER');
  const memberships = await listMemberships(ctx, me._id);
  if (memberships.length === 0) fail('NOT_MEMBER');
  const check = checkBoardPost(args, now);
  if (!check.ok) fail(check.code);
  const prior = await ctx.db.query('boardResults')
    .withIndex('by_player_and_day', q => q.eq('playerId', me._id).eq('day', args.day)).unique();
  if (prior) return { stored: false };
  await spendAction(ctx, args.token, null, now);
  await ctx.db.insert('boardResults', { playerId: me._id, day: args.day, stars: args.stars, shots: args.shots, streak: args.streak, postedAt: now });
  // Keep my boards alive for the cleanup cron, touching each at most hourly so members' posts rarely collide.
  for (const membership of memberships) {
    const board = await ctx.db.get('boards', membership.boardId);
    if (board && now - board.updatedAt >= FRIENDS_BOARD.touchEveryMinutes * 60_000) await ctx.db.patch('boards', board._id, { updatedAt: now });
  }
  return { stored: true };
}

const nameArg = { token: v.string(), name: v.string() };

export const createBoard = mutation({
  args: nameArg,
  returns: v.string(),
  handler: async (ctx, args) => createBoardFor(ctx, args, Date.now()),
});

export const joinBoard = mutation({
  args: { code: v.string(), ...nameArg },
  returns: v.null(),
  handler: async (ctx, args) => {
    await joinBoardFor(ctx, args, Date.now());
    return null;
  },
});

export const leaveBoard = mutation({
  args: { code: v.string(), token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await leaveBoardFor(ctx, args);
    return null;
  },
});

export const postResult = mutation({
  args: { token: v.string(), day: v.number(), stars: v.number(), shots: v.string(), streak: v.number() },
  returns: v.object({ stored: v.boolean() }),
  handler: async (ctx, args) => postResultFor(ctx, args, Date.now()),
});

// ---------- Queries (no wall clock: the client passes its own day) ----------

const toResult = (r: Doc<'boardResults'>): BoardResultView =>
  ({ day: r.day, stars: r.stars, shots: r.shots, streak: r.streak, postedAt: r.postedAt });

/**
 * One board for `day` (the caller's local day number) and the day before. Anyone with the code learns only that
 * the board exists and how many are in it; names and results go to members only. Tokens are never returned.
 */
export async function boardView(ctx: Reader, args: { code: string; token: string; day: number }): Promise<BoardSnapshot | null> {
  if (!isPlausibleDay(args.day)) fail('BAD_DAY');
  const board = await findBoard(ctx, args.code);
  if (!board) return null;
  const members = await listMembers(ctx, board._id);
  const me = await findPlayer(ctx, args.token);
  if (!me || !members.some(m => m.playerId === me._id)) return { code: board.code, joined: false, memberCount: members.length };
  const views: BoardMemberView[] = [];
  for (const member of members) {
    const player = await ctx.db.get('boardPlayers', member.playerId);
    if (!player) continue;
    const results = await ctx.db.query('boardResults')
      .withIndex('by_player_and_day', q => q.eq('playerId', player._id).gte('day', args.day - 1).lte('day', args.day)).take(2);
    const on = (day: number) => { const r = results.find(x => x.day === day); return r ? toResult(r) : null; };
    views.push({ id: member._id, name: player.name, mine: player._id === me._id, joinedAt: member.joinedAt, today: on(args.day), yesterday: on(args.day - 1) });
  }
  return { code: board.code, joined: true, day: args.day, members: views };
}

export const getBoard = query({
  args: { code: v.string(), token: v.string(), day: v.number() },
  handler: async (ctx, args): Promise<BoardSnapshot | null> => boardView(ctx, args),
});

/** The boards this browser belongs to (codes and sizes only). */
export async function myBoardsFor(ctx: Reader, args: { token: string }): Promise<MyBoardEntry[]> {
  const me = await findPlayer(ctx, args.token);
  if (!me) return [];
  const out: MyBoardEntry[] = [];
  for (const membership of await listMemberships(ctx, me._id)) {
    const board = await ctx.db.get('boards', membership.boardId);
    if (board) out.push({ code: board.code, memberCount: (await listMembers(ctx, board._id)).length, joinedAt: membership.joinedAt });
  }
  return out.sort((a, b) => a.joinedAt - b.joinedAt);
}

export const myBoards = query({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<MyBoardEntry[]> => myBoardsFor(ctx, args),
});

// ---------- Retention ----------

/**
 * Rows per cleanup transaction; a full batch schedules the next one straight away. An idle board can take up to
 * 20 memberships, their players and each player's kept results with it (a few hundred writes), so boards go a few
 * at a time to stay far inside Convex's per-transaction write limit.
 */
const RESULT_BATCH = 200;
const BOARD_BATCH = 4;

/** Deletes results older than `keepResultsDays` and boards idle for `idleBoardDays`. True when there may be more. */
export async function cleanupBoardsBatch(ctx: Writer, now: number): Promise<boolean> {
  const oldestKept = Math.floor(now / DAY_MS) - FRIENDS_BOARD.keepResultsDays;
  const old = await ctx.db.query('boardResults').withIndex('by_day', q => q.lt('day', oldestKept)).take(RESULT_BATCH);
  for (const row of old) await ctx.db.delete('boardResults', row._id);
  const idleBefore = now - FRIENDS_BOARD.idleBoardDays * DAY_MS;
  const idle = await ctx.db.query('boards').withIndex('by_updatedAt', q => q.lt('updatedAt', idleBefore)).take(BOARD_BATCH);
  for (const board of idle) await deleteBoardCascade(ctx, board._id);
  return old.length === RESULT_BATCH || idle.length === BOARD_BATCH;
}

export const cleanupBoards = internalMutation({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    if (await cleanupBoardsBatch(ctx, Date.now())) await ctx.scheduler.runAfter(0, internal.boards.cleanupBoards, {});
    return null;
  },
});
