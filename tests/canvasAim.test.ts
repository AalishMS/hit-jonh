import { describe, expect, it } from 'vitest';
import { angleFromDrag } from '../src/input/canvasAim';

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
