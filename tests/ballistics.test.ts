import { describe, expect, it } from 'vitest';
import {
  analyticLandingX,
  analyticPosition,
  flightTimeToAltitude,
} from '../src/sim/ballistics';

describe('ballistics', () => {
  const g = 9.81;

  it('calculates position at time t', () => {
    // Launch at 10 m/s, 45 deg, from (0, 0)
    const angle = (45 * Math.PI) / 180;
    const v = 10;
    const vx = v * Math.cos(angle);
    const vy = v * Math.sin(angle);

    const pos0 = analyticPosition(0, 0, 0, vx, vy, g);
    expect(pos0.x).toBeCloseTo(0);
    expect(pos0.y).toBeCloseTo(0);

    const pos1 = analyticPosition(1, 0, 0, vx, vy, g);
    expect(pos1.x).toBeCloseTo(vx * 1);
    expect(pos1.y).toBeCloseTo(vy * 1 - 0.5 * g * 1 * 1);
  });

  it('calculates time to reach altitude', () => {
    // Launch vertically at 19.62 m/s from y = 0
    // At apex (t = 2s), y = 19.62 * 2 - 0.5 * 9.81 * 4 = 19.62 m
    // Lands back at y = 0 at t = 4s
    const tLand = flightTimeToAltitude(0, 19.62, 0, g);
    expect(tLand).toBeCloseTo(4);
  });

  it('calculates landing position on level ground', () => {
    // Flat 45 deg launch at 14 m/s from y = 1.6 to y = 1.6:
    // Range R = v^2 * sin(2 * 45) / g = 196 / 9.81 ≈ 19.9796 m
    const xLanding = analyticLandingX(2.5, 1.6, 14, 45, 1.6, g);
    expect(xLanding).toBeCloseTo(2.5 + (14 * 14) / g, 3);
  });
});
