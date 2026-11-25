import { describe, expect, it } from 'vitest';
import { AUDIO, CUE_NAMES } from '../src/config/tuning';
import { activeRmsDb, dbToGain, gainToDb, maxWindowLufs, peakDb, softClipCurve } from '../src/audio/loudness';

const RATE = 48000;
const sine = (hz: number, amplitude: number, seconds: number): Float32Array =>
  Float32Array.from({ length: Math.round(RATE * seconds) }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / RATE));

describe('loudness meter', () => {
  it('converts between dB and gain', () => {
    expect(dbToGain(-6.0206)).toBeCloseTo(0.5, 3);
    expect(gainToDb(dbToGain(-13.7))).toBeCloseTo(-13.7, 6);
    expect(gainToDb(0)).toBeLessThan(-100);
  });

  it('measures peak and RMS of a sine', () => {
    const s = sine(440, 0.5, 1);
    expect(peakDb(s)).toBeCloseTo(-6.02, 1);
    expect(activeRmsDb(s)).toBeCloseTo(-9.03, 1); // amplitude / √2
  });

  it('reads a full-scale 1 kHz sine as −3 LUFS (BS.1770 reference) and tracks level changes one for one', () => {
    expect(maxWindowLufs(sine(997, 1, 2), RATE, 0.4)).toBeCloseTo(-3.01, 1);
    expect(maxWindowLufs(sine(997, 0.5, 2), RATE, 0.4)).toBeCloseTo(-9.03, 1);
  });

  it('K-weighting removes rumble and lifts the highs', () => {
    const mid = maxWindowLufs(sine(1000, 0.3, 1), RATE, 0.4);
    expect(maxWindowLufs(sine(30, 0.3, 1), RATE, 0.4)).toBeLessThan(mid - 6);
    expect(maxWindowLufs(sine(8000, 0.3, 1), RATE, 0.4)).toBeGreaterThan(mid + 2);
  });

  it('a short burst measures quieter than the same burst sustained, and silence is −∞', () => {
    const burst = sine(1000, 0.5, 0.05);
    const padded = new Float32Array(RATE);
    padded.set(burst);
    expect(maxWindowLufs(padded, RATE, 0.2)).toBeLessThan(maxWindowLufs(sine(1000, 0.5, 1), RATE, 0.2) - 4);
    expect(maxWindowLufs(new Float32Array(RATE), RATE, 0.4)).toBeLessThan(-100);
    expect(activeRmsDb(new Float32Array(100))).toBeLessThan(-100);
  });
});

describe('soft clip curve', () => {
  const { kneeLevel, ceilingLevel } = AUDIO.softClip;
  const curve = softClipCurve(2049, kneeLevel, ceilingLevel);

  it('is unchanged below the knee, bounded by the ceiling, odd and monotonic', () => {
    const at = (x: number) => curve[Math.round(((x + 1) / 2) * 2048)]!;
    expect(at(0.5)).toBeCloseTo(0.5, 3);
    expect(at(-0.7)).toBeCloseTo(-0.7, 3);
    expect(Math.max(...curve)).toBeLessThanOrEqual(ceilingLevel);
    expect(Math.min(...curve)).toBeGreaterThanOrEqual(-ceilingLevel);
    expect(at(1)).toBeGreaterThan(0.9);
    for (let i = 1; i < curve.length; i++) expect(curve[i]!).toBeGreaterThanOrEqual(curve[i - 1]!);
    for (let i = 0; i < curve.length; i++) expect(curve[i]!).toBeCloseTo(-curve[curve.length - 1 - i]!, 6);
  });
});

describe('level tiers [TUNE]', () => {
  it('every cue has exactly one tier and one trim, and tiers step down in loudness', () => {
    for (const cue of CUE_NAMES) {
      expect(AUDIO.tiers.filter(t => t.cues.includes(cue)), cue).toHaveLength(1);
      expect(Number.isFinite(AUDIO.cueTrimDb[cue]), cue).toBe(true);
    }
    for (let i = 1; i < AUDIO.tiers.length; i++) {
      expect(AUDIO.tiers[i]!.targetLufs).toBeLessThan(AUDIO.tiers[i - 1]!.targetLufs);
    }
    for (const t of AUDIO.tiers) expect(t.maxPeakDb).toBeLessThanOrEqual(-3); // headroom for stacked cues
    expect(AUDIO.tiers[AUDIO.tiers.length - 1]!.maxPeakDb).toBeLessThanOrEqual(-15);
  });

  it('keeps the quiet things quiet: UI, steps, wind and the incoming pop are well under the impacts', () => {
    const tier = (cue: (typeof CUE_NAMES)[number]) => AUDIO.tiers.find(t => t.cues.includes(cue))!;
    expect(tier('cannon').name).toBe('impact');
    expect(tier('hit').name).toBe('impact');
    for (const cue of ['click', 'footstep', 'emoteOut'] as const) {
      expect(tier(cue).targetLufs).toBeLessThanOrEqual(tier('hit').targetLufs - 12);
    }
    expect(AUDIO.bedTargetLufs.wind).toBeLessThan(tier('hit').targetLufs - 12);
    expect(tier('emoteOut').targetLufs).toBeLessThan(tier('emoteIn').targetLufs);
  });
});
