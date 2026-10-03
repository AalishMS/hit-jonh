/**
 * Web Audio sound synthesizer for Hit Jonh.
 * Synthesizes cannon firing and impacts procedurally without external assets.
 * Handles browser user-gesture autoplay unlock and mute state persistence.
 */

const STORAGE_KEY = 'hitJonh.v1';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _isMuted = false;
  private isUnlocked = false;

  constructor() {
    this._isMuted = this.loadMuteState();
  }

  get isMuted(): boolean {
    return this._isMuted;
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
      this.masterGain.gain.setValueAtTime(this._isMuted ? 0 : 1, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    this.isUnlocked = true;
  }

  setMuted(muted: boolean): void {
    this._isMuted = muted;
    this.saveMuteState(muted);

    if (this.masterGain && this.ctx) {
      const target = muted ? 0 : 1;
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

  private loadMuteState(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { muted?: boolean };
        return Boolean(parsed.muted);
      }
    } catch {
      // Ignore parse failure
    }
    return false;
  }

  private saveMuteState(muted: boolean): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const data = saved ? (JSON.parse(saved) as Record<string, unknown>) : {};
      data.muted = muted;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage errors
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
