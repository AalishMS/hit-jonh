/**
 * Loudness maths for the sound level pass (pure, no WebAudio): dB conversion, peak, RMS and ITU-R
 * BS.1770 K-weighted loudness, used by `src/dev/audioLevelsPage.ts` to measure every cue rendered
 * through an OfflineAudioContext. Also the soft-clip curve that keeps stacked cues under full scale.
 */

export const dbToGain = (db: number): number => 10 ** (db / 20);
export const gainToDb = (gain: number): number => (gain > 1e-9 ? 20 * Math.log10(gain) : -180);

export function peak(samples: Float32Array): number {
  let p = 0;
  for (const v of samples) { const a = Math.abs(v); if (a > p) p = a; }
  return p;
}

export const peakDb = (samples: Float32Array): number => gainToDb(peak(samples));

/** RMS in dBFS over the stretch of the signal that is audible (first to last sample above `floorDb`). */
export function activeRmsDb(samples: Float32Array, floorDb = -60): number {
  const floor = dbToGain(floorDb);
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]!) >= floor) { if (first < 0) first = i; last = i; }
  }
  if (first < 0) return -180;
  let sum = 0;
  for (let i = first; i <= last; i++) sum += samples[i]! * samples[i]!;
  return gainToDb(Math.sqrt(sum / (last - first + 1)));
}

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

/** The two BS.1770 pre-filters (shelf and RLB high-pass) for any sample rate. */
export function kWeightingFilters(sampleRate: number): [Biquad, Biquad] {
  const shelfF = 1681.974450955533;
  const shelfG = 3.999843853973347;
  const shelfQ = 0.7071752369554196;
  let k = Math.tan((Math.PI * shelfF) / sampleRate);
  const vh = 10 ** (shelfG / 20);
  const vb = vh ** 0.4996667741545416;
  let a0 = 1 + k / shelfQ + k * k;
  const shelf: Biquad = {
    b0: (vh + (vb * k) / shelfQ + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / shelfQ + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / shelfQ + k * k) / a0,
  };
  const hpF = 38.13547087602444;
  const hpQ = 0.5003270373238773;
  k = Math.tan((Math.PI * hpF) / sampleRate);
  a0 = 1 + k / hpQ + k * k;
  const highpass: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / hpQ + k * k) / a0 };
  return [shelf, highpass];
}

function runBiquad(input: Float32Array, f: Biquad): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i]!;
    const y = f.b0 * x + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * Highest K-weighted loudness (LUFS, mono) over sliding windows of `windowSeconds`
 * (400 ms is BS.1770 "momentary"; 200 ms is the "short event" figure the tiers use), hop 50 ms.
 * A signal shorter than the window is measured as if padded with silence, the way a short cue is heard.
 */
export function maxWindowLufs(samples: Float32Array, sampleRate: number, windowSeconds: number): number {
  const [shelf, highpass] = kWeightingFilters(sampleRate);
  const weighted = runBiquad(runBiquad(samples, shelf), highpass);
  const window = Math.max(1, Math.round(windowSeconds * sampleRate));
  const hop = Math.max(1, Math.round(0.05 * sampleRate));
  const squares = new Float64Array(weighted.length + 1);
  for (let i = 0; i < weighted.length; i++) squares[i + 1] = squares[i]! + weighted[i]! * weighted[i]!;
  let best = -Infinity;
  const lastStart = Math.max(0, weighted.length - 1);
  for (let start = 0; start <= lastStart; start += hop) {
    const end = Math.min(weighted.length, start + window);
    const meanSquare = (squares[end]! - squares[start]!) / window;
    if (meanSquare > best) best = meanSquare;
  }
  return best > 0 ? -0.691 + 10 * Math.log10(best) : -180;
}

/**
 * Transfer curve for a WaveShaper: unchanged up to `knee`, then bends smoothly towards `ceiling` and
 * never passes it. Odd-symmetric; `size` points over −1..1 (the shaper clamps beyond that to the ends).
 */
export function softClipCurve(size: number, knee: number, ceiling: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  const room = ceiling - knee;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}
