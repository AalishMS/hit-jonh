/**
 * Save codes [DECIDED request 2026-11-25; format and merge rules PROPOSED]: move progress between
 * devices without accounts. A code carries the solo bests and `Progress` (stars, tricks, hits,
 * streaks, Daily results, cosmetics earned, tips seen) — not settings, keys, multiplayer names or the
 * online identity, which belong to the device. It is compact JSON, deflated when the browser can
 * (`CompressionStream`), base64url-encoded behind "HJ1-" (or "HJ0-" uncompressed) and a 4-character
 * checksum that catches a code copied short or mistyped.
 *
 * Loading a code merges it into this device's save: the best of both, so a code can never take
 * anything away (an older code from the same device changes nothing).
 */
import { MAPS } from '../levels';
import { campaignStatus, campaignTotals } from '../rules/campaign';
import { cosmeticContext } from '../rules/cosmetics';
import { HAT_ORDER, sanitizeProgress, type Progress } from '../rules/progression';
import { loadSaveData, writeSaveData, type LevelScore, type SaveData } from './storage';

const VERSION = 1;
const PREFIX = 'HJ';

/**
 * What a code carries: per garden [best shots (0 = attempted, no hit), trick 0/1]; the progress
 * without its Daily records; and the Daily records packed one character per day (`d`).
 */
interface Payload {
  v: number;
  s: Record<string, [number, number]>;
  p: Omit<Progress, 'selectedHat' | 'selectedCannon' | 'selectedOutfit' | 'daily' | 'dailyShots'>;
  d?: PackedDaily;
}

/** Daily results from the first day played: [day number, a character per day ('.' none, '0'–'3' stars), each played day's shots]. */
type PackedDaily = [number, string, string[]];

const DAY_MS = 86_400_000;
const dayNumber = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
const dayKey = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

function packDaily(p: Pick<Progress, 'daily' | 'dailyShots'>): PackedDaily | undefined {
  const days = Object.keys(p.daily).sort();
  if (days.length === 0) return undefined;
  const first = dayNumber(days[0]!);
  const span = dayNumber(days[days.length - 1]!) - first + 1;
  const marks = Array.from({ length: span }, () => '.');
  for (const key of days) marks[dayNumber(key) - first] = String(p.daily[key]);
  return [first, marks.join(''), days.map(key => p.dailyShots[key] ?? '')];
}

/** Back to `daily`/`dailyShots` records (sanitizeProgress validates what comes out). */
function unpackDaily(d: unknown): { daily: Record<string, unknown>; dailyShots: Record<string, unknown> } {
  const daily: Record<string, unknown> = {};
  const dailyShots: Record<string, unknown> = {};
  if (!Array.isArray(d) || typeof d[0] !== 'number' || !Number.isInteger(d[0]) || typeof d[1] !== 'string' || d[1].length > 20_000) return { daily, dailyShots };
  const shots = Array.isArray(d[2]) ? d[2] : [];
  let played = 0;
  for (let i = 0; i < d[1].length; i++) {
    const mark = d[1][i]!;
    if (mark === '.') continue;
    const key = dayKey(d[0] + i);
    daily[key] = Number(mark);
    const pattern = shots[played++];
    if (typeof pattern === 'string' && pattern) dailyShots[key] = pattern;
  }
  return { daily, dailyShots };
}

export interface DecodedSave {
  solo: Record<string, { bestShots: number | null; hasStyle: boolean }>;
  progress: Progress;
}

export type DecodeError = 'format' | 'checksum' | 'version' | 'unsupported';

const mapIds = (): string[] => MAPS.map(m => m.id);

/** FNV-1a of the JSON, as 4 base-36 characters. */
function checksum(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 36 ** 4).toString(36).padStart(4, '0');
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const canCompress = (): boolean => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** The code for this save's solo bests and progress. */
export async function encodeSaveCode(data: Pick<SaveData, 'solo' | 'progress'>, compress = canCompress()): Promise<string> {
  // Selections (hat, outfit, cannon) stay with each device.
  const progress: Partial<Progress> = { ...sanitizeProgress(data.progress ?? {}, mapIds(), cosmeticContext(mapIds(), data.solo)) };
  delete progress.selectedHat;
  delete progress.selectedCannon;
  delete progress.selectedOutfit;
  const d = packDaily(progress as Progress);
  delete progress.daily;
  delete progress.dailyShots;
  const s: Payload['s'] = {};
  for (const [id, score] of Object.entries(data.solo)) {
    if (score && mapIds().includes(id)) s[id] = [score.bestShots ?? 0, score.hasStyle ? 1 : 0];
  }
  const json = JSON.stringify({ v: VERSION, s, p: progress as Payload['p'], ...(d ? { d } : {}) } satisfies Payload);
  const bytes = new TextEncoder().encode(json);
  const body = compress ? await through(bytes, new CompressionStream('deflate-raw')) : bytes;
  return `${PREFIX}${compress ? 1 : 0}-${checksum(json)}-${toBase64Url(body)}`;
}

/** Reads a code (spaces and line breaks from copying are ignored); everything in it is validated. */
export async function decodeSaveCode(raw: string): Promise<DecodedSave | { error: DecodeError }> {
  const match = /^HJ([01])-([0-9a-z]{4})-([A-Za-z0-9_-]+)$/.exec(raw.replace(/\s+/g, ''));
  if (!match) return { error: 'format' };
  const [, kind, sum, body] = match as unknown as [string, string, string, string];
  if (kind === '1' && !canCompress()) return { error: 'unsupported' };
  let json: string;
  try {
    const bytes = fromBase64Url(body);
    json = new TextDecoder('utf-8', { fatal: true }).decode(kind === '1' ? await through(bytes, new DecompressionStream('deflate-raw')) : bytes);
  } catch {
    return { error: 'format' };
  }
  if (checksum(json) !== sum) return { error: 'checksum' };
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return { error: 'format' };
  }
  if (!payload || typeof payload !== 'object') return { error: 'format' };
  const { v, s, p, d } = payload as Partial<Payload>;
  if (v !== VERSION) return { error: 'version' };
  const solo: DecodedSave['solo'] = {};
  if (s && typeof s === 'object') {
    for (const [id, entry] of Object.entries(s)) {
      if (!mapIds().includes(id) || !Array.isArray(entry)) continue;
      const best = entry[0];
      solo[id] = {
        bestShots: typeof best === 'number' && Number.isInteger(best) && best >= 1 && best <= 3 ? best : null,
        hasStyle: entry[1] === 1,
      };
    }
  }
  const progress = { ...(p && typeof p === 'object' ? p : {}), ...unpackDaily(d) };
  return { solo, progress: sanitizeProgress(progress, mapIds(), cosmeticContext(mapIds(), solo)) };
}

const union = <T>(a: readonly T[], b: readonly T[]): T[] => [...new Set([...a, ...b])];

/**
 * This device's save with a code's contents added: the better best per garden, any trick badge,
 * the higher count, every map, unlock and tip from either, and every Daily day (the better result
 * where both played it). Selections (hat, outfit, cannon), settings and names stay this device's.
 */
export function mergeSave(target: SaveData, incoming: DecodedSave): SaveData {
  const solo: Record<string, LevelScore> = { ...target.solo };
  for (const [id, theirs] of Object.entries(incoming.solo)) {
    const mine = solo[id];
    if (!mine) {
      solo[id] = { bestShots: theirs.bestShots, hasStyle: theirs.hasStyle, lastAngle: 45, lastPower: 50 };
      continue;
    }
    const bests = [mine.bestShots, theirs.bestShots].filter((n): n is number => n !== null);
    solo[id] = { ...mine, bestShots: bests.length ? Math.min(...bests) : null, hasStyle: mine.hasStyle || theirs.hasStyle };
  }

  const a = target.progress ?? sanitizeProgress({}, mapIds());
  const b = incoming.progress;
  const daily = { ...a.daily };
  const dailyShots = { ...a.dailyShots };
  for (const [day, stars] of Object.entries(b.daily)) {
    if (!(day in daily) || stars > daily[day]!) {
      daily[day] = stars;
      if (b.dailyShots[day]) dailyShots[day] = b.dailyShots[day]!;
      else delete dailyShots[day];
    }
  }
  const merged: Progress = {
    ...a,
    totalHits: Math.max(a.totalHits, b.totalHits),
    hatHits: Math.max(a.hatHits, b.hatHits),
    trickHits: Math.max(a.trickHits, b.trickHits),
    currentStreak: Math.max(a.currentStreak, b.currentStreak),
    bestStreak: Math.max(a.bestStreak, b.bestStreak),
    trickStreak: Math.max(a.trickStreak, b.trickStreak),
    bestTrickStreak: Math.max(a.bestTrickStreak, b.bestTrickStreak),
    hitMaps: union(a.hitMaps, b.hitMaps),
    threeStarMaps: union(a.threeStarMaps, b.threeStarMaps),
    daily,
    dailyShots,
    earnedHats: HAT_ORDER.filter(id => a.earnedHats.includes(id) || b.earnedHats.includes(id)),
    earnedCannons: union(a.earnedCannons, b.earnedCannons),
    earnedOutfits: union(a.earnedOutfits, b.earnedOutfits),
    seenTips: union(a.seenTips, b.seenTips),
  };
  // Earned lists are a record, not a claim: re-sanitizing keeps them and records anything newly unlocked.
  return { ...target, solo, progress: sanitizeProgress(merged, mapIds(), cosmeticContext(mapIds(), solo)) };
}

/** Headline numbers for a save, to say what a code holds and what this device has after loading it. */
export function saveSummary(data: Pick<SaveData, 'solo' | 'progress'>): { stars: number; maxStars: number; hits: number } {
  const totals = campaignTotals(campaignStatus(mapIds(), data.solo));
  return { stars: totals.stars, maxStars: totals.maxStars, hits: data.progress?.totalHits ?? 0 };
}

/** This device's save code. */
export async function exportSaveCode(): Promise<string> {
  return encodeSaveCode(loadSaveData());
}

/** What a player reads when a code can't be loaded. */
export const SAVE_CODE_ERRORS: Record<DecodeError, string> = {
  format: "That doesn't look like a Hit Jonh save code. Copy all of it, from HJ to the end.",
  checksum: 'Part of that code is missing or mistyped. Copy it again.',
  version: 'That code comes from a newer Hit Jonh. Update this one first.',
  unsupported: "This browser can't read that code. Try updating it.",
};

/** Adds a code's progress to this device's save (see `mergeSave`) and says what it holds now. */
export async function importSaveCode(code: string): Promise<{ ok: true; stars: number; maxStars: number; hits: number } | { ok: false; message: string }> {
  const decoded = await decodeSaveCode(code);
  if ('error' in decoded) return { ok: false, message: SAVE_CODE_ERRORS[decoded.error] };
  const merged = mergeSave(loadSaveData(), decoded);
  writeSaveData(merged);
  return { ok: true, ...saveSummary(merged) };
}
