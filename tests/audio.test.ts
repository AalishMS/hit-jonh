import { describe, expect, it } from 'vitest';
import { AudioManager } from '../src/audio/audioManager';

describe('AudioManager', () => {
  it('instantiates safely without DOM/AudioContext errors in test environment', () => {
    const audio = new AudioManager();
    expect(audio).toBeDefined();
    expect(typeof audio.isMuted).toBe('boolean');
  });

  it('toggles and sets mute state without errors', () => {
    const audio = new AudioManager();
    audio.setMuted(true);
    expect(audio.isMuted).toBe(true);
    audio.setMuted(false);
    expect(audio.isMuted).toBe(false);

    const toggled = audio.toggleMute();
    expect(toggled).toBe(true);
    expect(audio.isMuted).toBe(true);
  });

  it('adjusts and clamps volume correctly', () => {
    const audio = new AudioManager();
    audio.setVolume(0.4);
    expect(audio.volume).toBeCloseTo(0.4);

    audio.setVolume(1.5);
    expect(audio.volume).toBe(1.0);

    audio.setVolume(-0.2);
    expect(audio.volume).toBe(0.0);
  });

  it('safely handles play calls when AudioContext is absent or uninitialized', () => {
    const audio = new AudioManager();
    expect(() => {
      audio.playCannonFire();
      audio.playImpact('body');
      audio.playImpact('ground');
      audio.destroy();
    }).not.toThrow();
  });
});
