import { describe, expect, it } from 'vitest';
import {
  launchVelocityToWorld,
  matterGravityY,
  matterVelocityToSpeedMs,
  metresToPixels,
  pixelsToMetres,
  powerToLaunchSpeed,
  simYToWorldY,
  speedMsToMatterVelocity,
  worldYToSimY,
} from '../src/sim/units';

describe('units', () => {
  it('round-trips metres and pixels', () => {
    expect(pixelsToMetres(metresToPixels(3.2, 50), 50)).toBeCloseTo(3.2);
  });

  it('flips y between simulation (up) and world (down)', () => {
    expect(simYToWorldY(0, 720, 50)).toBe(720);
    expect(simYToWorldY(2, 720, 50)).toBe(620);
    expect(worldYToSimY(620, 720, 50)).toBeCloseTo(2);
  });

  it('derives Matter gravity.y from SI gravity', () => {
    // 9.81 m/s² at 50 px/m = 4.905e-4 px/ms²; with scale 0.001 → 0.4905
    expect(matterGravityY(9.81, 50, 0.001)).toBeCloseTo(0.4905, 6);
  });

  it('maps power percentage linearly through impulse to speed and clamps', () => {
    expect(powerToLaunchSpeed(0, 20, 120, 4)).toBe(5);
    expect(powerToLaunchSpeed(100, 20, 120, 4)).toBe(30);
    expect(powerToLaunchSpeed(50, 20, 120, 4)).toBe(17.5);
    expect(powerToLaunchSpeed(150, 20, 120, 4)).toBe(30);
  });

  it('converts between m/s and Matter base-step velocity', () => {
    // 12 m/s at 50 px/m = 600 px/s = 10 px per (1000/60) ms base step
    expect(speedMsToMatterVelocity(12, 50)).toBeCloseTo(10);
    expect(matterVelocityToSpeedMs(10, 50)).toBeCloseTo(12);
  });

  it('computes world launch velocity components from speed and angle', () => {
    // 12 m/s at 0 deg: vx = 10, vy = 0 (world down is positive, so 0 deg is horizontal right)
    const v0 = launchVelocityToWorld(12, 0, 50);
    expect(v0.x).toBeCloseTo(10);
    expect(v0.y).toBeCloseTo(0);

    // 12 m/s at 90 deg: vx = 0, vy = -10 (up in world is negative y)
    const v90 = launchVelocityToWorld(12, 90, 50);
    expect(v90.x).toBeCloseTo(0);
    expect(v90.y).toBeCloseTo(-10);
  });
});
