import { describe, expect, it } from 'vitest';
import { aimFromCannonPoint, angleFromDrag, lockAxis, powerFromDrag } from '../src/input/canvasAim';

describe('Canvas drag aiming', () => {
  it('raises the cannon on an upward drag and lowers it on a downward drag', () => {
    expect(angleFromDrag(45, -0.1)).toBe(61);
    expect(angleFromDrag(45, 0.1)).toBe(29);
    expect(angleFromDrag(45, 0)).toBe(45);
  });

  it('uses the same fraction at desktop and phone sizes, bounded to whole degrees', () => {
    expect(angleFromDrag(45, -56 / 560)).toBe(angleFromDrag(45, -28 / 280));
    expect(angleFromDrag(45, -1)).toBe(85);
    expect(angleFromDrag(45, 1)).toBe(5);
    expect(Number.isInteger(angleFromDrag(45, 0.031))).toBe(true);
  });
});

describe('In-world aiming', () => {
  it('adds power when dragging right, bounded to whole percent', () => {
    expect(powerFromDrag(50, 0.1)).toBe(66);
    expect(powerFromDrag(50, -0.1)).toBe(34);
    expect(powerFromDrag(50, 5)).toBe(100);
    expect(powerFromDrag(50, -5)).toBe(0);
    expect(Number.isInteger(powerFromDrag(50, 0.0313))).toBe(true);
  });

  it('locks a relative drag to the dominant axis after a small threshold', () => {
    expect(lockAxis(0.005, 0.005)).toBeNull();
    expect(lockAxis(0.01, -0.05)).toBe('angle');
    expect(lockAxis(0.05, 0.01)).toBe('power');
  });

  it('points a grabbed cannon at the pointer with distance as power', () => {
    const pivot = { x: 125, y: 450 };
    const up45 = aimFromCannonPoint(pivot, { x: 125 + 200, y: 450 - 200 });
    expect(up45.angle).toBe(45);
    expect(up45.power).toBe(Math.round(((Math.hypot(200, 200) - 60) / (380 - 60)) * 100));
    expect(aimFromCannonPoint(pivot, { x: 0, y: 450 }).angle).toBe(5);
    expect(aimFromCannonPoint(pivot, { x: 125, y: 0 }).angle).toBe(85);
    expect(aimFromCannonPoint(pivot, { x: 130, y: 445 }).power).toBe(0);
    expect(aimFromCannonPoint(pivot, { x: 1000, y: 0 }).power).toBe(100);
  });
});
