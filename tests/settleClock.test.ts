import { describe, expect, it } from 'vitest';
import { FX } from '../src/config/tuning';
import { distanceToBox, fastForwardTarget, SettleClock } from '../src/fx/settleClock';

const base = { landed: true, speedMs: 0.3, distanceToJonhMetres: 10, impactActive: false };

describe('fastForwardTarget (snappy misses)', () => {
  it('never fast-forwards a ball that has not landed yet, or during an impact', () => {
    expect(fastForwardTarget({ ...base, landed: false })).toBe(1);
    expect(fastForwardTarget({ ...base, impactActive: true })).toBe(1);
  });

  it('fast-forwards a crawling ball anywhere, even right next to Jonh', () => {
    expect(fastForwardTarget({ ...base, speedMs: FX.settleCrawlSpeedMs, distanceToJonhMetres: 0.2 })).toBe(FX.settleFastForward);
  });

  it('fast-forwards a rolling ball only when it is clear of Jonh', () => {
    const rolling = { ...base, speedMs: (FX.settleCrawlSpeedMs + FX.settleRollSpeedMs) / 2 };
    expect(fastForwardTarget({ ...rolling, distanceToJonhMetres: FX.settleClearMetres + 0.1 })).toBe(FX.settleFastForward);
    expect(fastForwardTarget({ ...rolling, distanceToJonhMetres: FX.settleClearMetres - 0.1 })).toBe(1);
  });

  it('leaves a fast bounce at real speed', () => {
    expect(fastForwardTarget({ ...base, speedMs: FX.settleRollSpeedMs + 1 })).toBe(1);
  });
});

describe('SettleClock', () => {
  it('eases toward the target instead of jumping, and snaps when close', () => {
    const clock = new SettleClock();
    const first = clock.advance(1 / 60, 4);
    expect(first).toBeGreaterThan(1);
    expect(first).toBeLessThan(4);
    for (let i = 0; i < 120; i++) clock.advance(1 / 60, 4);
    expect(clock.scale).toBe(4);
    expect(clock.isFastForwarding).toBe(true);
    clock.reset();
    expect(clock.scale).toBe(1);
    expect(clock.isFastForwarding).toBe(false);
  });
});

describe('distanceToBox', () => {
  const box = { minX: 0, maxX: 1, minY: 0, maxY: 2 };
  it('is zero inside and the shortest distance outside', () => {
    expect(distanceToBox(0.5, 1, box)).toBe(0);
    expect(distanceToBox(4, 1, box)).toBe(3);
    expect(distanceToBox(4, 6, box)).toBe(5);
  });
});
