import { describe, expect, it } from 'vitest';
import { aimFrame, clampFrame, flightFrame, impactFrame, replayFrame } from '../src/fx/cameraDirector';

const VIEW = { width: 1280, height: 560 };
const bottom = (f: { cy: number; zoom: number }) => f.cy + VIEW.height / 2 / f.zoom;

describe('Camera director', () => {
  it('aims with the original full view', () => {
    expect(aimFrame(VIEW)).toEqual({ cx: 640, cy: 280, zoom: 1 });
  });

  it('never shows below the ground strip and stays inside the drawn world', () => {
    for (const zoom of [0.72, 1, 1.6, 2.2]) {
      for (const cx of [-500, 0, 640, 1500]) {
        for (const cy of [-400, 100, 280, 900]) {
          const f = clampFrame({ cx, cy, zoom }, VIEW, 220);
          expect(bottom(f)).toBeLessThanOrEqual(VIEW.height + 1e-9);
          if (zoom >= 1) {
            expect(f.cx - VIEW.width / 2 / zoom).toBeGreaterThanOrEqual(-220 - 1e-9);
            expect(f.cx + VIEW.width / 2 / zoom).toBeLessThanOrEqual(VIEW.width + 220 + 1e-9);
          }
        }
      }
    }
  });

  it('zooms out to keep a high ball in view, but not past the minimum', () => {
    const low = flightFrame({ x: 400, y: 300 }, { x: 900, y: 470 }, VIEW, 1.15, 0.72);
    const high = flightFrame({ x: 600, y: -150 }, { x: 900, y: 470 }, VIEW, 1.15, 0.72);
    const stratosphere = flightFrame({ x: 600, y: -5000 }, { x: 900, y: 470 }, VIEW, 1.15, 0.72);
    expect(low.zoom).toBeCloseTo(1.15);
    expect(high.zoom).toBeLessThan(1);
    expect(high.cy - VIEW.height / 2 / high.zoom).toBeLessThanOrEqual(-150);
    expect(stratosphere.zoom).toBeCloseTo(0.72);
  });

  it('punches in on Jonh and follows the ball in the replay', () => {
    const f = impactFrame({ x: 700, y: 480 }, 1, VIEW, 1.6);
    expect(f.zoom).toBe(1.6);
    expect(Math.abs(f.cx - 740)).toBeLessThan(1);
    expect(impactFrame({ x: 1250, y: 480 }, 1, VIEW, 1.6).cx).toBeCloseTo(1280 - 400);
    expect(bottom(f)).toBeLessThanOrEqual(VIEW.height + 1e-9);
    const r = replayFrame({ x: 700, y: 200 }, VIEW, 2);
    expect(r.cx).toBe(700);
  });
});
