import { describe, expect, it } from 'vitest';
import { AutoAdvance } from '../src/rules/autoAdvance';

describe('Automatic shot flow', () => {
  it('waits for the reaction, pauses, and advances exactly once', () => {
    const timer = new AutoAdvance();
    timer.schedule('shot', 0.2);
    expect(timer.advance(0.1)).toBeNull();
    expect(timer.advance(5, true)).toBeNull();
    expect(timer.advance(0.1)).toBe('shot');
    expect(timer.advance(1)).toBeNull();
  });

  it('cancels pending work on Home, retry or a manual skip', () => {
    const timer = new AutoAdvance();
    timer.schedule('handover', 0.1);
    timer.cancel();
    expect(timer.advance(0.1)).toBeNull();
    timer.schedule('round', 0.1);
    timer.schedule('handover', 0.2);
    expect(timer.advance(0.1)).toBeNull();
    expect(timer.advance(0.1)).toBe('handover');
  });

  it('does not skip the handover after a background tab delay', () => {
    const timer = new AutoAdvance();
    timer.schedule('handover', 1);
    expect(timer.advance(60)).toBeNull();
  });
});
