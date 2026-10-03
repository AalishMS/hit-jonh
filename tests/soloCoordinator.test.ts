import { describe, expect, it } from 'vitest';
import { SoloCoordinator } from '../src/rules/soloCoordinator';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { SoloChallengeMachine } from '../src/rules/soloChallenge';

describe('SoloCoordinator', () => {
  it('guards active flight from resets and aim adjustments', () => {
    const attempt = new ShotAttemptMachine(25, 0.05, 0.5, 15, 0.2);
    const solo = new SoloChallengeMachine('backyard');
    
    const c = new SoloCoordinator(attempt, solo, {
      onStateChange: () => {},
      onShotFired: () => {},
      onShowResult: () => {}
    });

    expect(c.canFire()).toBe(true);
    c.fire(45, 50);

    expect(attempt.state).toBe('simulating');
    expect(solo.state).toBe('simulating');

    // Attempting to reset during flight should be ignored
    expect(c.canReset()).toBe(false);
    c.reset(45, 50);
    expect(attempt.state).toBe('simulating');

    // Attempting to adjust aim during flight should be ignored
    expect(c.canAdjustAim()).toBe(false);
    expect(c.adjustAim(45, 50, 5, 0)).toBeNull();
  });

  it('progresses correctly through a full challenge', () => {
    const attempt = new ShotAttemptMachine(25, 0.05, 0.5, 15, 0.2);
    const solo = new SoloChallengeMachine('backyard');
    let shownResult = null;
    
    const c = new SoloCoordinator(attempt, solo, {
      onStateChange: () => {},
      onShotFired: () => {},
      onShowResult: (res) => { shownResult = res; }
    });

    // Shot 1: Miss
    c.fire(45, 50);
    attempt.step(0.1, { x: 30, y: 0, speed: 0, hitBody: false, hitHat: false }); // out of bounds -> resolved
    expect(attempt.state).toBe('resolved');
    c.resolveShot(false, false);
    
    expect(solo.state).toBe('result');
    expect(c.canReset()).toBe(true);
    c.reset(45, 50);
    expect(solo.state).toBe('aiming');

    // Shot 2: Hit
    c.fire(45, 50);
    attempt.step(0.1, { x: 18, y: 0, speed: 10, hitBody: true, hitHat: false }); // Hit
    expect(attempt.state).toBe('resolved');
    c.resolveShot(true, false);
    
    expect(solo.state).toBe('solo_result');

    // Clicking continue triggers showResult, doesn't reset attempt machine yet
    c.reset(45, 50);
    expect(shownResult).toEqual({ success: true, shotsUsed: 2, stars: 2, hasStyle: false });
  });
});
