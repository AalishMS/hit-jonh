// Dev-only sound level report (audio-levels.html). Renders each cue through an OfflineAudioContext,
// measures it and prints a table; `window.__AUDIO_LEVELS__` resolves to the raw numbers for scripts.
import { AudioManager, preloadSamples, SAMPLE_NAMES } from '../audio/audioManager';
import { activeRmsDb, maxWindowLufs, peakDb } from '../audio/loudness';
import { AUDIO, CUE_NAMES, type CueName } from '../config/tuning';

const RATE = 48000;

type Play = (audio: AudioManager, at: (seconds: number, fn: () => void) => void) => void;
interface Case {
  id: string;
  /** The cue this case represents (others are silenced while measuring); null = a mix of everything. */
  cue: CueName | 'wind' | 'music' | null;
  seconds: number;
  play: Play;
}

const ALL: Case[] = [
  { id: 'cannon (power 0.25)', cue: 'cannon', seconds: 1.4, play: a => a.playCannonFire(0.25) },
  { id: 'cannon (power 1)', cue: 'cannon', seconds: 1.4, play: a => a.playCannonFire(1) },
  { id: 'fuse', cue: 'fuse', seconds: 0.5, play: a => a.playFuse() },
  { id: 'hit (weak)', cue: 'hit', seconds: 1.2, play: a => a.playHit('weak') },
  { id: 'hit (strong)', cue: 'hit', seconds: 1.2, play: a => a.playHit('strong') },
  { id: 'hit (trick)', cue: 'hit', seconds: 1.2, play: a => a.playHit('trick') },
  { id: 'hat hit', cue: 'hat', seconds: 0.8, play: a => a.playHatHit() },
  { id: 'surface: wood', cue: 'surface', seconds: 0.8, play: a => a.playSurface('wood', 1) },
  { id: 'surface: concrete', cue: 'surface', seconds: 0.8, play: a => a.playSurface('concrete', 1) },
  { id: 'surface: ground', cue: 'surface', seconds: 0.8, play: a => a.playSurface('ground', 1) },
  { id: 'surface: rubber', cue: 'surface', seconds: 0.8, play: a => a.playSurface('rubber', 1) },
  { id: 'surface: glass (held)', cue: 'surface', seconds: 0.8, play: a => a.playSurface('glass', 1) },
  { id: 'surface: ice', cue: 'surface', seconds: 0.8, play: a => a.playSurface('ice', 1) },
  { id: 'ice skid (full speed)', cue: 'surface', seconds: 2.0, play: a => a.setSkid(1) },
  { id: 'glass break', cue: 'glass', seconds: 1.0, play: a => a.playGlassBreak(1) },
  { id: 'portal', cue: 'portal', seconds: 0.9, play: a => a.playPortal() },
  { id: "Jonh's yelp", cue: 'jonhVoice', seconds: 1.0, play: a => a.playJonhReaction(1) },
  { id: 'Jonh mutter', cue: 'mutter', seconds: 1.0, play: a => a.playMutter(30) },
  { id: 'FAAH (out of bounds)', cue: 'outOfBounds', seconds: 1.2, play: a => a.playOutOfBounds() },
  { id: 'drumroll (1.1 s)', cue: 'drumroll', seconds: 2.0, play: a => a.playDrumroll(1.1) },
  { id: 'sting (success)', cue: 'sting', seconds: 1.2, play: a => a.playSting(true) },
  { id: 'sting (failure)', cue: 'sting', seconds: 1.2, play: a => a.playSting(false) },
  { id: 'flight whoosh (full speed)', cue: 'whoosh', seconds: 2.0, play: a => a.setFlightWhoosh(1) },
  { id: 'UI click', cue: 'click', seconds: 0.3, play: a => a.playClick() },
  { id: 'emote (incoming)', cue: 'emoteIn', seconds: 0.6, play: a => a.playEmote(false) },
  { id: 'emote (mine)', cue: 'emoteOut', seconds: 0.6, play: a => a.playEmote(true) },
  { id: 'footstep (left)', cue: 'footstep', seconds: 0.4, play: a => a.playFootstep(0) },
  { id: 'footstep (right)', cue: 'footstep', seconds: 0.4, play: a => a.playFootstep(1) },
  { id: 'wind bed (full, 5 m/s²)', cue: 'wind', seconds: 10, play: a => a.windForReport(-5, 10) },
  { id: 'wind bed (Washday, 3 m/s²)', cue: null, seconds: 10, play: a => a.windForReport(-3, 10) },
  { id: 'wind bed (breeze, 1 m/s²)', cue: null, seconds: 10, play: a => a.windForReport(-1, 10) },
  { id: 'music loop (first 8 s)', cue: 'music', seconds: 8, play: a => a.scheduleMusicForReport(8) },
  // Events as played: every layer of one in-game moment together (hit = thump + crack + yelp + extras).
  { id: 'EVENT hit (weak), as played', cue: null, seconds: 1.2, play: a => a.playHit('weak') },
  { id: 'EVENT hit (strong), as played', cue: null, seconds: 1.2, play: a => a.playHit('strong') },
  { id: 'EVENT hit (trick), as played', cue: null, seconds: 1.2, play: a => a.playHit('trick') },
  // Mixes (everything audible together, as in play).
  { id: 'MIX shot: drumroll → trick hit + sting, wind, music', cue: null, seconds: 4, play: (a, at) => {
    a.windForReport(-5, 4);
    a.scheduleMusicForReport(4);
    a.playDrumroll(1.1);
    at(1.1, () => { a.playHit('trick'); a.playSurface('concrete', 1); });
    at(1.25, () => a.playSting(true));
  } },
  { id: 'MIX cannon + whoosh + wind + music', cue: null, seconds: 3, play: (a, at) => {
    a.windForReport(-5, 3);
    a.scheduleMusicForReport(3);
    a.playCannonFire(1);
    at(0.15, () => a.setFlightWhoosh(1));
    at(0.5, () => a.playSurface('wood', 1));
  } },
  { id: 'MIX pond: landing on ice → skid → hit', cue: null, seconds: 3, play: (a, at) => {
    a.scheduleMusicForReport(3);
    a.setFlightWhoosh(0.5);
    at(0.4, () => { a.playSurface('ice', 0.6); a.setFlightWhoosh(0.4); a.setSkid(0.9); });
    at(0.9, () => a.setSkid(0.6));
    at(1.4, () => { a.setSkid(null); a.setFlightWhoosh(null); a.playHit('weak'); });
  } },
  { id: 'MIX stroll: steps + mutter + emote + music', cue: null, seconds: 4, play: (a, at) => {
    a.scheduleMusicForReport(4);
    for (let i = 0; i < 6; i++) at(0.3 + i * 0.55, () => a.playFootstep((i % 2) as 0 | 1));
    at(0.5, () => a.playMutter(30));
    at(1.5, () => a.playEmote(false));
  } },
  { id: 'MIX emote burst (6 incoming in 0.3 s, gated)', cue: null, seconds: 2, play: (a, at) => {
    for (let i = 0; i < 6; i++) at(i * 0.06, () => a.playEmote(false));
  } },
];

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
