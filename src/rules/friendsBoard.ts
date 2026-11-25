// src/rules/friendsBoard.ts — Daily Bonk friends boards (SPEC §6.2): day numbers, what a post may say, the
// ranking and what a client still has to post. Pure (no Phaser, no DOM, no Convex): the server and the client
// both import it, like onlineRules.ts.
import { FRIENDS_BOARD } from '../config/tuning';
import { dailyDateLabel, dailyShotSymbols, sanitizeDailyShots } from './dailyShare';
import { sanitizePlayerName } from './playerName';

/** What the board functions throw (as `ConvexError({ code })`). */
export type BoardErrorCode =
  | 'NOT_FOUND' | 'NOT_MEMBER' | 'FULL' | 'TOO_MANY_BOARDS' | 'INVALID_RESULT' | 'BAD_DAY' | 'RATE_LIMITED';

/** The URL parameter that opens a board (`?board=CODE`). */
export const BOARD_LINK_PARAM = 'board';

/** Shots in a Daily Bonk run: the solo rule (SPEC §5), which `sanitizeDailyShots` also encodes. */
export const DAILY_SHOTS = 3;

const DAY_MS = 86_400_000;

/**
 * "2026-11-25" → whole days since 1970-01-01 for that calendar date. A date is the same number in every time
 * zone, which is what lets friends in different zones compare the same Daily. Null for anything else.
 */
export function dayNumber(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return Math.round(ms / DAY_MS);
}

/** The inverse of `dayNumber`. */
export function dayKeyOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** The day numbers the server accepts at `nowMs` (see `FRIENDS_BOARD.acceptDaysBehind`). */
export function acceptedDays(nowMs: number): { min: number; max: number } {
  const utc = Math.floor(nowMs / DAY_MS);
  return { min: utc - FRIENDS_BOARD.acceptDaysBehind, max: utc + FRIENDS_BOARD.acceptDaysAhead };
}

/** A day number a query may ask about: a plain non-negative integer (no clock needed). */
export function isPlausibleDay(day: unknown): day is number {
  return typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 1_000_000;
}

/**
 * The stars a run pattern earns, or null when the pattern is not a finished Daily run: a hit on shot n earns
 * 4 − n stars; a run without a hit must have used all three shots and earns 0.
 */
export function starsForRun(shots: string): number | null {
  const run = sanitizeDailyShots(shots);
  if (!run) return null;
  if (/[bt]$/.test(run)) return DAILY_SHOTS + 1 - run.length;
  return run.length === DAILY_SHOTS ? 0 : null;
}

/** A trick hit (ricochet or portal) ended the run. */
export const isTrickRun = (shots: string): boolean => shots.endsWith('t');

/** One Daily result as a client posts it. Results are self-reported: the server never re-simulates. */
export interface BoardPost {
  /** `dayNumber` of the player's local date key. */
  day: number;
  /** 0–3, and must match `shots`. */
  stars: number;
  /** The counted run's pattern (rules/dailyShare.ts codes, e.g. "mb"). */
  shots: string;
  /** Consecutive Daily days ending with this one (self-reported, at least 1). */
  streak: number;
}

/** Everything the server checks about a post, in order: the day, then the run, then the streak. */
export function checkBoardPost(post: BoardPost, nowMs: number): { ok: true } | { ok: false; code: BoardErrorCode } {
  if (!Number.isInteger(post.day)) return { ok: false, code: 'BAD_DAY' };
  const { min, max } = acceptedDays(nowMs);
  if (post.day < min || post.day > max) return { ok: false, code: 'BAD_DAY' };
  if (!Number.isInteger(post.stars) || starsForRun(post.shots) !== post.stars) return { ok: false, code: 'INVALID_RESULT' };
  if (!Number.isInteger(post.streak) || post.streak < 1 || post.streak > FRIENDS_BOARD.maxStreak) return { ok: false, code: 'INVALID_RESULT' };
  return { ok: true };
}

/**
 * A member name as other members see it: control, zero-width and bidi-override characters removed, then the
 * room rule (trimmed, capped at `MULTIPLAYER.maxNameLength`, "Player 1" when blank).
 */
export function sanitizeBoardName(raw: unknown): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '') : raw;
  return sanitizePlayerName(cleaned, 0);
}

// ---------- What the board shows ----------

export interface BoardResultView {
  day: number;
  stars: number;
  shots: string;
  streak: number;
  /** Server time it was stored: the last tie-break. */
  postedAt: number;
}

export interface BoardMemberView {
  /** Opaque and stable (the membership id); never the secret token. */
  id: string;
  name: string;
  mine: boolean;
  joinedAt: number;
  today: BoardResultView | null;
  yesterday: BoardResultView | null;
}

/** What `boards:getBoard` returns: null for an unknown code; members only for a member. */
export type BoardSnapshot =
  | { code: string; joined: false; memberCount: number }
  | { code: string; joined: true; day: number; members: BoardMemberView[] };

/** One of my boards, as `boards:myBoards` lists it. */
export interface MyBoardEntry { code: string; memberCount: number; joinedAt: number }

/**
 * [PROPOSED 2026-11-25] Better first: more stars, then fewer shots, then a trick hit, then whoever posted first.
 * (For valid runs stars already fix the shot count; the shot rule only matters if the star rule ever changes.)
 */
export function compareResults(a: BoardResultView, b: BoardResultView): number {
  return b.stars - a.stars
    || a.shots.length - b.shots.length
    || Number(isTrickRun(b.shots)) - Number(isTrickRun(a.shots))
    || a.postedAt - b.postedAt;
}

export type BoardDay = 'today' | 'yesterday';

export interface RankedRow {
  member: BoardMemberView;
  result: BoardResultView | null;
  /** 1-based place among those who played; null for "not played yet". */
  rank: number | null;
}

/** The board for one day: everyone who played, ranked, then everyone who hasn't (me first, then by join time). */
export function rankBoard(members: readonly BoardMemberView[], which: BoardDay): RankedRow[] {
  const played = members.filter(m => m[which] !== null)
    .sort((a, b) => compareResults(a[which]!, b[which]!) || a.id.localeCompare(b.id));
  const waiting = members.filter(m => m[which] === null)
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  return [
    ...played.map((member, i) => ({ member, result: member[which], rank: i + 1 })),
    ...waiting.map(member => ({ member, result: null, rank: null })),
  ];
}

const ORDINAL = ['th', 'st', 'nd', 'rd'];

/** 1 → "1st", 12 → "12th", 22 → "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  return `${n}${tens >= 11 && tens <= 13 ? 'th' : ORDINAL[n % 10] ?? 'th'}`;
}

/** "★★☆" for 0–3 stars. */
export function starText(stars: number): string {
  const s = Math.max(0, Math.min(3, Math.round(stars)));
  return '★'.repeat(s) + '☆'.repeat(3 - s);
}

/** One result in words, for screen readers: "2 of 3 stars, miss then hit, trick shot". */
export function resultWords(result: BoardResultView): string {
  const words: Record<string, string> = { m: 'miss', h: 'hat', b: 'hit', t: 'trick hit' };
  const shots = [...(sanitizeDailyShots(result.shots) ?? '')].map(c => words[c]).join(' then ');
  const stars = result.stars > 0 ? `${result.stars} of 3 stars` : 'Jonh won';
  return [stars, shots].filter(Boolean).join(', ');
}

/** The symbols for a result (⬜🎩💥🎱), as in the Daily share text. */
export const resultSymbols = (result: BoardResultView): string => dailyShotSymbols(result.shots);

/** A one-breath summary of a day, for the live region and the screen's status line. */
export function boardSummary(rows: readonly RankedRow[], which: BoardDay): string {
  const day = which === 'today' ? 'Today' : 'Yesterday';
  const played = rows.filter(r => r.rank !== null).length;
  const waiting = rows.length - played;
  if (played === 0) return `${day}: nobody has played yet.`;
  const me = rows.find(r => r.member.mine);
  const mine = me?.rank != null ? `you're ${ordinal(me.rank)} of ${played}` : `${played} played`;
  const rest = waiting > 0 ? `${waiting} still to play` : 'everyone has played';
  return `${day}: ${mine}, ${rest}.`;
}

/** Names whose result for `which` is in `next` but was not in `prev` (for "Sam posted ★★☆" announcements). */
export function newlyPosted(prev: readonly BoardMemberView[] | null, next: readonly BoardMemberView[], which: BoardDay): BoardMemberView[] {
  if (!prev) return [];
  const had = new Set(prev.filter(m => m[which] !== null).map(m => m.id));
  return next.filter(m => m[which] !== null && !had.has(m.id) && !m.mine);
}

/** The invite a player sends friends (share sheet on phones, else the clipboard). */
export function boardInviteText(code: string, link: string): string {
  return `Join my Hit Jonh Daily board: ${code}\n${link}`;
}

/** "Today · 25 Nov" style labels for a day number. */
export const boardDayLabel = (day: number): string => dailyDateLabel(dayKeyOf(day));

// ---------- What a client still has to post ----------

/** A post plus the local date key it came from (the key the client marks as posted). */
export interface PendingPost extends BoardPost { key: string }

/** Consecutive played days ending with `key` (0 when `key` itself was not played). */
export function streakEnding(daily: Readonly<Record<string, number>>, key: string): number {
  let day = dayNumber(key);
  if (day === null) return 0;
  let count = 0;
  while (dayKeyOf(day) in daily) { count++; day--; }
  return count;
}

/**
 * Today's and yesterday's counted runs that are played, valid and not yet posted, oldest first. The pattern is
 * the counted (first) run saved by `recordDaily`, so replays can never change what is posted. A run whose saved
 * stars and pattern disagree (a hand-edited save) is skipped rather than refused by the server again and again.
 */
export function pendingBoardPosts(daily: Readonly<Record<string, number>>, dailyShots: Readonly<Record<string, string>>,
  todayKey: string, posted: readonly string[]): PendingPost[] {
  const today = dayNumber(todayKey);
  if (today === null) return [];
  const out: PendingPost[] = [];
  for (const day of [today - 1, today]) {
    const key = dayKeyOf(day);
    const stars = daily[key];
    const shots = dailyShots[key] ?? '';
    if (stars === undefined || posted.includes(key) || starsForRun(shots) !== stars) continue;
    out.push({ key, day, stars, shots, streak: Math.min(FRIENDS_BOARD.maxStreak, streakEnding(daily, key)) });
  }
  return out;
}
