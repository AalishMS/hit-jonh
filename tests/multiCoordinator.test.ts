import { describe, it, expect, vi } from 'vitest';
import { MultiCoordinator } from '../src/rules/multiCoordinator';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { MultiplayerMatchMachine } from '../src/rules/multiplayerMatch';

describe('MultiCoordinator', () => {
  it('handles state transitions properly', () => {
    const attempt = new ShotAttemptMachine(10, 10, 10, 10, 10);
    const multi = new MultiplayerMatchMachine([
      { name: 'A', color: 1, pattern: 'solid', lastAngle: 45, lastPower: 50 },
      { name: 'B', color: 2, pattern: 'solid', lastAngle: 45, lastPower: 50 }
    ]);

    const callbacks = {
      onStateChange: vi.fn(),
      onShotFired: vi.fn()
    };

    const coord = new MultiCoordinator(attempt, multi, callbacks);

    // Initial state: handover
    expect(coord.canFire()).toBe(false);
    expect(coord.canAdjustAim()).toBe(false);

    // Aiming state
    multi.startAiming();
    expect(coord.canFire()).toBe(true);
    expect(coord.canAdjustAim()).toBe(true);

    // Firing triggers shot
    coord.fire(45, 50);
    expect(callbacks.onShotFired).toHaveBeenCalledWith(45, 50);
    expect(coord.canFire()).toBe(false); // attempt machine is no longer in aiming state

    // Resolve shot to 'result'
    coord.resolveShot(100, true);
    // Force attemptMachine to stop simulating so reset() isn't blocked
    // @ts-expect-error test mock
    attempt['_state'] = 'result';
    expect(multi.state).toBe('result');
    

    // Reset should advance multiMachine to next player's handover
    coord.reset(45, 50);
    expect(multi.state).toBe('handover');
    expect(multi.activePlayer.name).toBe('B');
    expect(attempt.state).toBe('aiming');
  });
});




