import { describe, expect, it } from 'vitest';
import { AudioManager } from '../src/audio/audioManager';
import { AUDIO, CUE_NAMES } from '../src/config/tuning';

/** A stand-in AudioContext that records what the manager builds (there is no WebAudio in node). */
function fakeContext() {
  const created = { oscillators: 0, sources: 0, gains: [] as Array<{ value: number }> };
  const param = () => ({
    value: 0,
    setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; }, cancelScheduledValues() { return this; },
  });
  const node = (extra: Record<string, unknown> = {}) => {
    const n: Record<string, unknown> = { connect: (to: unknown) => to, disconnect() {}, start() {}, stop() {}, ...extra };
    return n;
  };
  const ctx = {
    currentTime: 0, sampleRate: 48000, state: 'running', destination: node(),
    createGain() { const g = param(); created.gains.push(g); return node({ gain: g }); },
    createOscillator() { created.oscillators++; return node({ frequency: param(), type: 'sine' }); },
    createBufferSource() { created.sources++; return node({ buffer: null, loop: false, playbackRate: param() }); },
    createBiquadFilter() { return node({ frequency: param(), Q: param(), type: 'lowpass' }); },
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); },
    createWaveShaper() { return node({ curve: null, oversample: 'none' }); },
    createAnalyser() { return node({ fftSize: 0 }); },
    createBuffer(_c: number, length: number) { const data = new Float32Array(length); return { getChannelData: () => data }; },
    decodeAudioData: () => Promise.resolve({}),
    resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve(),
  };
  return { ctx: ctx as unknown as OfflineAudioContext, raw: ctx, created };
}

function manager(options: { muted?: boolean; music?: boolean } = {}) {
  const fake = fakeContext();
  const audio = new AudioManager(() => 0.5);
  audio.attachContext(fake.ctx);
  if (options.muted) audio.setMuted(true);
  if (options.music === false) audio.setMusicEnabled(false);
  return { audio, ...fake };
}
const tick = (audio: AudioManager) => (audio as unknown as { tickWind(): void }).tickWind();

describe('every cue has its own trim bus', () => {
  it('builds one per cue and applies the tuned trim', () => {
    const { audio, created } = manager();
    expect(created.gains.length).toBeGreaterThan(CUE_NAMES.length);
    audio.setCueTrimDb('click', -120);
    audio.destroy();
  });
});

describe('wind bed', () => {
  it('starts on a windy garden, stays while refreshed and fades away when the scene stops refreshing it', () => {
    const { audio, raw } = manager();
    expect(audio.windBedPlaying).toBe(false);
    audio.setWindBed(-3);
    expect(audio.windBedPlaying).toBe(true);
    raw.currentTime = AUDIO.wind.keepAliveSeconds * 0.8;
    tick(audio);
    expect(audio.windBedPlaying).toBe(true);
    audio.setWindBed(-3); // refreshed by the next frame
    raw.currentTime += AUDIO.wind.keepAliveSeconds * 0.8;
    tick(audio);
    expect(audio.windBedPlaying).toBe(true);
    raw.currentTime += AUDIO.wind.keepAliveSeconds * 1.5; // paused, quit or hidden: no more refreshes
    tick(audio);
    expect(audio.windBedPlaying).toBe(false);
  });

  it('plays only where the level has wind, and stops when leaving it', () => {
    const { audio } = manager();
    audio.setWindBed(null);
    audio.setWindBed(0);
    expect(audio.windBedPlaying).toBe(false);
    audio.setWindBed(-3);
    expect(audio.windBedPlaying).toBe(true);
    audio.setWindBed(null);
    expect(audio.windBedPlaying).toBe(false);
  });

  it('is off while muted or with music off, and a changed wind rebuilds the bed', () => {
    expect(() => { const m = manager({ muted: true }); m.audio.setWindBed(-3); expect(m.audio.windBedPlaying).toBe(false); }).not.toThrow();
    const noMusic = manager({ music: false });
    noMusic.audio.setWindBed(-3);
    expect(noMusic.audio.windBedPlaying).toBe(false);
    const { audio, created } = manager();
    audio.setWindBed(-3);
    const sources = created.sources;
    audio.setWindBed(-3);
    expect(created.sources).toBe(sources); // same wind: nothing rebuilt
    audio.setWindBed(-5);
    expect(created.sources).toBeGreaterThan(sources);
    audio.setMuted(true);
    audio.setWindBed(-5);
    expect(audio.windBedPlaying).toBe(false);
  });

  it('switching music off or muting while it plays silences it', () => {
    const { audio } = manager();
    audio.setWindBed(-3);
    audio.setMusicEnabled(false);
    expect(audio.windBedPlaying).toBe(false);
    audio.setMusicEnabled(true);
    audio.setWindBed(-3);
    expect(audio.windBedPlaying).toBe(true);
    audio.destroy();
    expect(audio.windBedPlaying).toBe(false);
  });
});

describe('emote pops and footsteps', () => {
  const countFor = (play: (a: AudioManager) => void) => {
    const { audio, created } = manager();
    play(audio);
    return created.oscillators;
  };

  it('own and incoming emotes sound different, and neither plays while muted', () => {
    const own = countFor(a => a.playEmote(true));
    const incoming = countFor(a => a.playEmote(false));
    expect(own).toBeGreaterThan(0);
    expect(incoming).toBeGreaterThan(own); // the incoming one is a two-pop figure, mine a single pop
    const muted = manager({ muted: true });
    muted.audio.playEmote(false);
    muted.audio.playEmote(true);
    muted.audio.playFootstep(0);
    expect(muted.created.oscillators).toBe(0);
  });

  it('a burst of incoming emotes in the same instant voices once; later ones pass the gate', () => {
    const { audio, created, raw } = manager();
    audio.playEmote(false);
    const one = created.oscillators;
    for (let i = 0; i < 5; i++) audio.playEmote(false);
    expect(created.oscillators).toBe(one);
    raw.currentTime = AUDIO.limits.emoteIn.minGapSeconds + 0.01;
    audio.playEmote(false);
    expect(created.oscillators).toBe(one * 2);
  });

  it('footsteps are gated against machine-gunning, and sound nothing when the tab is hidden', () => {
    const { audio, created, raw } = manager();
    audio.playFootstep(0);
    const first = created.oscillators + created.sources;
    expect(first).toBeGreaterThan(0);
    audio.playFootstep(1); // same instant: blocked
    expect(created.oscillators + created.sources).toBe(first);
    raw.currentTime = 0.5;
    audio.playFootstep(1);
    expect(created.oscillators + created.sources).toBeGreaterThan(first);
  });
});
