/**
 * The shareable Daily Bonk result: one short, spoiler-free text a player can paste to friends
 * ("Hit Jonh Daily · 25 Nov · ★★☆" plus one symbol per shot and the link). Pure: no DOM, no Phaser.
 *
 * [PROPOSED 2026-11-25] Format and symbols. Only the day's first (counted) run is shared; replays are
 * just for fun, as before.
 */
import type { ClassifiedOutcome } from '../sim/classification';

/** One letter per shot of a daily run: miss, hat-only, body hit, trick (ricochet) hit. */
export type DailyShotCode = 'm' | 'h' | 'b' | 't';

/** The URL parameter that opens today's Daily Bonk directly (`?daily`). */
export const DAILY_LINK_PARAM = 'daily';

const CODE: Record<ClassifiedOutcome, DailyShotCode> = { miss: 'm', hat_only: 'h', body: 'b', ricochet_body: 't' };

/** Miss ⬜, hat 🎩, hit 💥, trick (bank) shot 🎱. */
const SYMBOL: Record<DailyShotCode, string> = { m: '⬜', h: '🎩', b: '💥', t: '🎱' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shotCode(outcome: ClassifiedOutcome): DailyShotCode {
  return CODE[outcome];
}

/** A saved run pattern, or null when it is not one: one to three codes, only the last may be a hit. */
export function sanitizeDailyShots(raw: unknown): string | null {
  return typeof raw === 'string' && /^[mh]{0,2}[mhbt]$/.test(raw) ? raw : null;
}

/** "2026-11-25" → "25 Nov" (fixed English, so the text is the same on every device). */
export function dailyDateLabel(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month}` : key;
}

export interface DailyShareInput {
  /** Local date key (YYYY-MM-DD). */
  key: string;
  /** Saved shot pattern (see DailyShotCode); empty when unknown (older saves). */
  shots: string;
  /** 0 = Jonh won, else 1–3. */
  stars: number;
  /** Consecutive days played, including this one. */
  streak: number;
  /** Where friends can play it (the game's address with `?daily`). */
  url: string;
}

/**
 * The text to paste, e.g.
 *
 *     Hit Jonh Daily · 25 Nov · ★★☆
 *     ⬜💥
 *     🔥 3-day streak
 *     https://example.com/?daily
 */
export function dailyShareText(input: DailyShareInput): string {
  const stars = Math.max(0, Math.min(3, Math.round(input.stars)));
  const headline = `Hit Jonh Daily · ${dailyDateLabel(input.key)} · ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
  const shots = sanitizeDailyShots(input.shots);
  const symbols = shots ? [...shots].map(c => SYMBOL[c as DailyShotCode]).join('') : '';
  const verdict = stars === 0 ? 'Jonh wins' : shots?.endsWith('t') ? 'trick shot!' : '';
  const lines = [headline];
  const pattern = [symbols, verdict].filter(Boolean).join(' ');
  if (pattern) lines.push(pattern);
  if (input.streak >= 2) lines.push(`🔥 ${input.streak}-day streak`);
  if (input.url) lines.push(input.url);
  return lines.join('\n');
}

/** The game's address with `?daily` (any other query or hash dropped). */
export function dailyLink(origin: string, pathname: string): string {
  return `${origin}${pathname}?${DAILY_LINK_PARAM}`;
}
