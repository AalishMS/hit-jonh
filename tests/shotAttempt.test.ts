import { describe, expect, it } from 'vitest';
import { ShotAttemptMachine } from '../src/rules/shotAttempt';

describe('ShotAttemptMachine', () => {
  const worldWidth = 25.6;

  it('starts in aiming state and accepts fire', () => {
    const machine = new ShotAttemptMachine(worldWidth);
    expect(machine.state).toBe('aiming');
    expect(machine.canFire).toBe(true);

    const fired = machine.fire(45, 50);
    expect(fired).toBe(true);
    expect(machine.state).toBe('simulating');
    expect(machine.canFire).toBe(false);
  });

  it('rejects fire while already simulating', () => {
    const machine = new ShotAttemptMachine(worldWidth);
    machine.fire(45, 50);

    const secondFire = machine.fire(45, 50);
    expect(secondFire).toBe(false);
    expect(machine.state).toBe('simulating');
  });

  it('resolves on hit immediately', () => {
    const machine = new ShotAttemptMachine(worldWidth);
    machine.fire(45, 50);

    const result = machine.step(1 / 120, {
      x: 18,
      y: 2,
      speed: 10,
      hitBody: true,
    });

    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.outcome).toBe('hit');
    }
    expect(machine.state).toBe('resolved');
  });

  it('resolves as out of bounds when projectile flies past horizontal bounds', () => {
    const machine = new ShotAttemptMachine(worldWidth);
    machine.fire(45, 50);

    // Left out of bounds
    const resLeft = machine.step(1 / 120, {
      x: -1.5,
      y: 5,
      speed: 10,
      hitBody: false,
    });
    expect(resLeft.resolved).toBe(true);
    if (resLeft.resolved) {
      expect(resLeft.outcome).toBe('miss');
      if (resLeft.outcome === 'miss') {
        expect(resLeft.reason).toBe('out_of_bounds');
      }
    }

    // Right out of bounds
    const machine2 = new ShotAttemptMachine(worldWidth);
    machine2.fire(45, 50);
    const resRight = machine2.step(1 / 120, {
      x: 27.0,
      y: 5,
      speed: 10,
      hitBody: false,
    });
    expect(resRight.resolved).toBe(true);
    if (resRight.resolved) {
      expect(resRight.outcome).toBe('miss');
      if (resRight.outcome === 'miss') {
        expect(resRight.reason).toBe('out_of_bounds');
      }
    }
  });

  it('resolves as settled when speed stays below threshold for 0.5s', () => {
    const machine = new ShotAttemptMachine(worldWidth);
    machine.fire(45, 50);

    const dt = 1 / 120;
    // 0.4s low speed: not resolved yet
    for (let i = 0; i < 48; i++) {
      const res = machine.step(dt, {
        x: 10,
        y: 1.6,
        speed: 0.02,
        hitBody: false,
      });
      expect(res.resolved).toBe(false);
    }

    // Reach 0.5s: resolves as settled
    let finalRes;
    for (let i = 0; i < 15; i++) {
      finalRes = machine.step(dt, {
        x: 10,
        y: 1.6,
        speed: 0.02,
        hitBody: false,
      });
      if (finalRes.resolved) break;
    }

    expect(finalRes?.resolved).toBe(true);
    if (finalRes && finalRes.resolved) {
      expect(finalRes.outcome).toBe('miss');
      if (finalRes.outcome === 'miss') {
        expect(finalRes.reason).toBe('settled');
      }
    }
  });

  it('resolves on safety timeout after 15 simulated seconds', () => {
    const machine = new ShotAttemptMachine(worldWidth);
    machine.fire(45, 50);

    const dt = 1.0;
    for (let s = 0; s < 14; s++) {
      const res = machine.step(dt, {
        x: 10,
        y: 5,
        speed: 10,
        hitBody: false,
      });
      expect(res.resolved).toBe(false);
    }

    const timeoutRes = machine.step(1.5, {
      x: 10,
      y: 5,
      speed: 10,
      hitBody: false,
    });
    expect(timeoutRes.resolved).toBe(true);
    if (timeoutRes.resolved) {
      expect(timeoutRes.outcome).toBe('miss');
      if (timeoutRes.outcome === 'miss') {
        expect(timeoutRes.reason).toBe('timeout');
      }
    }
  });

  it('resets cleanly back to aiming and preserves aim settings', () => {
    const machine = new ShotAttemptMachine(worldWidth);
    machine.setAim(38, 72);
    machine.fire(38, 72);
    machine.step(1 / 120, { x: 18, y: 2, speed: 5, hitBody: true });

    expect(machine.state).toBe('resolved');
    machine.reset();

    expect(machine.state).toBe('aiming');
    expect(machine.canFire).toBe(true);
    expect(machine.angleDeg).toBe(38);
    expect(machine.powerPercent).toBe(72);
  });
});
