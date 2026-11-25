import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS } from '../src/input/keyBindings';
import { freshProgress, type Progress } from '../src/rules/progression';
import { decodeSaveCode, encodeSaveCode, mergeSave, saveSummary, type DecodedSave } from '../src/storage/saveCode';
import type { SaveData } from '../src/storage/storage';

const score = (bestShots: number | null, hasStyle = false) => ({ bestShots, hasStyle, lastAngle: 40, lastPower: 60 });

function save(solo: SaveData['solo'], progress: Partial<Progress> = {}): SaveData {
  return {
    version: 'hitJonh.v1',
    solo,
    progress: { ...freshProgress(), ...progress },
    settings: { muted: false, volume: 1, reducedMotion: false, music: true, keys: DEFAULT_KEYS, playerColors: 'standard' },
  };
}

const decoded = async (code: string): Promise<DecodedSave> => {
  const out = await decodeSaveCode(code);
  if ('error' in out) throw new Error(out.error);
  return out;
};

describe('save codes (next 10, item 6)', () => {
  const phone = save({ backyard: score(1), fence: score(2, true), rooftop: score(null) }, {
    totalHits: 42, trickHits: 3, bestStreak: 6, hitMaps: ['backyard', 'fence'], threeStarMaps: ['backyard'],
    daily: { '2026-11-20': 3, '2026-11-21': 0 }, dailyShots: { '2026-11-20': 'b' }, seenTips: ['wind'], selectedHat: 'bowler',
  });

  it('round-trips the solo bests and progress, but not the device selections', async () => {
    const code = await encodeSaveCode(phone);
    expect(code).toMatch(/^HJ1-[0-9a-z]{4}-[A-Za-z0-9_-]+$/);
    const back = await decoded(code);
    expect(back.solo).toEqual({ backyard: { bestShots: 1, hasStyle: false }, fence: { bestShots: 2, hasStyle: true }, rooftop: { bestShots: null, hasStyle: false } });
    expect(back.progress).toMatchObject({ totalHits: 42, trickHits: 3, bestStreak: 6, threeStarMaps: ['backyard'], daily: { '2026-11-20': 3, '2026-11-21': 0 }, seenTips: ['wind'] });
    expect(back.progress.dailyShots).toEqual({ '2026-11-20': 'b' });
    expect(back.progress.earnedHats).toContain('bowler');
    expect(back.progress.selectedHat).toBe('boater');
  });

  it('is short enough to paste, and copes with the spaces and line breaks of copying', async () => {
    const code = await encodeSaveCode(phone);
    expect(code.length).toBeLessThan(400);
    // A year of Daily Bonks packs one character per day.
    const daily: Record<string, number> = {};
    const dailyShots: Record<string, string> = {};
    for (let i = 0; i < 365; i++) {
      const key = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      if (i % 9 === 4) continue; // a few days missed
      daily[key] = i % 4;
      dailyShots[key] = ['mmm', 'mmb', 'mb', 'b'][i % 4]!;
    }
    const year = save({}, { daily, dailyShots });
    const yearCode = await encodeSaveCode(year);
    expect(yearCode.length).toBeLessThan(1200);
    const back = await decoded(yearCode);
    expect(back.progress.daily).toEqual(daily);
    expect(back.progress.dailyShots).toEqual(dailyShots);
    const mangled = `  ${code.slice(0, 20)}\n${code.slice(20, 50)} ${code.slice(50)}\n`;
    expect((await decoded(mangled)).progress.totalHits).toBe(42);
    // Without CompressionStream the code is uncompressed (HJ0) and still reads.
    const plain = await encodeSaveCode(phone, false);
    expect(plain.startsWith('HJ0-')).toBe(true);
    expect((await decoded(plain)).progress.totalHits).toBe(42);
  });

  it('rejects a code copied short, a typo, garbage and other versions', async () => {
    const code = await encodeSaveCode(phone, false);
    expect(await decodeSaveCode(code.slice(0, -6))).toEqual({ error: expect.stringMatching(/format|checksum/) });
    const typo = code.slice(0, -3) + (code.at(-3) === 'A' ? 'B' : 'A') + code.slice(-2);
    expect(await decodeSaveCode(typo)).toEqual({ error: expect.stringMatching(/format|checksum/) });
    expect(await decodeSaveCode('hello')).toEqual({ error: 'format' });
    expect(await decodeSaveCode('')).toEqual({ error: 'format' });
    const json = JSON.stringify({ v: 2, s: {}, p: {} });
    const sum = (() => { let h = 2166136261; for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 36 ** 4).toString(36).padStart(4, '0'); })();
    const future = `HJ0-${sum}-${btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    expect(await decodeSaveCode(future)).toEqual({ error: 'version' });
  });

  it('validates what a code says (unknown gardens dropped, impossible bests ignored)', async () => {
    const json = JSON.stringify({ v: 1, s: { backyard: [7, 1], nowhere: [1, 0], fence: [2, 0] }, p: { totalHits: -5, threeStarMaps: ['nowhere', 'fence'] } });
    let h = 2166136261;
    for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619); }
    const sum = ((h >>> 0) % 36 ** 4).toString(36).padStart(4, '0');
    const back = await decoded(`HJ0-${sum}-${btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`);
    expect(back.solo).toEqual({ backyard: { bestShots: null, hasStyle: true }, fence: { bestShots: 2, hasStyle: false } });
    expect(back.progress.totalHits).toBe(0);
    expect(back.progress.threeStarMaps).toEqual(['fence']);
  });

  it('merges the best of both devices and never takes anything away', async () => {
    const laptop = save({ backyard: score(2), rubber: score(1, true), fence: score(3) }, {
      totalHits: 10, trickHits: 5, hitMaps: ['rubber'], daily: { '2026-11-21': 2, '2026-11-22': 1 }, dailyShots: { '2026-11-21': 'mb', '2026-11-22': 'mmb' },
      selectedHat: 'boater', seenTips: ['rubber'],
    });
    const merged = mergeSave(laptop, await decoded(await encodeSaveCode(phone)));
    expect(merged.solo.backyard).toMatchObject({ bestShots: 1, hasStyle: false, lastAngle: 40 });
    expect(merged.solo.fence).toMatchObject({ bestShots: 2, hasStyle: true });
    expect(merged.solo.rubber).toMatchObject({ bestShots: 1, hasStyle: true });
    expect(merged.solo.rooftop).toMatchObject({ bestShots: null });
    const p = merged.progress!;
    expect(p).toMatchObject({ totalHits: 42, trickHits: 5, bestStreak: 6, selectedHat: 'boater' });
    expect(p.hitMaps.sort()).toEqual(['backyard', 'fence', 'rubber']);
    expect(p.daily).toEqual({ '2026-11-20': 3, '2026-11-21': 2, '2026-11-22': 1 });
    expect(p.dailyShots).toEqual({ '2026-11-20': 'b', '2026-11-21': 'mb', '2026-11-22': 'mmb' });
    expect(p.seenTips.sort()).toEqual(['rubber', 'wind']);
    expect(p.earnedHats).toEqual(expect.arrayContaining(['bowler', 'propeller', 'party']));

    // Loading an older code from the same device changes nothing.
    const again = mergeSave(merged, await decoded(await encodeSaveCode(laptop)));
    expect(again.solo).toEqual(merged.solo);
    expect(again.progress).toEqual(merged.progress);
    expect(saveSummary(merged)).toMatchObject({ stars: 3 + 2 + 3, hits: 42 });
  });
});
