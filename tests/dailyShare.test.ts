import { describe, expect, it } from 'vitest';
import { dailyDateLabel, dailyLink, dailyShareText, sanitizeDailyShots, shotCode } from '../src/rules/dailyShare';
import { freshProgress, recordDaily, sanitizeProgress } from '../src/rules/progression';
import { MAP_IDS } from '../src/levels';
import { shareOrCopy } from '../src/ui/share';

const url = 'https://hit.example/?daily';

describe('Daily Bonk share text', () => {
  it('codes each outcome and only accepts possible runs', () => {
    expect(['miss', 'hat_only', 'body', 'ricochet_body'].map(o => shotCode(o as Parameters<typeof shotCode>[0]))).toEqual(['m', 'h', 'b', 't']);
    for (const ok of ['b', 't', 'mb', 'ht', 'mmb', 'mmm', 'mhh', 'h']) expect(sanitizeDailyShots(ok)).toBe(ok);
    // A hit ends the run; at most three shots; nothing else.
    for (const bad of ['', 'bm', 'mbm', 'mmmb', 'x', 'MB', 3, null]) expect(sanitizeDailyShots(bad)).toBeNull();
  });

  it('labels dates the same everywhere', () => {
    expect(dailyDateLabel('2026-11-25')).toBe('25 Nov');
    expect(dailyDateLabel('2027-01-03')).toBe('3 Jan');
    expect(dailyDateLabel('nonsense')).toBe('nonsense');
  });

  it('builds a short, spoiler-free result with one symbol per shot', () => {
    expect(dailyShareText({ key: '2026-11-25', shots: 'mb', stars: 2, streak: 3, url })).toBe(
      'Hit Jonh Daily · 25 Nov · ★★☆\n⬜💥\n🔥 3-day streak\nhttps://hit.example/?daily');
    expect(dailyShareText({ key: '2026-11-25', shots: 't', stars: 3, streak: 1, url })).toBe(
      'Hit Jonh Daily · 25 Nov · ★★★\n🎱 trick shot!\nhttps://hit.example/?daily');
    expect(dailyShareText({ key: '2026-11-25', shots: 'mhm', stars: 0, streak: 0, url })).toBe(
      'Hit Jonh Daily · 25 Nov · ☆☆☆\n⬜🎩⬜ Jonh wins\nhttps://hit.example/?daily');
    // Older saves have no pattern: stars only.
    expect(dailyShareText({ key: '2026-11-25', shots: '', stars: 1, streak: 1, url })).toBe(
      'Hit Jonh Daily · 25 Nov · ★☆☆\nhttps://hit.example/?daily');
  });

  it('links to the daily challenge without the rest of the address', () => {
    expect(dailyLink('https://hit.example', '/')).toBe('https://hit.example/?daily');
    expect(dailyLink('http://localhost:5173', '/game/')).toBe('http://localhost:5173/game/?daily');
  });
});

describe('Daily run pattern in progress', () => {
  it('keeps the first run of a day only, with its shots', () => {
    let p = recordDaily(freshProgress(), '2026-11-25', 2, 'mb');
    p = recordDaily(p, '2026-11-25', 3, 'b');
    expect(p.daily['2026-11-25']).toBe(2);
    expect(p.dailyShots['2026-11-25']).toBe('mb');
    // An impossible pattern is dropped, the stars still count.
    p = recordDaily(p, '2026-11-26', 1, 'bmb');
    expect(p.daily['2026-11-26']).toBe(1);
    expect(p.dailyShots['2026-11-26']).toBeUndefined();
  });

  it('sanitizes saved patterns and drops ones without a daily result', () => {
    const p = sanitizeProgress({ daily: { '2026-11-25': 2 }, dailyShots: { '2026-11-25': 'mb', '2026-11-24': 'b', '2026-11-23': 'zz' } }, MAP_IDS);
    expect(p.dailyShots).toEqual({ '2026-11-25': 'mb' });
    expect(sanitizeProgress({}, MAP_IDS).dailyShots).toEqual({});
  });
});

describe('shareOrCopy', () => {
  const clipboard = (ok: boolean) => ({ text: '', writeText(text: string) { this.text = text; return ok ? Promise.resolve() : Promise.reject(new Error('denied')); } });

  it('uses the share sheet on touch devices, the clipboard elsewhere', async () => {
    const shared: string[] = [];
    const nav = { share: (d: { text: string }) => { shared.push(d.text); return Promise.resolve(); }, clipboard: clipboard(true) };
    expect(await shareOrCopy('hi', nav, true)).toBe('shared');
    expect(shared).toEqual(['hi']);
    expect(await shareOrCopy('desk', nav, false)).toBe('copied');
    expect(nav.clipboard.text).toBe('desk');
  });

  it('treats a dismissed share sheet as a choice and falls back to copying on other errors', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    expect(await shareOrCopy('x', { share: () => Promise.reject(abort), clipboard: clipboard(true) }, true)).toBe('cancelled');
    expect(await shareOrCopy('x', { share: () => Promise.reject(new Error('nope')), clipboard: clipboard(true) }, true)).toBe('copied');
    expect(await shareOrCopy('x', { clipboard: clipboard(false) }, false)).toBe('failed');
    expect(await shareOrCopy('x', undefined, false)).toBe('failed');
  });
});
