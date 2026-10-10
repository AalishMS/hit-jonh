import { describe, expect, it } from 'vitest';
import { aimFrame, clampFrame, flightFrame, impactFrame, levelView, replayFrame } from '../src/fx/cameraDirector';

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

describe('levelView (zoomed-out maps)', () => {
  const screen = { width: 1280, height: 560 };

  it('keeps the design view for maps that fit the canvas', () => {
    expect(levelView(1280, screen)).toEqual({ width: 1280, height: 560 });
    expect(levelView(900, screen)).toEqual({ width: 1280, height: 560 });
  });

  it('zooms out wider maps, bottom-anchored with the same aspect', () => {
    const view = levelView(3200, screen);
    expect(view.zoom).toBeCloseTo(0.4);
    expect(view.width).toBe(3200);
    expect(view.height).toBeCloseTo(1400);
    expect(view.bottom).toBe(560);
    const rest = aimFrame(view);
    expect(rest).toEqual({ cx: 1600, cy: 560 - 700, zoom: 0.4 });
    // The resting frame is already inside the clamp.
    expect(clampFrame(rest, view, 220)).toEqual(rest);
  });

  it('never shows below the ground strip or beyond the map sides', () => {
    const view = levelView(3200, screen);
    const f = clampFrame({ cx: -5000, cy: 5000, zoom: 0.8 }, view);
    const halfW = 1280 / 2 / 0.8;
    const halfH = 560 / 2 / 0.8;
    expect(f.cx).toBeCloseTo(halfW);
    expect(f.cy + halfH).toBeCloseTo(560);
  });

  it('flight and close-up zooms are relative to the resting zoom', () => {
    const view = levelView(3200, screen);
    const flight = flightFrame({ x: 400, y: 300 }, { x: 2800, y: 300 }, view, 1.15, 0.72);
    expect(flight.zoom).toBeGreaterThanOrEqual(0.72 * 0.4 - 1e-9);
    expect(flight.zoom).toBeLessThanOrEqual(1.15 * 0.4 + 1e-9);
    expect(impactFrame({ x: 2800, y: 300 }, 1, view, 1.6).zoom).toBeCloseTo(1.6 * Math.sqrt(0.4));
  });

  it('is the identity on ordinary maps', () => {
    const design = { width: 1280, height: 560 };
    const view = levelView(1280, screen);
    const ball = { x: 500, y: 100 };
    const jonh = { x: 900, y: 400 };
    expect(flightFrame(ball, jonh, view, 1.15, 0.72)).toEqual(flightFrame(ball, jonh, design, 1.15, 0.72));
    expect(impactFrame(jonh, -1, view, 1.6)).toEqual(impactFrame(jonh, -1, design, 1.6));
  });
});
