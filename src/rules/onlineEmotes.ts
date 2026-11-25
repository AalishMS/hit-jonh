// src/rules/onlineEmotes.ts — online emotes (SPEC §6.1): the canned set, the rate limit and what a client shows.
// Pure (no Phaser, no Convex): the server and the client both import it.
import { ONLINE } from '../config/tuning';
import type { Check } from './onlineRules';
import type { EmoteEntry } from './onlineTypes';

export interface EmoteDef { readonly id: string; readonly text: string }

/**
 * [PROPOSED 2026-11-25] The fixed set. Never free text ("chat" is out of scope), so there is nothing to moderate.
 * Ids are what travel over the wire; the text is only ever looked up here, so wording can change freely.
 * The first lines echo the hot-seat taunts (`TAUNTS` in matchStakes.ts).
 */
export const EMOTES = [
  { id: 'beat_that', text: 'Beat that!' },
  { id: 'unlucky', text: 'Unlucky!' },
  { id: 'nice_shot', text: 'Nice shot!' },
  { id: 'oof', text: 'Oof.' },
  { id: 'poor_jonh', text: 'Poor Jonh.' },
  { id: 'rematch', text: 'Rematch?' },
] as const satisfies readonly EmoteDef[];

export type EmoteId = (typeof EMOTES)[number]['id'];

export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === 'string' && EMOTES.some(e => e.id === value);
}

/** The words for an emote id, or null for an id this client does not know (a newer server's emote is ignored). */
export function emoteText(id: string): string | null {
  return EMOTES.find(e => e.id === id)?.text ?? null;
}

const MS = 1000;

/** A seat's allowance: `tokens` left as of `at` (ms). Each emote costs one; they refill steadily up to the burst. */
export interface EmoteBucket { tokens: number; at: number }

/** Tokens available at `now`, never above the burst. A clock that ran backwards earns nothing. */
export function emoteTokens(bucket: EmoteBucket | null, now: number,
  burst: number = ONLINE.emoteBurst, refillSeconds: number = ONLINE.emoteRefillSeconds): number {
  if (!bucket) return burst;
  const earned = Math.max(0, now - bucket.at) / (refillSeconds * MS);
  return Math.min(burst, bucket.tokens + earned);
}

/** Spends one token, or says when the next is due. `bucket` is what to store when it succeeded. */
export function takeEmoteToken(bucket: EmoteBucket | null, now: number,
  burst: number = ONLINE.emoteBurst, refillSeconds: number = ONLINE.emoteRefillSeconds):
  { ok: true; bucket: EmoteBucket } | { ok: false; retryAfterMs: number } {
  const tokens = emoteTokens(bucket, now, burst, refillSeconds);
  if (tokens < 1) return { ok: false, retryAfterMs: Math.ceil((1 - tokens) * refillSeconds * MS) };
  return { ok: true, bucket: { tokens: tokens - 1, at: now } };
}

/** Everything the server checks about a send, in order: a known emote id, then the seat's allowance. */
export function checkEmoteSend(emote: unknown, bucket: EmoteBucket | null, now: number): Check<{ emote: EmoteId; bucket: EmoteBucket }> {
  if (!isEmoteId(emote)) return { ok: false, code: 'INVALID_EMOTE' };
  const taken = takeEmoteToken(bucket, now);
  if (!taken.ok) return { ok: false, code: 'RATE_LIMITED' };
  return { ok: true, emote, bucket: taken.bucket };
}

/** An emote another client should show now. */
export interface ShownEmote { key: string; seat: number; emote: EmoteId; mine: boolean; at: number }

/**
 * What a client has already shown. The first list it gets (joining, or a reload) only sets the baseline, so old
 * emotes never replay; after that an entry is new when its `seq` beats the last one seen from that sender.
 * My own emotes are shown at once when I send them (`beginOwn`); the echo from the server is then swallowed.
 */
export class EmoteTracker {
  private readonly seen = new Map<string, number>();
  private seeded = false;
  private nextTicket = 1;
  private tickets: number[] = [];

  /** False until the first list arrives; sending waits for it so my own first echo cannot be mistaken for old news. */
  get ready(): boolean { return this.seeded; }

  /** `serverNow` is the server clock estimate (ms); entries older than the max age are skipped. */
  ingest(entries: readonly EmoteEntry[], serverNow: number): ShownEmote[] {
    const fresh: ShownEmote[] = [];
    for (const entry of [...entries].sort((a, b) => a.at - b.at || a.seq - b.seq)) {
      const before = this.seen.get(entry.sender) ?? 0;
      if (entry.seq <= before) continue;
      this.seen.set(entry.sender, entry.seq);
      if (!this.seeded) continue;
      if (entry.mine && this.tickets.length > 0) { this.tickets.shift(); continue; }
      if (!isEmoteId(entry.emote) || serverNow - entry.at > ONLINE.emoteMaxAgeSeconds * MS) continue;
      fresh.push({ key: `${entry.sender}#${entry.seq}`, seat: entry.seat, emote: entry.emote, mine: entry.mine, at: entry.at });
    }
    this.seeded = true;
    return fresh;
  }

  /** I am sending one: shown locally now, and the server's echo of it will not show again. */
  beginOwn(): number {
    const ticket = this.nextTicket++;
    this.tickets.push(ticket);
    return ticket;
  }

  /** The send failed. True when the echo had not arrived, so the local bubble should be taken back. */
  cancelOwn(ticket: number): boolean {
    const at = this.tickets.indexOf(ticket);
    if (at < 0) return false;
    this.tickets.splice(at, 1);
    return true;
  }
}

export interface Bubble { key: string; seat: number; emote: EmoteId; mine: boolean; until: number }

/** The bubbles currently up: one per seat (a newer one replaces it), the newest few overall, each for a few seconds. */
export class EmoteBoard {
  private bubbles: Bubble[] = [];

  /** `now` and the return value are in seconds on the caller's clock. */
  add(shown: { key: string; seat: number; emote: EmoteId; mine: boolean }, now: number,
    seconds: number = ONLINE.emoteShowSeconds, maxVisible: number = ONLINE.emoteMaxVisible): void {
    this.bubbles = this.bubbles.filter(b => b.seat !== shown.seat && b.until > now);
    this.bubbles.push({ ...shown, until: now + seconds });
    if (this.bubbles.length > maxVisible) this.bubbles = this.bubbles.slice(-maxVisible);
  }

  remove(key: string): void { this.bubbles = this.bubbles.filter(b => b.key !== key); }

  clear(): void { this.bubbles = []; }

  /** Oldest first. Expired bubbles are dropped as a side effect. */
  active(now: number): readonly Bubble[] {
    this.bubbles = this.bubbles.filter(b => b.until > now);
    return this.bubbles;
  }
}
