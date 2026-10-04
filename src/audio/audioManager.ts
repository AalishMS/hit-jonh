/**
 * Web Audio sound synthesizer for Hit Jonh.
 * Synthesizes cannon firing and impacts procedurally without external assets.
 * Handles browser user-gesture autoplay unlock and mute state persistence.
 */

import { loadSaveData, saveSettings } from '../storage/storage';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _isMuted = false;
  private _volume = 1.0;
  private isUnlocked = false;
  private reactionIndex = 0;

  /** Alternating rubbery yelps, with a small pitch scoop for slapstick emphasis. */
  playJonhReaction(): void {
    const pitches = [230, 155, 290];
    const pitch = pitches[this.reactionIndex++ % pitches.length]!;
    this.playVocal(pitch, pitch * 0.55, 0.48);
  }

  /** A voiced "FAAH": airy F onset, open A formants, then a falling pitch. */
  playOutOfBounds(): void {
    if (this._isMuted || !this.ctx) return;
    this.playNoiseBurst(this.ctx.currentTime, 0.12, 2200, 0.25);
    this.playVocal(210, 65, 0.8, 0.08);
  }

  private playVocal(startPitch: number, endPitch: number, duration: number, delay = 0): void {
    if (this._isMuted || !this.ctx || !this.masterGain) return;
    const start = this.ctx.currentTime + delay;
    const voice = this.ctx.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(startPitch, start);
    voice.frequency.exponentialRampToValueAtTime(startPitch * 1.3, start + duration * 0.15);
    voice.frequency.exponentialRampToValueAtTime(endPitch, start + duration);
    // Parallel resonances shape a recognisable open-vowel sound.
    for (const [frequency, level] of [[750, 0.2], [1200, 0.09], [2600, 0.025]]) {
      const formant = this.ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(frequency!, start);
      formant.Q.setValueAtTime(4, start);
      const envelope = this.ctx.createGain();
      envelope.gain.setValueAtTime(0.001, start);
      envelope.gain.exponentialRampToValueAtTime(level!, start + 0.04);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
      voice.connect(formant);
      formant.connect(envelope);
      envelope.connect(this.masterGain);
    }
    voice.start(start);
    voice.stop(start + duration);
  }

  constructor() {
    const settings = this.loadAudioSettings();
    this._isMuted = settings.muted;
    this._volume = settings.volume;
  }

  get isMuted(): boolean {
    return this._isMuted;
  }

  get volume(): number {
    return this._volume;
  }

  /**
   * Initializes AudioContext upon first user interaction (click, keypress, touch).
   * Verifies audio begins only after user gesture.
   */
  unlock(): void {
    if (this.isUnlocked && this.ctx && this.ctx.state === 'running') {
      return;
    }

    if (typeof window === 'undefined') return;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return;

    if (!this.ctx) {
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      const targetGain = this._isMuted ? 0 : this._volume;
      this.masterGain.gain.setValueAtTime(targetGain, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    this.isUnlocked = true;
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1.0));
    this._volume = clamped;
    saveSettings({ volume: clamped });

    if (this.masterGain && this.ctx) {
      const target = this._isMuted ? 0 : clamped;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(target, now);
      this.masterGain.gain.value = target;
    }
  }

  setMuted(muted: boolean): void {
    this._isMuted = muted;
    saveSettings({ muted });

    if (this.masterGain && this.ctx) {
      const target = muted ? 0 : this._volume;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(target, now);
      this.masterGain.gain.value = target;
    }
  }

  toggleMute(): boolean {
    this.unlock();
    this.setMuted(!this._isMuted);
    return this._isMuted;
  }

  /**
   * Plays a punchy procedural cannon shot sound (propellant blast + low boom).
   */
  playCannonFire(): void {
    if (this._isMuted || !this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    // 1. Low frequency thump oscillator
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    osc.type = 'sine';
    // Pitch drops rapidly from 170 Hz down to 35 Hz
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.35);

    oscGain.gain.setValueAtTime(0.9, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.4);

    // 2. Filtered noise burst for explosive blast crack
    this.playNoiseBurst(now, 0.22, 900, 0.7);
  }

  /**
   * Plays impact sound based on surface/target type.
   */
  playImpact(type: 'body' | 'ground' | 'obstacle' = 'ground'): void {
    if (this._isMuted || !this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    if (type === 'body') {
      // Jonh struck: punchy low thump + comedic bonk/pop
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.18);

      oscGain.gain.setValueAtTime(0.85, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.22);

      // Low thump underneath
      const lowOsc = this.ctx.createOscillator();
      const lowGain = this.ctx.createGain();
      lowOsc.type = 'sine';
      lowOsc.frequency.setValueAtTime(120, now);
      lowOsc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
      lowGain.gain.setValueAtTime(0.9, now);
      lowGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      lowOsc.connect(lowGain);
      lowGain.connect(this.masterGain);
      lowOsc.start(now);
      lowOsc.stop(now + 0.28);
    } else {
      // Ground / obstacle thud
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = 'sine';
      const startFreq = type === 'obstacle' ? 140 : 85;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.16);

      oscGain.gain.setValueAtTime(0.65, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.2);

      this.playNoiseBurst(now, 0.08, 450, 0.4);
    }
  }

  private playNoiseBurst(startTime: number, duration: number, cutoffHz: number, gainLevel: number): void {
    if (!this.ctx || !this.masterGain) return;

    const sampleRate = this.ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    if (bufferSize <= 0) return;

    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz, startTime);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(gainLevel, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.start(startTime);
    noise.stop(startTime + duration + 0.05);
  }

  private loadAudioSettings(): { muted: boolean; volume: number } {
    try {
      const data = loadSaveData();
      return {
        muted: Boolean(data.settings.muted),
        volume: typeof data.settings.volume === 'number' ? data.settings.volume : 1.0,
      };
    } catch {
      return { muted: false, volume: 1.0 };
    }
  }

  destroy(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }
}
