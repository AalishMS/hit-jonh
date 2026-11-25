import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../src/sim/fixedStep';

describe('FixedStepper', () => {
  const dt = 1 / 120;

  it('produces the same total steps regardless of frame rate', () => {
    const totalSeconds = 2;
    const count = (fps: number) => {
      const s = new FixedStepper(dt, 8);
      let steps = 0;
      for (let i = 0; i < totalSeconds * fps; i++) steps += s.advance(1 / fps);
      return steps;
    };
    expect(count(30)).toBe(240);
    expect(count(60)).toBe(240);
    expect(count(144)).toBe(240);
  });

  it('caps steps per frame and drops backlog (hidden tab)', () => {
    const s = new FixedStepper(dt, 8);
    expect(s.advance(10)).toBe(8);
    expect(s.alpha).toBe(0);
  });

  it('a raised per-call cap lets fast-forwarded frames keep every step (same total)', () => {
    const s = new FixedStepper(dt, 8);
    let steps = 0;
    // 4x time at 30 Hz needs 16 steps a frame; with the cap raised to match nothing is dropped.
    for (let i = 0; i < 30; i++) steps += s.advance(4 / 30, 32);
    expect(steps).toBe(480);
    const capped = new FixedStepper(dt, 8);
    let dropped = 0;
    for (let i = 0; i < 30; i++) dropped += capped.advance(4 / 30);
    expect(dropped).toBe(240);
  });

  it('ignores non-positive or invalid frame times', () => {
    const s = new FixedStepper(dt, 8);
    expect(s.advance(0)).toBe(0);
    expect(s.advance(-1)).toBe(0);
    expect(s.advance(Number.NaN)).toBe(0);
  });
});
