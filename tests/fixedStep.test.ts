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

  it('ignores non-positive or invalid frame times', () => {
    const s = new FixedStepper(dt, 8);
    expect(s.advance(0)).toBe(0);
    expect(s.advance(-1)).toBe(0);
    expect(s.advance(Number.NaN)).toBe(0);
  });
});
