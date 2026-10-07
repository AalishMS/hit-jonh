/**
 * Sound for Hit Jonh. CC0 impact samples (Kenney, see CREDITS.md) are layered with synthesized
 * parts: every hit fires a low thump, a high crack and Jonh's yelp at the same AudioContext time.
 * Sounds are never time-stretched: hit-stop and slow motion affect visuals only.
 * Pitch is randomised per play with a cosmetic RNG; if a sample cannot be decoded (e.g. an older
 * browser without Ogg Vorbis), the synthesized layer still plays.
 */

import { loadSaveData, saveSettings } from '../storage/storage';
import type { HitQuality } from '../fx/impactProfile';
import { loopNotes, loopSeconds, midiToHz } from './music';

export const SAMPLE_NAMES = [
  'impactPunch_heavy_000', 'impactPunch_heavy_001', 'impactPunch_heavy_002', 'impactPunch_heavy_003',
  'impactWood_heavy_000', 'impactWood_heavy_001', 'impactPlank_medium_000', 'impactPlank_medium_001',
  'impactSoft_heavy_000', 'impactSoft_heavy_001', 'impactTin_medium_000', 'impactPlate_light_000',
  'impactBell_heavy_000', 'impactMining_000', 'impactGeneric_light_000',
] as const;
type SampleName = typeof SAMPLE_NAMES[number];

/** Raw sample bytes fetched at boot (decoding needs an AudioContext, created on first gesture). */
const rawSamples = new Map<SampleName, ArrayBuffer>();

export async function preloadSamples(baseUrl = './audio/'): Promise<void> {
  if (typeof fetch === 'undefined') return;
  await Promise.all(SAMPLE_NAMES.map(async name => {
    try {
      const response = await fetch(`${baseUrl}${name}.ogg`);
      if (response.ok) rawSamples.set(name, await response.arrayBuffer());
    } catch { /* synthesized layers still play */ }
  }));
}

export type SurfaceSound = 'ground' | 'wood' | 'concrete' | 'rubber' | 'body';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly buffers = new Map<SampleName, AudioBuffer>();
  private _isMuted = false;
  private _volume = 1.0;
  private _music = true;
  private isUnlocked = false;
  private reactionIndex = 0;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicLoopStart = 0;
  private musicNextIndex = 0;
  private readonly notes = loopNotes();
  private whoosh: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private analyser: AnalyserNode | null = null;
  private nextChirp = 0;

  constructor(private readonly rng: () => number = Math.random) {
    const settings = this.loadAudioSettings();
    this._isMuted = settings.muted;
    this._volume = settings.volume;
    this._music = settings.music;
  }

  get isMuted(): boolean { return this._isMuted; }
  get volume(): number { return this._volume; }
  get musicEnabled(): boolean { return this._music; }

  /** Creates/resumes the AudioContext on the first user gesture and decodes the samples. */
  unlock(): void {
    if (this.isUnlocked && this.ctx && this.ctx.state === 'running') return;
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.ctx) {
      this.ctx = new AudioContextClass();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 10;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._isMuted ? 0 : this._volume;
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this._music ? 0.16 : 0;
      this.sfxBus.connect(compressor);
      this.musicBus.connect(compressor);
      compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.masterGain.connect(this.analyser);
      this.noiseBuffer = this.makeNoise(1.5);
      this.decodeSamples();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.isUnlocked = true;
    this.startMusic();
  }

  private decodeSamples(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [name, raw] of rawSamples) {
      ctx.decodeAudioData(raw.slice(0)).then(buffer => this.buffers.set(name, buffer)).catch(() => { /* synth fallback */ });
    }
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1.0));
    this._volume = clamped;
    saveSettings({ volume: clamped });
    this.applyMaster();
  }

  setMuted(muted: boolean): void {
    this._isMuted = muted;
    saveSettings({ muted });
    this.applyMaster();
  }

  setMusicEnabled(enabled: boolean): void {
    this._music = enabled;
    saveSettings({ music: enabled });
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(enabled ? 0.16 : 0, this.ctx.currentTime, 0.1);
  }

  /** Lowers the music under pause and result screens. */
  duckMusic(ducked: boolean): void {
    if (this.musicBus && this.ctx && this._music) this.musicBus.gain.setTargetAtTime(ducked ? 0.06 : 0.16, this.ctx.currentTime, 0.15);
  }

  private applyMaster(): void {
    if (!this.masterGain || !this.ctx) return;
    const target = this._isMuted ? 0 : this._volume;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(target, now);
    this.masterGain.gain.value = target;
  }

  toggleMute(): boolean {
    this.unlock();
    this.setMuted(!this._isMuted);
    return this._isMuted;
  }

  private ready(): AudioContext | null {
    if (this._isMuted || !this.ctx || !this.sfxBus) return null;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** ±spread pitch variation from the cosmetic RNG. */
  private vary(spread = 0.08): number { return 1 + (this.rng() - 0.5) * 2 * spread; }
  private pick<T>(items: readonly T[]): T { return items[Math.floor(this.rng() * items.length) % items.length]!; }

  private sample(name: SampleName, gain: number, rate = 1, when = 0): boolean {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !buffer || !this.sfxBus) return false;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sfxBus);
    src.start(ctx.currentTime + when);
    return true;
  }

  /** Pitch-dropping sine: kicks and thumps. */
  private kick(start: number, from: number, to: number, duration: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(g).connect(this.sfxBus!);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noise(start: number, duration: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.002): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter).connect(g).connect(this.sfxBus!);
    src.start(start, this.rng() * 1);
    src.stop(start + duration + 0.02);
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = this.rng() * 2 - 1;
    return buffer;
  }

  /** Short sizzle while the cannon winds up. */
  playFuse(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.noise(ctx.currentTime, 0.13, 'highpass', 5200, 0.7, 0.12, 0.01);
  }

  /** Cannon: sub kick + body boom + bright crack, with a little air movement after. */
  playCannonFire(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const v = this.vary(0.06);
    this.kick(now, 140 * v, 38, 0.42, 0.95);
    this.noise(now, 0.38, 'lowpass', 700 * v, 0.8, 0.85);
    this.noise(now, 0.06, 'highpass', 2500, 0.6, 0.55);
    this.sample(this.pick(['impactPunch_heavy_000', 'impactPunch_heavy_002'] as const), 0.6, 0.62 * v);
    this.noise(now + 0.05, 0.5, 'bandpass', 900, 0.9, 0.12, 0.08);
  }

  /** Layered on the contact frame: thump + crack + yelp; intensity scales by hit quality. */
  playHit(quality: HitQuality): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const strong = quality === 'strong' || quality === 'trick';
    const v = this.vary(0.07);
    // Low thump: body of the hit.
    this.kick(now, (strong ? 120 : 150) * v, 42, strong ? 0.32 : 0.24, strong ? 1.0 : 0.75);
    const punched = this.sample(this.pick(['impactPunch_heavy_000', 'impactPunch_heavy_001', 'impactPunch_heavy_002', 'impactPunch_heavy_003'] as const),
      strong ? 1.0 : 0.75, (strong ? 0.82 : 1) * v);
    if (!punched) this.noise(now, 0.16, 'lowpass', 500, 0.7, 0.7);
    // High crack: the transient that sells contact.
    this.noise(now, strong ? 0.07 : 0.05, 'bandpass', 3800 * v, 1.2, strong ? 0.75 : 0.5, 0.001);
    this.sample(this.pick(['impactWood_heavy_000', 'impactWood_heavy_001'] as const), strong ? 0.55 : 0.35, 1.35 * v);
    // Jonh's yelp, same frame.
    this.playJonhReaction(strong ? 1 : 0.75);
    if (strong) this.slideWhistle(now + 0.06, 1500 * v, 380, 0.55, 0.08);
    if (quality === 'trick') this.sample('impactBell_heavy_000', 0.55, 1.25, 0.04);
  }

  /** Hat-only: a tinny plink and a rising "fwip". */
  playHatHit(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const v = this.vary(0.1);
    if (!this.sample('impactTin_medium_000', 0.7, 1.4 * v)) this.kick(ctx.currentTime, 1400 * v, 900, 0.12, 0.3);
    this.sample('impactPlate_light_000', 0.35, 1.6 * v);
    this.slideWhistle(ctx.currentTime + 0.02, 500 * v, 1700, 0.3, 0.06);
  }

  /** Legacy API: body thumps and surface impacts. */
  playImpact(type: 'body' | 'ground' | 'obstacle' = 'ground'): void {
    if (type === 'body') { this.playHit('strong'); return; }
    this.playSurface(type === 'obstacle' ? 'wood' : 'ground', 1);
  }

  /** Ball meets scenery. `strength` 0..1 from impact speed. */
  playSurface(surface: SurfaceSound, strength: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const s = Math.max(0.15, Math.min(1, strength));
    const v = this.vary(0.1);
    const now = ctx.currentTime;
    switch (surface) {
      case 'wood':
        if (!this.sample(this.pick(['impactPlank_medium_000', 'impactPlank_medium_001'] as const), 0.9 * s, v)) this.kick(now, 260 * v, 90, 0.15, 0.6 * s);
        this.kick(now, 120 * v, 50, 0.18, 0.5 * s);
        break;
      case 'concrete':
        if (!this.sample('impactMining_000', 0.85 * s, 0.9 * v)) this.noise(now, 0.12, 'bandpass', 1800, 1, 0.5 * s);
        this.kick(now, 110 * v, 45, 0.16, 0.45 * s);
        break;
      case 'rubber': {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140 * v, now);
        osc.frequency.exponentialRampToValueAtTime(420 * v, now + 0.09);
        osc.frequency.exponentialRampToValueAtTime(220 * v, now + 0.3);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.5 * s, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
        osc.connect(g).connect(this.sfxBus!);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }
      default:
        if (!this.sample(this.pick(['impactSoft_heavy_000', 'impactSoft_heavy_001'] as const), 0.9 * s, v)) this.kick(now, 90 * v, 30, 0.18, 0.6 * s);
        this.noise(now, 0.1, 'lowpass', 500, 0.7, 0.3 * s);
    }
  }

  /** Jonh's yelp: a formant voice sweeping "WAH-oof" with vibrato and breath. */
  playJonhReaction(intensity = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    const start = ctx.currentTime;
    const base = [215, 165, 260, 190][this.reactionIndex++ % 4]! * this.vary(0.08);
    const duration = 0.42 + this.rng() * 0.14;
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(base * 1.05, start);
    voice.frequency.exponentialRampToValueAtTime(base * 1.55, start + 0.05);
    voice.frequency.exponentialRampToValueAtTime(base * 0.62, start + duration);
    const vibrato = ctx.createOscillator();
    const vibratoGain = ctx.createGain();
    vibrato.frequency.value = 7.5;
    vibratoGain.gain.value = base * 0.04;
    vibrato.connect(vibratoGain).connect(voice.frequency);
    const formants: Array<[number, number, number]> = [[820, 340, 0.32], [1250, 880, 0.15], [2700, 2300, 0.05]];
    for (const [from, to, level] of formants) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 5;
      f.frequency.setValueAtTime(from, start);
      f.frequency.exponentialRampToValueAtTime(to, start + duration);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(level * intensity, start + 0.025);
      g.gain.setValueAtTime(level * intensity, start + duration * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      voice.connect(f).connect(g).connect(this.sfxBus!);
    }
    this.noise(start, 0.09, 'bandpass', 1600, 0.8, 0.12 * intensity);
    voice.start(start);
    vibrato.start(start);
    voice.stop(start + duration + 0.02);
    vibrato.stop(start + duration + 0.02);
  }

  private slideWhistle(start: number, from: number, to: number, duration: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    lfo.frequency.value = 9;
    lfoGain.gain.value = from * 0.02;
    lfo.connect(lfoGain).connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.03);
    g.gain.setValueAtTime(gain, start + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(g).connect(this.sfxBus!);
    osc.start(start);
    lfo.start(start);
    osc.stop(start + duration + 0.02);
    lfo.stop(start + duration + 0.02);
  }

  /** A voiced "FAAH" when the ball leaves the visible area. */
  playOutOfBounds(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const start = ctx.currentTime;
    this.noise(start, 0.13, 'highpass', 2200, 0.7, 0.18, 0.02);
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    const p = 205 * this.vary(0.06);
    voice.frequency.setValueAtTime(p, start + 0.08);
    voice.frequency.exponentialRampToValueAtTime(p * 1.15, start + 0.2);
    voice.frequency.exponentialRampToValueAtTime(70, start + 0.85);
    for (const [frequency, level] of [[760, 0.22], [1220, 0.1], [2600, 0.03]] as const) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = frequency;
      f.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start + 0.08);
      g.gain.exponentialRampToValueAtTime(level, start + 0.13);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.88);
      voice.connect(f).connect(g).connect(this.sfxBus!);
    }
    voice.start(start + 0.08);
    voice.stop(start + 0.9);
  }

  /** Air rushing past the ball: a looped band of noise that follows its speed (0..1). */
  setFlightWhoosh(speed01: number | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuffer) return;
    if (speed01 === null || this._isMuted) {
      if (this.whoosh) {
        const w = this.whoosh;
        w.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        w.src.stop(ctx.currentTime + 0.3);
        this.whoosh = null;
      }
      return;
    }
    if (!this.whoosh) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.4;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start();
      this.whoosh = { src, filter, gain };
    }
    const k = Math.max(0, Math.min(1, speed01));
    this.whoosh.filter.frequency.setTargetAtTime(500 + 1600 * k, ctx.currentTime, 0.05);
    this.whoosh.gain.gain.setTargetAtTime(0.09 * k * k, ctx.currentTime, 0.05);
  }

  /** Dev/test aid: peak absolute sample level at the master output right now (0..1+). */
  peakLevel(): number {
    if (!this.analyser) return 0;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    return peak;
  }

  get decodedSampleCount(): number { return this.buffers.size; }
  get contextState(): string { return this.ctx?.state ?? 'none'; }

  /** A garden bird: two quick chirps, quiet, on the music bus. */
  private chirp(start: number): void {
    const ctx = this.ctx!;
    const base = 2600 + this.rng() * 1400;
    for (let i = 0; i < 2 + Math.floor(this.rng() * 2); i++) {
      const t = start + i * 0.11;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(g).connect(this.musicBus!);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }

  /** Soft UI tick for buttons. */
  playClick(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.kick(ctx.currentTime, 900 * this.vary(0.05), 600, 0.05, 0.18);
  }

  /** Two-note sting for results; success rises, failure falls. */
  playSting(success: boolean): void {
    const ctx = this.ready();
    if (!ctx) return;
    const notes = success ? [72, 76, 79, 84] : [67, 63, 60];
    notes.forEach((n, i) => this.marimba(ctx.currentTime + i * 0.11, n, 0.35, this.sfxBus!));
  }

  private marimba(start: number, note: number, gain: number, bus: AudioNode): void {
    const ctx = this.ctx!;
    const hz = midiToHz(note);
    for (const [mult, level, decay] of [[1, 1, 0.5], [4, 0.25, 0.12], [10, 0.06, 0.04]] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz * mult;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain * level, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, start + decay);
      osc.connect(g).connect(bus);
      osc.start(start);
      osc.stop(start + decay + 0.02);
    }
  }

  private pluck(start: number, note: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToHz(note);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400, start);
    f.frequency.exponentialRampToValueAtTime(300, start + 0.25);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
    osc.connect(f).connect(g).connect(this.musicBus!);
    osc.start(start);
    osc.stop(start + 0.35);
  }

  private startMusic(): void {
    if (this.musicTimer || !this.ctx || typeof setInterval === 'undefined') return;
    this.musicLoopStart = this.ctx.currentTime + 0.2;
    this.musicNextIndex = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 50);
  }

  /** Look-ahead scheduler: queues notes up to 0.25 s ahead on the audio clock. */
  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || ctx.state !== 'running') return;
    const horizon = ctx.currentTime + 0.25;
    if (this._music && ctx.currentTime >= this.nextChirp) {
      if (this.nextChirp > 0) this.chirp(ctx.currentTime + 0.05);
      this.nextChirp = ctx.currentTime + 5 + this.rng() * 9;
    }
    const loop = loopSeconds();
    // Never try to catch up after a long stall (e.g. hidden tab).
    if (this.musicLoopStart + loop < ctx.currentTime - 1) { this.musicLoopStart = ctx.currentTime + 0.1; this.musicNextIndex = 0; }
    for (;;) {
      const note = this.notes[this.musicNextIndex];
      if (!note) { this.musicLoopStart += loop; this.musicNextIndex = 0; continue; }
      const time = this.musicLoopStart + note.time;
      if (time > horizon) break;
      if (time >= ctx.currentTime - 0.02 && this._music) {
        if (note.voice === 'marimba') this.marimba(time, note.note, 0.32, this.musicBus);
        else if (note.voice === 'bass') this.pluck(time, note.note, 0.55);
        else this.shaker(time);
      }
      this.musicNextIndex++;
    }
  }

  private shaker(start: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.09, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    src.connect(f).connect(g).connect(this.musicBus!);
    src.start(start, this.rng());
    src.stop(start + 0.06);
  }

  private loadAudioSettings(): { muted: boolean; volume: number; music: boolean } {
    try {
      const data = loadSaveData();
      return {
        muted: Boolean(data.settings.muted),
        volume: typeof data.settings.volume === 'number' ? data.settings.volume : 1.0,
        music: data.settings.music !== false,
      };
    } catch {
      return { muted: false, volume: 1.0, music: true };
    }
  }

  destroy(): void {
    this.setFlightWhoosh(null);
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.sfxBus = null;
      this.musicBus = null;
    }
  }
}
