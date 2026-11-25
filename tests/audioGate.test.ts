import { describe, expect, it } from 'vitest';
import { CueGate } from '../src/audio/cueGate';
import { AUDIO } from '../src/config/tuning';

describe('CueGate', () => {
  it('enforces the minimum gap and the cap per window', () => {
    const gate = new CueGate({ minGapSeconds: 0.3, windowSeconds: 3, maxInWindow: 3 });
    expect(gate.allow(0)).toBe(true);
    expect(gate.allow(0.1)).toBe(false); // too soon
    expect(gate.allow(0.3)).toBe(true);
    expect(gate.allow(0.7)).toBe(true);
    expect(gate.allow(1.2)).toBe(false); // three in the last 3 s
    expect(gate.allow(2.9)).toBe(false);
    expect(gate.allow(3.0)).toBe(true); // the first has left the window
  });

  it('a rejected sound is not counted and a clock running backwards starts afresh', () => {
    const gate = new CueGate({ minGapSeconds: 1, windowSeconds: 10, maxInWindow: 2 });
    expect(gate.allow(5)).toBe(true);
    expect(gate.allow(5.5)).toBe(false);
    expect(gate.allow(6)).toBe(true);
    expect(gate.allow(2)).toBe(true); // time went backwards
    gate.reset();
    expect(gate.allow(2.1)).toBe(true);
  });

  it('a burst of six emotes in 0.25 s voices only one; a steady trickle goes through', () => {
    const gate = new CueGate(AUDIO.limits.emoteIn);
    const burst = Array.from({ length: 6 }, (_, i) => gate.allow(i * 0.05)).filter(Boolean);
    expect(burst).toHaveLength(1);
    const trickle = new CueGate(AUDIO.limits.emoteIn);
    expect([0, 1, 2, 3, 4, 5].filter(i => trickle.allow(i * 1.2))).toHaveLength(6);
  });

  it('own emotes may follow each other a little faster than incoming ones', () => {
    expect(AUDIO.limits.emoteOut.minGapSeconds).toBeLessThan(AUDIO.limits.emoteIn.minGapSeconds);
  });
});
