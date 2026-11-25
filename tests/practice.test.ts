import { describe, expect, it } from 'vitest';
import { SoloChallengeMachine } from '../src/rules/soloChallenge';

describe('practice (unlimited solo shots)', () => {
  it('never ends and only counts hits', () => {
    const m = new SoloChallengeMachine('backyard', { practice: true });
    expect(m.isPractice).toBe(true);
    for (let i = 0; i < 12; i++) {
      expect(m.fire()).toBe(true);
      m.resolveShot(i % 3 === 0, false);
      expect(m.state).toBe('result');
      expect(m.result).toBeNull();
      m.startAiming();
    }
    expect(m.shotsTaken).toBe(12);
    expect(m.hits).toBe(4);
    expect(m.attemptsLeft).toBe(Number.POSITIVE_INFINITY);
  });

  it('leaves the challenge rules alone', () => {
    const m = new SoloChallengeMachine('backyard');
    expect(m.isPractice).toBe(false);
    m.fire(); m.resolveShot(false, false); m.startAiming();
    m.fire(); m.resolveShot(true, true);
    expect(m.state).toBe('solo_result');
    expect(m.result).toEqual({ success: true, shotsUsed: 2, stars: 2, hasStyle: true });
    expect(m.attemptsLeft).toBe(1);
  });
});
