import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/config/tuning';
import { readabilityBoost } from '../src/fx/readability';

describe('readabilityBoost', () => {
  it('leaves full-size and large canvases alone', () => {
    expect(readabilityBoost(WORLD.designWidthPx)).toBe(1);
    expect(readabilityBoost(1600)).toBe(1);
    expect(readabilityBoost(0)).toBe(1);
  });

  it('grows text as the canvas shrinks, up to the cap', () => {
    const phone = readabilityBoost(832);
    expect(phone).toBeGreaterThan(1.2);
    expect(phone).toBeLessThan(1.4);
    expect(readabilityBoost(358)).toBe(1.6);
  });
});
