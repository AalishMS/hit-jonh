// tests/onlineEmotes.test.ts — the pure emote rules: the canned set, the rate limit, what a client shows.
import { describe, expect, it } from 'vitest';
import { ONLINE } from '../src/config/tuning';
import {
  EMOTES, EmoteBoard, EmoteTracker, checkEmoteSend, emoteText, emoteTokens, isEmoteId, takeEmoteToken, type EmoteBucket,
} from '../src/rules/onlineEmotes';
import type { EmoteEntry } from '../src/rules/onlineTypes';

const REFILL = ONLINE.emoteRefillSeconds * 1000;

describe('the emote set', () => {
  it('has unique ids, short plain text, and nothing a player can type', () => {
    expect(EMOTES.length).toBe(6);
    expect(new Set(EMOTES.map(e => e.id)).size).toBe(EMOTES.length);
    for (const e of EMOTES) {
      expect(e.id).toMatch(/^[a-z_]+$/);
      expect(e.text.length).toBeGreaterThan(0);
      expect(e.text.length).toBeLessThanOrEqual(16);
    }
  });

  it('spells Jonh right and accepts only known ids', () => {
    expect(EMOTES.some(e => e.text.includes('Jonh'))).toBe(true);
    expect(JSON.stringify(EMOTES)).not.toMatch(/John\b/);
    expect(isEmoteId('beat_that')).toBe(true);
    for (const bad of ['', 'Beat that!', 'BEAT_THAT', 'beat_that ', '__proto__', 'constructor', 7, null, undefined, {}, ['beat_that']]) {
      expect(isEmoteId(bad)).toBe(false);
    }
  });

  it('looks text up by id and returns null for an unknown one', () => {
    expect(emoteText('oof')).toBe('Oof.');
    expect(emoteText('nope')).toBeNull();
    expect(emoteText('toString')).toBeNull();
  });
});

describe('the rate limit', () => {
  it('starts with a full burst, spends one per emote and then refuses with the wait', () => {
    let bucket: EmoteBucket | null = null;
    const t0 = 1_000_000;
    for (let i = 0; i < ONLINE.emoteBurst; i++) {
      const r = takeEmoteToken(bucket, t0);
      expect(r.ok).toBe(true);
      if (r.ok) bucket = r.bucket;
    }
    const refused = takeEmoteToken(bucket, t0);
    expect(refused).toEqual({ ok: false, retryAfterMs: REFILL });
    const partway = takeEmoteToken(bucket, t0 + REFILL / 2);
    expect(partway).toEqual({ ok: false, retryAfterMs: REFILL / 2 });
  });

  it('earns one token per refill period, up to the burst and no further', () => {
    const empty: EmoteBucket = { tokens: 0, at: 0 };
    expect(emoteTokens(empty, REFILL)).toBe(1);
    expect(emoteTokens(empty, 2.5 * REFILL)).toBeCloseTo(2.5);
    expect(emoteTokens(empty, 1000 * REFILL)).toBe(ONLINE.emoteBurst);
    expect(emoteTokens(null, 0)).toBe(ONLINE.emoteBurst);
    const r = takeEmoteToken(empty, REFILL);
    expect(r).toEqual({ ok: true, bucket: { tokens: 0, at: REFILL } });
  });

  it('keeps fractions, so steady sending at the refill rate is allowed forever', () => {
    let bucket: EmoteBucket | null = null;
    let now = 5_000;
    for (let i = 0; i < 40; i++) {
      const r = takeEmoteToken(bucket, now);
      expect(r.ok).toBe(true);
      if (r.ok) bucket = r.bucket;
      now += REFILL;
    }
  });

  it('a spammer gets at most burst + elapsed/refill emotes', () => {
    let bucket: EmoteBucket | null = null;
    let accepted = 0;
    const seconds = 20;
    for (let ms = 0; ms <= seconds * 1000; ms += 100) {
      const r = takeEmoteToken(bucket, ms);
      if (r.ok) { accepted++; bucket = r.bucket; }
    }
    expect(accepted).toBeLessThanOrEqual(ONLINE.emoteBurst + Math.floor(seconds / ONLINE.emoteRefillSeconds));
    expect(accepted).toBeGreaterThanOrEqual(ONLINE.emoteBurst + Math.floor(seconds / ONLINE.emoteRefillSeconds) - 1);
  });

  it('a clock that runs backwards earns nothing but does not go negative or break', () => {
    const bucket: EmoteBucket = { tokens: 1, at: 10_000 };
    expect(emoteTokens(bucket, 0)).toBe(1);
    const r = takeEmoteToken(bucket, 0);
    expect(r).toEqual({ ok: true, bucket: { tokens: 0, at: 0 } });
  });

  it('checks the id before spending anything', () => {
    const bucket: EmoteBucket = { tokens: 1, at: 0 };
    expect(checkEmoteSend('free text', bucket, 0)).toEqual({ ok: false, code: 'INVALID_EMOTE' });
    expect(checkEmoteSend('oof', { tokens: 0, at: 0 }, 0)).toEqual({ ok: false, code: 'RATE_LIMITED' });
    expect(checkEmoteSend('oof', bucket, 0)).toEqual({ ok: true, emote: 'oof', bucket: { tokens: 0, at: 0 } });
  });
});

const entry = (seq: number, over: Partial<EmoteEntry> = {}): EmoteEntry =>
  ({ sender: 'a', seat: 1, emote: 'oof', seq, at: 1_000, mine: false, ...over });

describe('EmoteTracker', () => {
  it('takes the first list as the baseline and shows only what comes after', () => {
    const t = new EmoteTracker();
    expect(t.ready).toBe(false);
    expect(t.ingest([entry(4), entry(2, { sender: 'b', seat: 2 })], 1_000)).toEqual([]);
    expect(t.ready).toBe(true);
    expect(t.ingest([entry(4), entry(2, { sender: 'b', seat: 2 })], 1_000)).toEqual([]);
    const fresh = t.ingest([entry(5, { emote: 'unlucky', at: 1_500 }), entry(2, { sender: 'b', seat: 2 })], 1_600);
    expect(fresh).toEqual([{ key: 'a#5', seat: 1, emote: 'unlucky', mine: false, at: 1_500 }]);
    expect(t.ingest([entry(5, { at: 1_500 })], 1_700)).toEqual([]);
  });

  it('an empty first list is a baseline too', () => {
    const t = new EmoteTracker();
    expect(t.ingest([], 0)).toEqual([]);
    expect(t.ingest([entry(1)], 1_000)).toHaveLength(1);
  });

  it('orders several new emotes by when they were sent', () => {
    const t = new EmoteTracker();
    t.ingest([], 0);
    const fresh = t.ingest([entry(1, { sender: 'b', seat: 2, at: 2_000 }), entry(1, { at: 1_000 })], 2_000);
    expect(fresh.map(f => f.seat)).toEqual([1, 2]);
  });

  it('skips an emote delivered long after it was sent, and one it does not know, but still counts them as seen', () => {
    const t = new EmoteTracker();
    t.ingest([], 0);
    const late = t.ingest([entry(1, { at: 0 })], ONLINE.emoteMaxAgeSeconds * 1000 + 1);
    expect(late).toEqual([]);
    expect(t.ingest([entry(2, { emote: 'a_newer_emote', at: 5_000 })], 5_000)).toEqual([]);
    expect(t.ingest([entry(2, { emote: 'a_newer_emote', at: 5_000 })], 5_000)).toEqual([]);
  });

  it('swallows the echo of my own emote once per send, and shows one from another tab', () => {
    const t = new EmoteTracker();
    t.ingest([], 0);
    t.beginOwn();
    expect(t.ingest([entry(1, { sender: 'me', mine: true })], 1_000)).toEqual([]);
    expect(t.ingest([entry(2, { sender: 'me', mine: true })], 1_000)).toHaveLength(1);
  });

  it('a failed send gives its ticket back only if the echo had not arrived', () => {
    const t = new EmoteTracker();
    t.ingest([], 0);
    const failed = t.beginOwn();
    expect(t.cancelOwn(failed)).toBe(true);
    expect(t.cancelOwn(failed)).toBe(false);
    expect(t.ingest([entry(1, { sender: 'me', mine: true })], 1_000)).toHaveLength(1);

    const sent = t.beginOwn();
    t.ingest([entry(2, { sender: 'me', mine: true })], 1_000);
    expect(t.cancelOwn(sent)).toBe(false);
  });

  it('tracks senders separately, so a seat that changes number does not hide or replay anything', () => {
    const t = new EmoteTracker();
    t.ingest([entry(9, { sender: 'a', seat: 2 })], 0);
    // a lobby left and renumbered: sender b now holds seat 2
    const fresh = t.ingest([entry(1, { sender: 'b', seat: 2, at: 1_000 })], 1_000);
    expect(fresh).toHaveLength(1);
    expect(t.ingest([entry(9, { sender: 'a', seat: 1 })], 1_000)).toEqual([]);
  });
});

describe('EmoteBoard', () => {
  const shown = (key: string, seat: number, emote: 'oof' | 'unlucky' = 'oof') => ({ key, seat, emote, mine: false });

  it('keeps a bubble for the show time and then drops it', () => {
    const b = new EmoteBoard();
    b.add(shown('k1', 1), 10);
    expect(b.active(10 + ONLINE.emoteShowSeconds - 0.1).map(x => x.key)).toEqual(['k1']);
    expect(b.active(10 + ONLINE.emoteShowSeconds)).toEqual([]);
  });

  it('a newer emote from a seat replaces its older bubble', () => {
    const b = new EmoteBoard();
    b.add(shown('k1', 1), 0);
    b.add(shown('k2', 1, 'unlucky'), 1);
    expect(b.active(1).map(x => x.key)).toEqual(['k2']);
  });

  it('shows at most the newest few bubbles', () => {
    const b = new EmoteBoard();
    for (let seat = 0; seat < ONLINE.emoteMaxVisible + 2; seat++) b.add(shown(`k${seat}`, seat), seat * 0.1);
    const keys = b.active(1).map(x => x.key);
    expect(keys).toHaveLength(ONLINE.emoteMaxVisible);
    expect(keys.at(-1)).toBe(`k${ONLINE.emoteMaxVisible + 1}`);
  });

  it('removes one bubble by key (a rejected send) and clears all', () => {
    const b = new EmoteBoard();
    b.add(shown('k1', 1), 0);
    b.add(shown('k2', 2), 0);
    b.remove('k1');
    expect(b.active(0).map(x => x.key)).toEqual(['k2']);
    b.clear();
    expect(b.active(0)).toEqual([]);
  });
});
