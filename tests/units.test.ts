import { describe, expect, it } from 'vitest';
import {
  matterGravityY,
  metresToPixels,
  pixelsToMetres,
  powerToLaunchSpeed,
  simYToWorldY,
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
});
