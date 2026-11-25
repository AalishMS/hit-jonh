// Dev-only sound level report (audio-levels.html). Renders each cue through an OfflineAudioContext,
// measures it and prints a table; `window.__AUDIO_LEVELS__` resolves to the raw numbers for scripts.
import { AudioManager, preloadSamples, SAMPLE_NAMES } from '../audio/audioManager';
import { activeRmsDb, maxWindowLufs, peakDb } from '../audio/loudness';
import { AUDIO, CUE_NAMES, type CueName } from '../config/tuning';
import { ALL, type Case } from './audioCases';

const RATE = 48000;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function render(c: Case, softClip: boolean): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(c.seconds * RATE), RATE);
  const audio = new AudioManager(mulberry32(7));
  audio.attachContext(ctx, { softClip });
  const wanted = SAMPLE_NAMES.length;
  for (let i = 0; i < 200 && audio.decodedSampleCount < wanted; i++) await new Promise(r => setTimeout(r, 25));
  if (c.cue !== null && c.cue !== 'wind' && c.cue !== 'music') {
    for (const name of CUE_NAMES) if (name !== c.cue) audio.setCueTrimDb(name, -120);
  }
  const timed: Array<[number, () => void]> = [];
  c.play(audio, (t, fn) => timed.push([t, fn]));
  // OfflineAudioContext can pause at quantised times, so later cues see the right currentTime (and gates).
  for (const [t, fn] of timed) {
    void ctx.suspend(Math.round(t * RATE / 128) * 128 / RATE).then(() => { fn(); void ctx.resume(); });
  }
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0);
}

interface Row {
  id: string; cue: string | null; rawPeakDb: number; peakDb: number; rmsDb: number; momentaryLufs: number; l200: number;
}

const fmt = (n: number, width = 7) => (n <= -100 ? '  -inf' : n.toFixed(1)).padStart(width);

async function main(): Promise<void> {
  await preloadSamples(`${import.meta.env.BASE_URL}audio/`);
  const probe = new AudioManager();
  const warning = probe.isMuted || !probe.musicEnabled || probe.volume !== 1
    ? 'WARNING: saved settings are muted / music off / volume ≠ 1, but the report always renders at volume 1 with the music toggle on.\n' : '';
  const rows: Row[] = [];
  for (const c of ALL) {
    const raw = await render(c, false);
    const clipped = await render(c, true);
    rows.push({
      id: c.id, cue: c.cue, rawPeakDb: peakDb(raw), peakDb: peakDb(clipped), rmsDb: activeRmsDb(clipped),
      momentaryLufs: maxWindowLufs(clipped, RATE, 0.4), l200: maxWindowLufs(clipped, RATE, 0.2),
    });
  }
  const lines = [warning + 'case'.padEnd(52) + 'raw pk  clip pk   RMS   LUFS-M  L200   tier'];
  const tierOf = (cue: string | null): string =>
    cue === 'wind' || cue === 'music' ? 'bed' : AUDIO.tiers.find(t => t.cues.includes(cue as CueName))?.name ?? '';
  for (const r of rows) {
    lines.push(`${r.id.padEnd(52)}${fmt(r.rawPeakDb)}${fmt(r.peakDb, 9)}${fmt(r.rmsDb)}${fmt(r.momentaryLufs, 8)}${fmt(r.l200)}   ${tierOf(r.cue)}`);
  }
  // Per-cue loudest variant versus its tier: the trim that meets the loudness target and the peak ceiling.
  lines.push('', 'cue (loudest variant)'.padEnd(24) + ' L200    peak   target  ceiling  trim now   needed  status');
  const verdict: Array<{ cue: string; needed: number; ok: boolean }> = [];
  for (const name of [...CUE_NAMES, 'wind', 'music'] as const) {
    const mine = rows.filter(r => r.cue === name);
    if (mine.length === 0) continue;
    const loudness = Math.max(...mine.map(r => r.l200));
    const top = Math.max(...mine.map(r => r.peakDb));
    const bed = name === 'wind' || name === 'music';
    const tier = bed ? undefined : AUDIO.tiers.find(t => t.cues.includes(name));
    const target = bed ? AUDIO.bedTargetLufs[name] : tier?.targetLufs ?? NaN;
    const ceiling = tier?.maxPeakDb ?? Infinity;
    const now = bed ? 0 : AUDIO.cueTrimDb[name as CueName];
    // Change in dB still needed from the current trim.
    const needed = Math.min(target - loudness, ceiling - top);
    const ok = Math.abs(needed) <= 1;
    verdict.push({ cue: name, needed, ok });
    lines.push(`${name.padEnd(24)}${fmt(loudness)}${fmt(top)}${fmt(target)}${fmt(ceiling === Infinity ? NaN : ceiling, 9)}${fmt(now, 10)}${fmt(needed, 9)}  ${ok ? 'ok' : 'ADJUST'}`);
  }
  const out = document.getElementById('out');
  if (out) out.textContent = lines.join('\n');
  (window as unknown as { __AUDIO_LEVELS_DONE__: unknown }).__AUDIO_LEVELS_DONE__ = { rows, verdict, text: lines.join('\n') };
}

void main();
