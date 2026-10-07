import { clamp } from './easing';

/** A camera framing: world-space centre and zoom. */
export interface Frame { cx: number; cy: number; zoom: number }
export interface Point { x: number; y: number }

export interface Viewport { width: number; height: number }

/** The full playfield, exactly as the original fixed camera showed it. */
export function aimFrame(view: Viewport): Frame {
  return { cx: view.width / 2, cy: view.height / 2, zoom: 1 };
}

/**
 * Keeps the frame inside the drawn world horizontally and never shows below the ground strip.
 * Upward is open (the sky continues), so high flights can be framed.
 */
export function clampFrame(frame: Frame, view: Viewport, margin = 0): Frame {
  const zoom = frame.zoom;
  const halfW = view.width / 2 / zoom;
  const halfH = view.height / 2 / zoom;
  const minX = -margin + halfW;
  const maxX = view.width + margin - halfW;
  const cx = minX > maxX ? view.width / 2 : clamp(frame.cx, minX, maxX);
  const cy = Math.min(frame.cy, view.height - halfH);
  return { cx, cy, zoom };
}

/**
 * Flight: a gentle zoom-in that follows the ball horizontally and widens to include Jonh as the
 * ball approaches; zooms out (bottom-anchored) when the ball climbs above the view.
 */
export function flightFrame(ball: Point, target: Point, view: Viewport, followZoom: number, minZoom: number): Frame {
  const topNeeded = Math.min(ball.y, target.y - 120) - 70;
  // Zoom so that [topNeeded, height] fits vertically.
  const fitZoom = view.height / Math.max(1, view.height - topNeeded);
  const zoom = clamp(Math.min(followZoom, fitZoom), minZoom, followZoom);
  const near = clamp(1 - Math.abs(target.x - ball.x) / (view.width * 0.55), 0, 1);
  const cx = ball.x + (((ball.x + target.x) / 2) - ball.x) * near;
  const cy = view.height - view.height / 2 / zoom;
  return clampFrame({ cx, cy, zoom }, view, 220);
}

/** Impact: punch in on Jonh (biased toward where he is knocked). */
export function impactFrame(target: Point, dir: number, view: Viewport, zoom: number): Frame {
  return clampFrame({ cx: target.x + dir * 40, cy: target.y - 55, zoom }, view);
}

/** Replay: close follow of the ball. */
export function replayFrame(ball: Point, view: Viewport, zoom: number): Frame {
  return clampFrame({ cx: ball.x, cy: ball.y - 20, zoom }, view, 220);
}
