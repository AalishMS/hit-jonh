import { clamp } from './easing';

/** A camera framing: world-space centre and zoom. */
export interface Frame { cx: number; cy: number; zoom: number }
export interface Point { x: number; y: number }

/**
 * The world rectangle the resting camera shows: `width` × `height` world px whose bottom edge is
 * world y `bottom` (default `height`), seen at camera zoom `zoom` (default 1). The screen is
 * always `width·zoom` × `height·zoom` px; zoomed-out maps just show more world.
 */
export interface Viewport { width: number; height: number; bottom?: number; zoom?: number }

const baseZoom = (view: Viewport) => view.zoom ?? 1;
const bottomOf = (view: Viewport) => view.bottom ?? view.height;

/**
 * The resting view for a map `levelWidthPx` wide on a `screen`-sized canvas: the design view for
 * ordinary maps, zoomed out (bottom-anchored, same aspect) for wider ones.
 */
export function levelView(levelWidthPx: number, screen: { width: number; height: number }): Viewport {
  if (levelWidthPx <= screen.width) return { width: screen.width, height: screen.height };
  const zoom = screen.width / levelWidthPx;
  return { width: levelWidthPx, height: screen.height / zoom, bottom: screen.height, zoom };
}

/** The full playfield, exactly as the original fixed camera showed it. */
export function aimFrame(view: Viewport): Frame {
  return { cx: view.width / 2, cy: bottomOf(view) - view.height / 2, zoom: baseZoom(view) };
}

/**
 * Keeps the frame inside the drawn world horizontally and never shows below the ground strip.
 * Upward is open (the sky continues), so high flights can be framed. `margin` is in screen px.
 */
export function clampFrame(frame: Frame, view: Viewport, margin = 0): Frame {
  const zoom = frame.zoom;
  const base = baseZoom(view);
  const halfW = (view.width * base) / 2 / zoom;
  const halfH = (view.height * base) / 2 / zoom;
  const m = margin / base;
  const minX = -m + halfW;
  const maxX = view.width + m - halfW;
  const cx = minX > maxX ? view.width / 2 : clamp(frame.cx, minX, maxX);
  const cy = Math.min(frame.cy, bottomOf(view) - halfH);
  return { cx, cy, zoom };
}

/**
 * Flight: a gentle zoom-in that follows the ball horizontally and widens to include Jonh as the
 * ball approaches; zooms out (bottom-anchored) when the ball climbs above the view. Zooms are
 * relative to the map's resting zoom.
 */
export function flightFrame(ball: Point, target: Point, view: Viewport, followZoom: number, minZoom: number): Frame {
  const base = baseZoom(view);
  const bottom = bottomOf(view);
  const screenH = view.height * base;
  const topNeeded = Math.min(ball.y, target.y - 120 / base) - 70 / base;
  // Zoom so that [topNeeded, bottom] fits vertically.
  const fitZoom = screenH / Math.max(1, bottom - topNeeded);
  const zoom = clamp(Math.min(followZoom * base, fitZoom), minZoom * base, followZoom * base);
  const near = clamp(1 - Math.abs(target.x - ball.x) / (view.width * 0.55), 0, 1);
  const cx = ball.x + (((ball.x + target.x) / 2) - ball.x) * near;
  const cy = bottom - screenH / 2 / zoom;
  return clampFrame({ cx, cy, zoom }, view, 220);
}

/**
 * Close-up zoom for impacts and replays. On zoomed-out maps it scales with the square root of the
 * resting zoom, so a tiny far-away Jonh still gets a real close-up without a dizzying plunge.
 */
export function closeUpZoom(zoom: number, view: Viewport): number {
  return zoom * Math.sqrt(baseZoom(view));
}

/** Impact: punch in on Jonh (biased toward where he is knocked). */
export function impactFrame(target: Point, dir: number, view: Viewport, zoom: number): Frame {
  return clampFrame({ cx: target.x + dir * 40, cy: target.y - 55, zoom: closeUpZoom(zoom, view) }, view);
}

/** Replay: close follow of the ball. */
export function replayFrame(ball: Point, view: Viewport, zoom: number): Frame {
  return clampFrame({ cx: ball.x, cy: ball.y - 20, zoom: closeUpZoom(zoom, view) }, view, 220);
}
