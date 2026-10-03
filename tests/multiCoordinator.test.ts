import { describe, it, expect, vi } from 'vitest';
import { MultiCoordinator } from '../src/rules/multiCoordinator';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';
import { MultiplayerMatchMachine } from '../src/rules/multiplayerMatch';
import { AIM, PHYSICS } from '../src/config/tuning';

describe('MultiCoordinator', () => {
  function makeCoordinator() {
    const attempt = new ShotAttemptMachine(25.6, 0.05, 0.5, 15, 1.0);
    const multi = new MultiplayerMatchMachine([
      { name: 'Alice', color: 0xff4444, pattern: 'solid', lastAngle: 45, lastPower: 50 },
      { name: 'Bob', color: 0x4444ff, pattern: 'stripes', lastAngle: 30, lastPower: 60 },
    ]);
    const callbacks = {
      onStateChange: vi.fn(),
      onShotFired: vi.fn(),
    };
    const coord = new MultiCoordinator(attempt, multi, callbacks);
    return { attempt, multi, callbacks, coord };
  }

  it('enforces handover and aiming state gates', () => {
    const { attempt, multi, callbacks, coord } = makeCoordinator();

    // Initial state: handover
    expect(multi.state).toBe('handover');
    expect(coord.canFire()).toBe(false);
    expect(coord.canAdjustAim()).toBe(false);

    // Fire/aim adjustments ignored during handover
    coord.fire(45, 50);
    expect(callbacks.onShotFired).not.toHaveBeenCalled();
    expect(coord.adjustAim(45, 50, 5, 5)).toBeNull();

    // Begin turn: handover -> aiming
    coord.beginTurn(45, 50);
    expect(multi.state).toBe('aiming');
    expect(attempt.state).toBe('aiming');
    expect(coord.canFire()).toBe(true);
    expect(coord.canAdjustAim()).toBe(true);

    // Adjust aim within bounds
    const adjusted = coord.adjustAim(45, 50, 10, -10);
    expect(adjusted).toEqual({ angle: 55, power: 40 });
    expect(attempt.angleDeg).toBe(55);
    expect(attempt.powerPercent).toBe(40);
    expect(multi.activePlayer.lastAngle).toBe(55);
    expect(multi.activePlayer.lastPower).toBe(40);

    // Clamps to bounds
    const clamped = coord.adjustAim(80, 95, 20, 20);
    expect(clamped).toEqual({ angle: AIM.maxAngleDeg, power: 100 });
  });

  it('coordinates fire, simulation guard, step resolution and handover reset', () => {
    const { attempt, multi, callbacks, coord } = makeCoordinator();
    coord.beginTurn(45, 50);

    // Fire saves aim, locks inputs, notifies callbacks
    coord.fire(55, 60);
    expect(callbacks.onShotFired).toHaveBeenCalledWith(55, 60);
    expect(multi.state).toBe('simulating');
    expect(attempt.state).toBe('simulating');
    expect(coord.canFire()).toBe(false);
    expect(coord.canAdjustAim()).toBe(false);
    expect(coord.canReset()).toBe(false);

    // Cannot resolve score while attempt machine is still simulating
    expect(coord.resolveShot('body')).toBe(false);
    expect(multi.state).toBe('simulating');

    // Resolve attempt via production ShotAttemptMachine.step (no private property edits or @ts-expect-error)
    const stepResult = attempt.step(PHYSICS.fixedStepSeconds, {
      x: 18,
      y: 2.5,
      speed: 10,
      hitBody: true,
      hitHat: false,
    });
    expect(stepResult.resolved).toBe(true);
    expect(attempt.state).toBe('resolved');

    // Now coordinator can resolve score to 'result'
    expect(coord.resolveShot('body')).toBe(true);
    expect(multi.state).toBe('result');
    expect(multi.players[0]!.totalScore).toBe(100);

    // Duplicate scoring rejected
    expect(coord.resolveShot('body')).toBe(false);
    expect(multi.players[0]!.totalScore).toBe(100);

    // While in result state, cannot fire or adjust aim
    expect(coord.canFire()).toBe(false);
    expect(coord.canAdjustAim()).toBe(false);

    // Reset from result advances to next player's handover
    coord.reset(30, 60);
    expect(multi.state).toBe('handover');
    expect(multi.activePlayer.name).toBe('Bob');
    expect(attempt.state).toBe('aiming');
  });

  it('routes final shot of round to round_result on reset', () => {
    const { attempt, multi, coord } = makeCoordinator();
    // 2 players * 3 shots = 6 shots total
    for (let shot = 0; shot < 6; shot++) {
      coord.beginTurn(45, 50);
      coord.fire(45, 50);
      attempt.step(PHYSICS.fixedStepSeconds, {
        x: 18,
        y: 2.5,
        speed: 10,
        hitBody: true,
      });
      coord.resolveShot('body');

      if (shot < 5) {
        expect(multi.state).toBe('result');
        coord.reset(45, 50);
        expect(multi.state).toBe('handover');
      }
    }

    // Shot 6 just resolved to 'result'
    expect(multi.state).toBe('result');
    expect(multi.isRoundComplete).toBe(true);

    // Resetting from final shot of round transitions to round_result
    coord.reset(45, 50);
    expect(multi.state).toBe('round_result');
  });
});
