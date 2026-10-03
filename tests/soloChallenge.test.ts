import { describe, expect, it } from 'vitest';
import { SoloChallengeMachine } from '../src/rules/soloChallenge';

describe('SoloChallengeMachine', () => {
  it('initializes to aiming with 3 attempts', () => {
    const machine = new SoloChallengeMachine('backyard');
    expect(machine.state).toBe('aiming');
    expect(machine.attemptsLeft).toBe(3);
  });

  it('handles success on first shot (3 stars)', () => {
    const machine = new SoloChallengeMachine('backyard');
    machine.fire();
    machine.resolveShot(true, false);
    expect(machine.state).toBe('solo_result');
    expect(machine.result).toEqual({ success: true, shotsUsed: 1, stars: 3, hasStyle: false });
  });

  it('handles success on second shot with ricochet (2 stars, style)', () => {
    const machine = new SoloChallengeMachine('backyard');
    machine.fire();
    machine.resolveShot(false, false);
    expect(machine.state).toBe('result');
    
    machine.startAiming();
    machine.fire();
    machine.resolveShot(true, true);
    
    expect(machine.state).toBe('solo_result');
    expect(machine.result).toEqual({ success: true, shotsUsed: 2, stars: 2, hasStyle: true });
  });

  it('handles failure after 3 missed shots', () => {
    const machine = new SoloChallengeMachine('backyard');
    
    machine.fire();
    machine.resolveShot(false, false);
    expect(machine.state).toBe('result');
    expect(machine.attemptsLeft).toBe(2);
    
    machine.startAiming();
    machine.fire();
    machine.resolveShot(false, false);
    expect(machine.state).toBe('result');
    expect(machine.attemptsLeft).toBe(1);

    machine.startAiming();
    machine.fire();
    machine.resolveShot(false, false); // Hat only or miss
    expect(machine.state).toBe('solo_result');
    expect(machine.result).toEqual({ success: false, shotsUsed: 3, stars: 0, hasStyle: false });
  });

  it('retry cleans the state', () => {
    const machine = new SoloChallengeMachine('backyard');
    machine.fire();
    machine.resolveShot(true, false);
    machine.retry();
    
    expect(machine.state).toBe('aiming');
    expect(machine.attemptsLeft).toBe(3);
    expect(machine.result).toBeNull();
  });
});
