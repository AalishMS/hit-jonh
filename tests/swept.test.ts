import { describe, expect, it } from 'vitest';
import { sweepCircleVsBox, type Box2D } from '../src/sim/swept';

describe('swept circle collision', () => {
  const box: Box2D = {
    minX: 10,
    maxX: 12,
    minY: 0,
    maxY: 4,
  };
  const radius = 0.5;

  it('detects head-on collision before passing through box', () => {
    // Circle moves from x=8 to x=15 (tunnels through box if stepped discretely)
    const hit = sweepCircleVsBox(
      { x: 8, y: 2 },
      { x: 15, y: 2 },
      radius,
      box,
    );

    expect(hit).not.toBeNull();
    if (hit) {
      // Circle contacts left edge: x_contact_center = box.minX - radius = 9.5
      // t = (9.5 - 8) / (15 - 8) = 1.5 / 7 ≈ 0.2142857
      expect(hit.t).toBeCloseTo(1.5 / 7, 5);
      expect(hit.point.x).toBeCloseTo(9.5, 5);
      expect(hit.point.y).toBeCloseTo(2, 5);
      expect(hit.normal.x).toBeCloseTo(-1, 5);
      expect(hit.normal.y).toBeCloseTo(0, 5);
    }
  });

  it('detects no collision when path misses the box', () => {
    const hit = sweepCircleVsBox(
      { x: 8, y: 6 },
      { x: 15, y: 6 },
      radius,
      box,
    );
    expect(hit).toBeNull();
  });

  it('detects collision when starting already touching/overlapping', () => {
    const hit = sweepCircleVsBox(
      { x: 9.6, y: 2 },
      { x: 10.5, y: 2 },
      radius,
      box,
    );
    expect(hit).not.toBeNull();
    expect(hit?.t).toBe(0);
  });

  it('detects rounded corner collision', () => {
    // Circle travels diagonally aiming near the top-left corner (10, 4)
    const hit = sweepCircleVsBox(
      { x: 8, y: 5 },
      { x: 11, y: 2 },
      radius,
      box,
    );
    expect(hit).not.toBeNull();
    expect(hit?.t).toBeGreaterThan(0);
    expect(hit?.t).toBeLessThan(1);
  });
});
