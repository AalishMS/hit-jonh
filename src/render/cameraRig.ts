import type Phaser from 'phaser';
import { WORLD } from '../config/tuning';
import { aimFrame, clampFrame, type Frame } from '../fx/cameraDirector';
import { approach, dampedWave } from '../fx/easing';
import { shakeOffset } from '../fx/impactProfile';

const VIEW = { width: WORLD.designWidthPx, height: WORLD.designHeightPx };

/**
 * Applies smoothed framing plus impact shake and zoom punch to the main camera.
 * Driven by real (unscaled) presentation time, so the punch-in happens during the hit-stop.
 */
export class CameraRig {
  private frame: Frame = aimFrame(VIEW);
  private shake: { age: number; amp: number; dur: number; hz: number; dx: number; dy: number } | null = null;
  private punch: { age: number; amount: number; dur: number } | null = null;

  constructor(private readonly camera: Phaser.Cameras.Scene2D.Camera) {
    this.snap(aimFrame(VIEW));
  }

  get current(): Frame { return this.frame; }

  impact(shakePx: number, shakeSeconds: number, hz: number, dirX: number, dirY: number, punch: number, punchSeconds: number): void {
    this.shake = shakePx > 0 ? { age: 0, amp: shakePx, dur: shakeSeconds, hz, dx: dirX, dy: dirY } : null;
    this.punch = punch > 0 ? { age: 0, amount: punch, dur: punchSeconds } : null;
  }

  /** Moves toward `target` at `rate` (1/s); reduced motion pins the original full view. */
  update(realDt: number, target: Frame, rate: number, reduced: boolean): void {
    if (reduced) {
      this.shake = null;
      this.punch = null;
      this.snap(aimFrame(VIEW));
      return;
    }
    const goal = clampFrame(target, VIEW, 220);
    this.frame = {
      cx: approach(this.frame.cx, goal.cx, rate, realDt),
      cy: approach(this.frame.cy, goal.cy, rate, realDt),
      zoom: approach(this.frame.zoom, goal.zoom, rate, realDt),
    };
    let zoom = this.frame.zoom;
    let ox = 0;
    let oy = 0;
    if (this.punch) {
      this.punch.age += realDt;
      // Overshoots in, then settles with a small wobble.
      zoom *= 1 + this.punch.amount * Math.max(0, dampedWave(this.punch.age, 1.6, 7));
      if (this.punch.age >= this.punch.dur * 2) this.punch = null;
    }
    if (this.shake) {
      this.shake.age += realDt;
      const o = shakeOffset(this.shake.age, this.shake.amp, this.shake.dur, this.shake.hz, this.shake.dx, this.shake.dy);
      ox = o.x / zoom;
      oy = o.y / zoom;
      if (this.shake.age >= this.shake.dur) this.shake = null;
    }
    this.apply(this.frame.cx + ox, this.frame.cy + oy, zoom);
  }

  snap(frame: Frame): void {
    this.frame = { ...frame };
    this.apply(frame.cx, frame.cy, frame.zoom);
  }

  /** Restores the exact original camera (zoom 1, scroll 0,0) and clears effects. */
  reset(): void {
    this.shake = null;
    this.punch = null;
    this.snap(aimFrame(VIEW));
  }

  private apply(cx: number, cy: number, zoom: number): void {
    this.camera.setZoom(zoom);
    this.camera.centerOn(cx, cy);
  }
}
