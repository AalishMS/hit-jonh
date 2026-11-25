/**
 * Sound for Hit Jonh. CC0 impact samples (Kenney, see CREDITS.md) are layered with synthesized
 * parts: every hit fires a low thump, a high crack and Jonh's yelp at the same AudioContext time.
 * Sounds are never time-stretched: hit-stop and slow motion affect visuals only.
 * Pitch is randomised per play with a cosmetic RNG; if a sample cannot be decoded (e.g. an older
 * browser without Ogg Vorbis), the synthesized layer still plays.
 *
 * Levels: every cue plays through its own trim bus (`AUDIO.cueTrimDb`, tiers in `AUDIO.tiers`), then one
 * shared compressor, a soft clip that keeps stacked cues under full scale, and the master volume.
 * Music and the garden wind bed sit on their own buses (the music toggle and ducking govern both).
 */

import { AUDIO, CUE_NAMES, type CueName } from '../config/tuning';
import { loadSaveData, saveSettings } from '../storage/storage';
import type { HitQuality } from '../fx/impactProfile';
import { CueGate } from './cueGate';
import { dbToGain, softClipCurve } from './loudness';
import { loopNotes, loopSeconds, midiToHz, type ScheduledNote } from './music';
import { gustLevelAt, gustPlan, windBedFilters, windBedLevel } from './windSound';

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

export type SurfaceSound = 'ground' | 'wood' | 'concrete' | 'rubber' | 'glass' | 'ice' | 'body';

/** The garden wind bed's nodes while it plays (see `setWindBed`). */
interface WindBed {
  accel: number;
  sources: AudioScheduledSourceNode[];
  air: BiquadFilterNode;
  bed: GainNode;
  gust: GainNode;
  /** The bed stops when the scene has not refreshed it by this audio time. */
  freshUntil: number;
  gustIndex: number;
  nextGustAt: number;
  /** Audio time the bed began: gusts are laid out from here. */
  startedAt: number;
}

type AnyContext = AudioContext | OfflineAudioContext;

export class AudioManager {
  private ctx: AnyContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private ambienceDuck: GainNode | null = null;
  /** One trim bus per cue (see `AUDIO.cueTrimDb`); all feed `sfxBus`. */
  private readonly cueBuses = new Map<CueName, GainNode>();
  /** The cue bus the synth primitives write to; set by `route()` at the start of each cue. */
  private dest: AudioNode | null = null;
  private readonly gates = {
    emoteIn: new CueGate(AUDIO.limits.emoteIn),
    emoteOut: new CueGate(AUDIO.limits.emoteOut),
    footstep: new CueGate(AUDIO.limits.footstep),
  };
  private wind: WindBed | null = null;
  private windBuffer: AudioBuffer | null = null;
  /** The tab is hidden: the context is suspended and nothing new is voiced. */
  private hiddenTab = false;
  private offline = false;
  private softClip = true;
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
  /** Skate ramp: the plywood rumble of a ball rolling along it (on the `surface` cue bus). */
  private rumble: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private hum: { oscs: OscillatorNode[]; gain: GainNode } | null = null;
  /** Ice: the scrape of a skidding ball (Frozen Pond), on the surface bus. */
  private skid: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private analyser: AnalyserNode | null = null;
  private clipTap: MediaStreamAudioDestinationNode | null = null;
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
      this.buildGraph(new AudioContextClass());
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
      this.hiddenTab = typeof document !== 'undefined' && document.hidden;
    }
    const ctx = this.ctx as AudioContext | null;
    if (ctx && ctx.state === 'suspended' && !this.hiddenTab) void ctx.resume().catch(() => { /* retried on the next gesture */ });
    this.isUnlocked = true;
    this.startMusic();
  }

  /**
   * Level report / tests: use `ctx` (an OfflineAudioContext) instead of a real one. Nothing is
   * unlocked, no music timer starts, and `softClip: false` exposes the raw peak before the safety clip.
   */
  attachContext(ctx: OfflineAudioContext, options: { softClip?: boolean } = {}): void {
    this.offline = true;
    this.softClip = options.softClip !== false;
    this.isUnlocked = true;
    this.buildGraph(ctx);
  }

  private buildGraph(ctx: AnyContext): void {
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this._isMuted ? 0 : this._volume;
    this.sfxBus = ctx.createGain();
    for (const name of CUE_NAMES) {
      const bus = ctx.createGain();
      bus.gain.value = dbToGain(AUDIO.cueTrimDb[name]);
      bus.connect(this.sfxBus);
      this.cueBuses.set(name, bus);
    }
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this._music ? AUDIO.musicGain : 0;
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = this._music ? AUDIO.musicGain * AUDIO.ambienceGain : 0;
    this.ambienceDuck = ctx.createGain();
    this.ambienceDuck.connect(this.ambienceBus);
    this.sfxBus.connect(compressor);
    this.musicBus.connect(compressor);
    this.ambienceBus.connect(compressor);
    // A soft clip after the compressor: stacked cues bend towards full scale instead of hard-clipping.
    let tail: AudioNode = compressor;
    if (this.softClip) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = softClipCurve(2049, AUDIO.softClip.kneeLevel, AUDIO.softClip.ceilingLevel);
      shaper.oversample = '2x';
      compressor.connect(shaper);
      tail = shaper;
    }
    tail.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.masterGain.connect(this.analyser);
    this.noiseBuffer = this.makeNoise(1.5);
    this.decodeSamples();
  }

  /** The tab went to the background: stop everything (music, wind, tails) until it is back. */
  private readonly onVisibility = (): void => {
    const ctx = this.ctx;
    if (!ctx || this.offline) return;
    this.hiddenTab = document.hidden;
    if (this.hiddenTab) {
      this.stopWind(true);
      void (ctx as AudioContext).suspend().catch(() => { /* already closed */ });
    } else if (this.isUnlocked) {
      void (ctx as AudioContext).resume().catch(() => { /* needs a gesture first */ });
    }
  };

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

  /** `persist: false` (the listening page) changes this session only, not the saved setting. */
  setMusicEnabled(enabled: boolean, persist = true): void {
    this._music = enabled;
    if (persist) saveSettings({ music: enabled });
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(enabled ? AUDIO.musicGain : 0, this.ctx.currentTime, 0.1);
    if (this.ambienceBus && this.ctx) this.ambienceBus.gain.setTargetAtTime(enabled ? AUDIO.musicGain * AUDIO.ambienceGain : 0, this.ctx.currentTime, 0.1);
    if (!enabled) this.stopWind();
  }

  /** Lowers the music under pause and result screens. */
  duckMusic(ducked: boolean): void {
    if (!this.ctx || !this._music) return;
    const level = ducked ? AUDIO.musicDuckedGain : AUDIO.musicGain;
    this.musicBus?.gain.setTargetAtTime(level, this.ctx.currentTime, 0.15);
    this.ambienceBus?.gain.setTargetAtTime(level * AUDIO.ambienceGain, this.ctx.currentTime, 0.15);
  }

  private applyMaster(): void {
    if (!this.masterGain || !this.ctx) return;
    const target = this._isMuted ? 0 : this._volume;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(target, now);
    this.masterGain.gain.value = target;
  }

  /** True when any sound is switched off: the in-game button and the menu both show this. */
  get isSilenced(): boolean { return this._isMuted || !this._music; }

  /** The in-game mute button controls all sound: effects and music switch together. */
  toggleMute(): boolean {
    this.unlock();
    const silence = !this.isSilenced;
    this.setMuted(silence);
    this.setMusicEnabled(!silence);
    return silence;
  }

  private ready(): AnyContext | null {
    if (this._isMuted || this.hiddenTab || !this.ctx || !this.sfxBus) return null;
    if (this.ctx.state === 'suspended' && !this.offline) void (this.ctx as AudioContext).resume().catch(() => { /* needs a gesture first */ });
    return this.ctx;
  }

  /** Points the synth primitives at a cue's trim bus; each public cue calls this first. */
  private route(name: CueName): void { this.dest = this.cueBuses.get(name) ?? this.sfxBus; }
  private out(): AudioNode { return this.dest ?? this.sfxBus!; }

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
    src.connect(g).connect(this.out());
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
    osc.connect(g).connect(this.out());
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
    src.connect(filter).connect(g).connect(this.out());
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
    this.route('fuse');
    this.noise(ctx.currentTime, 0.13, 'highpass', 5200, 0.7, 0.12, 0.01);
  }

  /**
   * Cannon: sub kick + body boom + bright crack, with a little air movement after. `power` (0..1)
   * shapes it: a short, higher "pop" at low power; a deeper, longer boom with a rumbling tail at full.
   */
  playCannonFire(power = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.route('cannon');
    this.duckAmbience();
    const p = Math.max(0, Math.min(1, power));
    const now = ctx.currentTime;
    const v = this.vary(0.06);
    const weight = 0.55 + 0.45 * p;
    this.kick(now, (190 - 60 * p) * v, 38 + 14 * (1 - p), 0.26 + 0.2 * p, 0.95 * weight);
    this.noise(now, 0.22 + 0.24 * p, 'lowpass', (900 - 260 * p) * v, 0.8, 0.85 * weight);
    this.noise(now, 0.05 + 0.02 * p, 'highpass', 2200 + 900 * p, 0.6, 0.4 + 0.2 * p);
    this.sample(this.pick(['impactPunch_heavy_000', 'impactPunch_heavy_002'] as const), 0.6 * weight, (0.78 - 0.2 * p) * v);
    this.noise(now + 0.05, 0.3 + 0.35 * p, 'bandpass', 900, 0.9, 0.12 * weight, 0.08);
    // Full power: a low rolling rumble after the bang.
    if (p > 0.7) this.kick(now + 0.06, 70 * v, 30, 0.5, 0.35 * (p - 0.7) / 0.3);
  }

  /** Layered on the contact frame: thump + crack + yelp; intensity scales by hit quality. */
  playHit(quality: HitQuality): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.route('hit');
    this.duckAmbience();
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
    this.route('hit');
    if (strong) this.slideWhistle(now + 0.06, 1500 * v, 380, 0.55, 0.08);
    if (quality === 'trick') this.sample('impactBell_heavy_000', 0.55, 1.25, 0.04);
  }

  /** Hat-only: a tinny plink and a rising "fwip". */
  playHatHit(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.route('hat');
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
    this.route('surface');
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
      case 'glass':
        // Unbroken glass: a bright "tink" (the pane held).
        this.tinkle(now, 2900 * v, 0.28 * s, 0.18);
        this.tinkle(now + 0.012, 4300 * v, 0.14 * s, 0.12);
        this.kick(now, 240 * v, 120, 0.06, 0.25 * s);
        break;
      case 'ice':
        // Iron on ice: a hard, bright knock with a glassy ring and a short crackle.
        this.kick(now, 380 * v, 150, 0.07, 0.6 * s);
        this.tinkle(now, 3100 * v, 0.18 * s, 0.16);
        this.noise(now, 0.07, 'highpass', 3600 * v, 0.8, 0.3 * s);
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
        osc.connect(g).connect(this.out());
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }
      default:
        if (!this.sample(this.pick(['impactSoft_heavy_000', 'impactSoft_heavy_001'] as const), 0.9 * s, v)) this.kick(now, 90 * v, 30, 0.18, 0.6 * s);
        this.noise(now, 0.1, 'lowpass', 500, 0.7, 0.3 * s);
    }
  }

  /** One short glassy ping (triangle wave, fast decay). */
  private tinkle(start: number, freq: number, gain: number, duration = 0.12): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(g).connect(this.out());
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** A pane smashed: a bright crash, a scatter of falling tinkles and a dull knock. `strength` 0..1. */
  playGlassBreak(strength: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.route('glass');
    const s = Math.max(0.35, Math.min(1, strength));
    const now = ctx.currentTime;
    const v = this.vary(0.08);
    this.noise(now, 0.24, 'highpass', 4200 * v, 0.7, 0.6 * s, 0.001);
    this.noise(now, 0.08, 'bandpass', 2400 * v, 1.3, 0.5 * s, 0.001);
    this.kick(now, 190 * v, 70, 0.12, 0.35 * s);
    this.sample('impactPlate_light_000', 0.45 * s, 1.9 * v);
    for (let i = 0; i < 7; i++) {
      this.tinkle(now + 0.035 + i * 0.04 + this.rng() * 0.025, (2200 + this.rng() * 3600) * v, (0.16 - i * 0.015) * s);
    }
  }

  /** A magic hoop: a breathy "fwoop" (noise sweeping down) and a bright glide up as the ball pops out. */
  playPortal(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.route('portal');
    const now = ctx.currentTime;
    const v = this.vary(0.06);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.2;
    filter.frequency.setValueAtTime(2600 * v, now);
    filter.frequency.exponentialRampToValueAtTime(380 * v, now + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.42, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    src.connect(filter).connect(g).connect(this.out());
    src.start(now, this.rng());
    src.stop(now + 0.3);
    this.slideWhistle(now + 0.16, 420 * v, 1500 * v, 0.24, 0.09);
    this.tinkle(now + 0.34, 3100 * v, 0.08);
  }

  /** Jonh's yelp: a formant voice sweeping "WAH-oof" with vibrato and breath. */
  playJonhReaction(intensity = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.route('jonhVoice');
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
      voice.connect(f).connect(g).connect(this.out());
    }
    this.noise(start, 0.09, 'bandpass', 1600, 0.8, 0.12 * intensity);
    voice.start(start);
    vibrato.start(start);
    voice.stop(start + duration + 0.02);
    vibrato.stop(start + duration + 0.02);
  }

  /**
   * Jonh muttering a line: a few low, quick formant syllables (a deadpan "hm-mm-hmph"), quiet
   * enough to sit under music. `length` is the line's character count.
   */
  playMutter(length = 24): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.route('mutter');
    const syllables = Math.max(2, Math.min(5, Math.round(length / 9)));
    const vowels: Array<[number, number]> = [[640, 1190], [480, 1720], [560, 920], [390, 2000], [700, 1100]];
    let t = ctx.currentTime + 0.02;
    const base = 128 * this.vary(0.06);
    for (let i = 0; i < syllables; i++) {
      const d = 0.07 + this.rng() * 0.06;
      const last = i === syllables - 1;
      const voice = ctx.createOscillator();
      voice.type = 'sawtooth';
      const pitch = base * (1 + (this.rng() - 0.5) * 0.18) * (last ? 0.86 : 1);
      voice.frequency.setValueAtTime(pitch, t);
      voice.frequency.exponentialRampToValueAtTime(pitch * (last ? 0.8 : 0.95), t + d);
      const [f1, f2] = vowels[Math.floor(this.rng() * vowels.length)]!;
      for (const [freq, level] of [[f1, 0.11], [f2, 0.05]] as const) {
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 6;
        f.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(level, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        voice.connect(f).connect(g).connect(this.out());
      }
      voice.start(t);
      voice.stop(t + d + 0.02);
      t += d + 0.025;
    }
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
    osc.connect(g).connect(this.out());
    osc.start(start);
    lfo.start(start);
    osc.stop(start + duration + 0.02);
    lfo.stop(start + duration + 0.02);
  }

  /** Snare drumroll that speeds up and swells: the match's deciding shot is coming. */
  playDrumroll(seconds = 1.1): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.route('drumroll');
    const now = ctx.currentTime;
    let t = 0;
    let gap = 0.075;
    while (t < seconds) {
      this.noise(now + t, 0.045, 'bandpass', 1700 + this.rng() * 500, 0.9, 0.07 + 0.17 * (t / seconds));
      t += gap;
      gap = Math.max(0.03, gap * 0.94);
    }
    this.kick(now + seconds, 120, 60, 0.18, 0.5);
    this.noise(now + seconds, 0.5, 'highpass', 5200, 0.7, 0.18, 0.004);
  }

  /** A voiced "FAAH" when the ball leaves the visible area. */
  playOutOfBounds(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.route('outOfBounds');
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
      voice.connect(f).connect(g).connect(this.out());
    }
    voice.start(start + 0.08);
    voice.stop(start + 0.9);
  }

  /** Air rushing past the ball: a looped band of noise that follows its speed (0..1). */
  setFlightWhoosh(speed01: number | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuffer) return;
    if (speed01 === null || this._isMuted || this.hiddenTab) {
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
      src.connect(filter).connect(gain).connect(this.cueBuses.get('whoosh')!);
      src.start();
      this.whoosh = { src, filter, gain };
    }
    const k = Math.max(0, Math.min(1, speed01));
    this.whoosh.filter.frequency.setTargetAtTime(500 + 1600 * k, ctx.currentTime, 0.05);
    this.whoosh.gain.gain.setTargetAtTime(0.09 * k * k, ctx.currentTime, 0.05);
  }

  /**
   * A ball rolling along a skate ramp: low, woody rumble from looped noise, louder and a little brighter
   * the faster it rolls (`speed01` 0..1), or null to fade it out. It plays on the `surface` cue bus, so
   * the scenery tier's trim holds it, and sits well under a surface impact.
   */
  setRampRumble(speed01: number | null): void {
    const ctx = this.ctx;
    const bus = this.cueBuses.get('surface');
    if (!ctx || !bus || !this.noiseBuffer) return;
    if (speed01 === null || speed01 <= 0 || this._isMuted || this.hiddenTab) {
      if (this.rumble) {
        const r = this.rumble;
        r.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
        r.src.stop(ctx.currentTime + 0.25);
        this.rumble = null;
      }
      return;
    }
    if (!this.rumble) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 3;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(bus);
      src.start(ctx.currentTime, this.rng());
      this.rumble = { src, filter, gain };
    }
    const k = Math.max(0, Math.min(1, speed01));
    this.rumble.filter.frequency.setTargetAtTime(160 + 340 * k, ctx.currentTime, 0.05);
    this.rumble.gain.gain.setTargetAtTime(0.06 + 0.16 * k, ctx.currentTime, 0.05);
  }

  /** The ball leaves a ramp's lip: a clack off the steel coping (`strength` 0..1 by speed). */
  playRampLaunch(strength: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.route('surface');
    const s = Math.max(0.25, Math.min(1, strength));
    const v = this.vary(0.08);
    const now = ctx.currentTime;
    if (!this.sample('impactPlate_light_000', 0.5 * s, 1.2 * v)) this.tinkle(now, 1900 * v, 0.18 * s, 0.09);
    this.kick(now, 210 * v, 80, 0.1, 0.4 * s);
  }

  /**
   * The scrapyard magnet's hum: a low buzz whose loudness and pitch follow how close the flying ball is
   * to the magnet (`proximity01`, 0..1). Call every frame during a flight on a magnet garden, and with
   * `null` otherwise (it fades out and stops). Plays through the flight whoosh's bus (quiet tier).
   */
  setMagnetHum(proximity01: number | null): void {
    const ctx = this.ctx;
    const bus = this.cueBuses.get('whoosh');
    if (!ctx || !bus) return;
    const H = AUDIO.magnetHum;
    if (proximity01 === null || proximity01 <= 0 || this._isMuted || this.hiddenTab) {
      if (this.hum) {
        const h = this.hum;
        h.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
        for (const o of h.oscs) { try { o.stop(ctx.currentTime + 0.4); } catch { /* already stopped */ } }
        this.hum = null;
      }
      return;
    }
    if (!this.hum) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = H.lowpassHz;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const buzz = ctx.createOscillator();
      buzz.type = 'sawtooth';
      buzz.frequency.value = H.baseHz;
      const body = ctx.createOscillator();
      body.type = 'sine';
      body.frequency.value = H.baseHz * 2;
      buzz.connect(filter);
      body.connect(filter);
      filter.connect(gain).connect(bus);
      buzz.start();
      body.start();
      this.hum = { oscs: [buzz, body], gain };
    }
    const p = Math.max(0, Math.min(1, proximity01));
    const t = ctx.currentTime;
    this.hum.gain.gain.setTargetAtTime(H.gain * p * p, t, 0.06);
    this.hum.oscs.forEach((o, i) => o.frequency.setTargetAtTime((H.baseHz + H.riseHz * p) * (i + 1), t, 0.08));
  }

  get magnetHumPlaying(): boolean { return this.hum !== null; }

  /**
   * Ice [PROPOSED 2026-11-25][TUNE]: a continuous scrape while the ball skids, brighter and louder the
   * faster it goes (`speed01` 0..1); null fades it out. Driven every frame, like the flight whoosh.
   */
  setSkid(speed01: number | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuffer) return;
    if (speed01 === null || speed01 <= 0 || this._isMuted || this.hiddenTab) {
      if (this.skid) {
        const s = this.skid;
        s.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
        s.src.stop(ctx.currentTime + 0.4);
        this.skid = null;
      }
      return;
    }
    if (!this.skid) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.9;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.cueBuses.get('surface')!);
      src.start(0, this.rng());
      this.skid = { src, filter, gain };
    }
    const k = Math.max(0, Math.min(1, speed01));
    this.skid.filter.frequency.setTargetAtTime(1800 + 2600 * k, ctx.currentTime, 0.04);
    this.skid.gain.gain.setTargetAtTime(AUDIO.skid.gain * Math.sqrt(k), ctx.currentTime, 0.04);
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
    this.route('click');
    this.kick(ctx.currentTime, 900 * this.vary(0.05), 600, 0.05, 0.18);
  }

  /**
   * Emote pops (online rooms), both short and friendly and distinguishable by ear: another player's emote is a
   * bright rising two-pop "pi-pip"; your own is a single softer, lower "pup". Rate-limited, so a burst of
   * emotes never stacks into noise.
   */
  playEmote(own = false): void {
    const ctx = this.ready();
    if (!ctx) return;
    if (!(own ? this.gates.emoteOut : this.gates.emoteIn).allow(ctx.currentTime)) return;
    const t = ctx.currentTime;
    if (own) {
      this.route('emoteOut');
      this.pop(t, midiToHz(72), 1.3, 0.2, 0.1);
    } else {
      this.route('emoteIn');
      this.pop(t, midiToHz(79), 1.5, 0.2, 0.11);
      this.pop(t + 0.075, midiToHz(84), 1.5, 0.17, 0.13);
    }
  }

  /** A bubble pop: a sine gliding quickly up by `rise`, with a faint octave, decaying within `duration`. */
  private pop(start: number, hz: number, rise: number, gain: number, duration: number): void {
    const ctx = this.ctx!;
    for (const [mult, level] of [[1, 1], [2, 0.22]] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz * mult * 0.8, start);
      osc.frequency.exponentialRampToValueAtTime(hz * mult * rise, start + 0.04);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain * level, start + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(g).connect(this.out());
      osc.start(start);
      osc.stop(start + duration + 0.02);
    }
  }

  /**
   * One footfall on the gravel path: a few grains of band-passed noise (the crunch) over a soft low
   * heel thud. `foot` alternates 0/1 and nudges the pitch so the two feet are not identical.
   */
  playFootstep(foot: 0 | 1 = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    if (!this.gates.footstep.allow(ctx.currentTime)) return;
    this.route('footstep');
    const t = ctx.currentTime;
    const v = this.vary(AUDIO.footstep.pitchSpread) * (foot === 1 ? 0.93 : 1.04);
    const grains = 4 + Math.floor(this.rng() * 3);
    for (let i = 0; i < grains; i++) {
      const at = t + i * 0.011 + this.rng() * 0.008;
      this.noise(at, 0.022 + this.rng() * 0.02, 'bandpass', (1800 + this.rng() * 2600) * v, 0.9, 0.22 - i * 0.02, 0.002);
    }
    this.kick(t, 105 * v, 58, 0.09, 0.3);
  }

  /**
   * The garden's wind: a soft airy bed whose loudness and brightness follow the wind strength (the
   * windsock's lift), with gusts that swell and fade now and then. Call every frame while playing a
   * garden with wind, with its acceleration (m/s²), and `null` otherwise; if it is not refreshed
   * (pause, quit, hidden tab) the bed fades away by itself. Also off while muted or with music off.
   */
  setWindBed(accelerationMs2: number | null): void {
    const ctx = this.ctx;
    const silent = accelerationMs2 === null || accelerationMs2 === 0 || this._isMuted || !this._music || this.hiddenTab;
    if (!ctx || !this.ambienceDuck || silent) { this.stopWind(); return; }
    if (this.wind && Math.abs(this.wind.accel - accelerationMs2) > 1e-6) this.stopWind();
    const now = ctx.currentTime;
    if (!this.wind) this.startWind(ctx, accelerationMs2, now);
    this.wind!.freshUntil = now + AUDIO.wind.keepAliveSeconds;
  }

  get windBedPlaying(): boolean { return this.wind !== null; }

  /** How far into a gust the wind bed is right now (0–1), so the windsock can swell with it; null when silent. */
  windGust(): number | null {
    const w = this.wind;
    const ctx = this.ctx;
    return w && ctx ? gustLevelAt(ctx.currentTime - w.startedAt, w.accel) : null;
  }

  private startWind(ctx: AnyContext, accel: number, now: number): void {
    this.windBuffer ??= this.makeWindBuffer(ctx, 6);
    const filters = windBedFilters(accel);
    const rumble = ctx.createBiquadFilter();
    rumble.type = 'lowpass';
    rumble.frequency.value = filters.rumbleHz;
    rumble.Q.value = 0.7;
    const air = ctx.createBiquadFilter();
    air.type = 'bandpass';
    air.frequency.value = filters.airHz;
    air.Q.value = 0.9;
    // The air layer's centre drifts slowly so the bed never sits on one pitch.
    const drift = ctx.createOscillator();
    const driftDepth = ctx.createGain();
    drift.frequency.value = 0.17;
    driftDepth.gain.value = filters.airHz * 0.22;
    drift.connect(driftDepth).connect(air.frequency);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 1;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.55;
    const gust = ctx.createGain();
    gust.gain.value = 1;
    const bed = ctx.createGain();
    bed.gain.setValueAtTime(0, now);
    bed.gain.linearRampToValueAtTime(windBedLevel(accel), now + AUDIO.wind.fadeInSeconds);
    const sources: AudioScheduledSourceNode[] = [0, 1].map(i => {
      const src = ctx.createBufferSource();
      src.buffer = this.windBuffer;
      src.loop = true;
      src.playbackRate.value = i === 0 ? 0.97 : 1.03;
      src.connect(i === 0 ? rumble : air);
      src.start(now, this.rng() * 5);
      return src;
    });
    drift.start(now);
    sources.push(drift);
    rumble.connect(rumbleGain).connect(gust);
    air.connect(airGain).connect(gust);
    gust.connect(bed).connect(this.ambienceDuck!);
    this.wind = {
      accel, sources, air, bed, gust, freshUntil: now + AUDIO.wind.keepAliveSeconds,
      gustIndex: 0, nextGustAt: now + gustPlan(0, accel).gapSeconds, startedAt: now,
    };
    this.scheduleGusts();
  }

  /** Queues the gusts due in the next half second (called from the 50 ms scheduler), or `ahead` seconds. */
  private scheduleGusts(ahead = 0.5): void {
    const ctx = this.ctx;
    const w = this.wind;
    if (!ctx || !w) return;
    const horizon = ctx.currentTime + ahead;
    const filters = windBedFilters(w.accel);
    while (w.nextGustAt < horizon) {
      const plan = gustPlan(w.gustIndex, w.accel);
      const start = w.nextGustAt;
      const peak = start + plan.swellSeconds;
      const end = peak + plan.fadeSeconds;
      w.gust.gain.setValueAtTime(1, start);
      w.gust.gain.linearRampToValueAtTime(1 + plan.lift, peak);
      w.gust.gain.linearRampToValueAtTime(1, end);
      // A gust is also brighter at its peak.
      w.air.frequency.setValueAtTime(filters.airHz, start);
      w.air.frequency.linearRampToValueAtTime(filters.airHz * (1 + 0.35 * plan.lift), peak);
      w.air.frequency.linearRampToValueAtTime(filters.airHz, end);
      w.gustIndex++;
      w.nextGustAt = end + gustPlan(w.gustIndex, w.accel).gapSeconds;
    }
  }

  /** Fades the wind bed out and releases its nodes (`now`: stop immediately, for a hidden tab). */
  private stopWind(now = false): void {
    const w = this.wind;
    const ctx = this.ctx;
    this.wind = null;
    if (!w || !ctx) return;
    const t = ctx.currentTime;
    const fade = now ? 0.02 : AUDIO.wind.fadeOutSeconds;
    w.bed.gain.cancelScheduledValues(t);
    w.bed.gain.setTargetAtTime(0, t, fade / 3);
    for (const node of w.sources) { try { node.stop(t + fade + 0.1); } catch { /* already stopped */ } }
  }

  /** Shot cues dip the wind bed briefly so it stays under them. */
  private duckAmbience(): void {
    const duck = this.ambienceDuck;
    const ctx = this.ctx;
    if (!duck || !ctx || !this.wind) return;
    const t = ctx.currentTime;
    duck.gain.cancelScheduledValues(t);
    duck.gain.setTargetAtTime(dbToGain(AUDIO.wind.duckDb), t, 0.03);
    duck.gain.setTargetAtTime(1, t + AUDIO.wind.duckSeconds, 0.4);
  }

  /** Looping brown-ish noise for the wind, with the seam cross-faded so the loop never clicks. */
  private makeWindBuffer(ctx: AnyContext, seconds: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const fade = Math.floor(rate * 0.5);
    const raw = new Float32Array(length + fade);
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      last = (last + 0.04 * (this.rng() * 2 - 1)) / 1.02;
      raw[i] = last;
    }
    const buffer = ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    let peak = 1e-6;
    for (let i = 0; i < length; i++) {
      // The first `fade` samples blend in the extra tail, so the end meets the start.
      const k = i < fade ? i / fade : 1;
      const tail = i < fade ? raw[length + i]! : 0;
      data[i] = i < fade ? raw[i]! * Math.sqrt(k) + tail * Math.sqrt(1 - k) : raw[i]!;
      peak = Math.max(peak, Math.abs(data[i]!));
    }
    for (let i = 0; i < length; i++) data[i] = data[i]! / peak * 0.9;
    return buffer;
  }

  /** Two-note sting for results; success rises, failure falls. */
  playSting(success: boolean): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.route('sting');
    const notes = success ? [72, 76, 79, 84] : [67, 63, 60];
    notes.forEach((n, i) => this.marimba(ctx.currentTime + i * 0.11, n, 0.35, this.out()));
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
    this.musicTimer = setInterval(() => { this.tickWind(); this.scheduleMusic(); }, 50);
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
      if (time >= ctx.currentTime - 0.02 && this._music) this.playMusicNote(note, time);
      this.musicNextIndex++;
    }
  }

  private playMusicNote(note: ScheduledNote, time: number): void {
    if (note.voice === 'marimba') this.marimba(time, note.note, 0.32, this.musicBus!);
    else if (note.voice === 'bass') this.pluck(time, note.note, 0.55);
    else this.shaker(time);
  }

  /** Level report: starts the wind bed and queues all its gusts for the next `seconds` (no timer involved). */
  windForReport(accelerationMs2: number, seconds: number): void {
    this.setWindBed(accelerationMs2);
    this.scheduleGusts(seconds);
  }

  /** Tuning aid / level report: sets one cue's trim in dB (e.g. -120 to isolate another cue). */
  setCueTrimDb(name: CueName, db: number): void {
    const bus = this.cueBuses.get(name);
    if (bus) bus.gain.value = dbToGain(db);
  }

  /** Level report: schedules the first `seconds` of the music loop from now (no timer involved). */
  scheduleMusicForReport(seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    for (const note of this.notes) if (note.time < seconds) this.playMusicNote(note, ctx.currentTime + note.time);
  }

  /** Keeps the wind bed's gusts queued, and lets it fade away when the scene stops refreshing it. */
  private tickWind(): void {
    const ctx = this.ctx;
    if (!ctx || !this.wind) return;
    if (ctx.currentTime > this.wind.freshUntil) { this.stopWind(); return; }
    this.scheduleGusts();
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

  /**
   * Shareable clip: a stream of exactly what the master output plays (so Mute and volume apply), or
   * null before the first gesture or without MediaStream support. Call `releaseCaptureStream` when done.
   */
  captureStream(): MediaStream | null {
    // The offline level report renders into an OfflineAudioContext, which has no streams.
    const ctx = this.offline ? null : this.ctx as AudioContext | null;
    if (!ctx || !this.masterGain || typeof ctx.createMediaStreamDestination !== 'function') return null;
    if (!this.clipTap) {
      this.clipTap = ctx.createMediaStreamDestination();
      this.masterGain.connect(this.clipTap);
    }
    return this.clipTap.stream;
  }

  releaseCaptureStream(): void {
    if (!this.clipTap) return;
    try { this.masterGain?.disconnect(this.clipTap); } catch { /* already gone */ }
    this.clipTap = null;
  }

  destroy(): void {
    this.setFlightWhoosh(null);
    this.setRampRumble(null);
    this.setMagnetHum(null);
    this.stopWind(true);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.ctx) {
      if (!this.offline) void (this.ctx as AudioContext).close();
      this.ctx = null;
      this.masterGain = null;
      this.clipTap = null;
      this.sfxBus = null;
      this.musicBus = null;
      this.ambienceBus = null;
      this.ambienceDuck = null;
      this.cueBuses.clear();
      this.windBuffer = null;
    }
  }
}
