import type Phaser from 'phaser';
import { FX, WORLD } from '../config/tuning';
import { dampedWave } from '../fx/easing';
import { artScale } from './artTextures';

/**
 * The cannonball sprite. It stretches along its velocity in flight and squashes against the
 * contact normal on impact. Purely cosmetic; the collider radius is unchanged.
 */
export class BallRenderer {
  private readonly ball: Phaser.GameObjects.Image;
  private readonly marker: Phaser.GameObjects.Image;
  private readonly arrow: Phaser.GameObjects.Triangle;
  private visible = false;
  private squashAge: number | null = null;
  private squashDir = 0;
  private squashAmount = 0;

  constructor(scene: Phaser.Scene, private readonly radiusPx: number) {
    this.ball = scene.add.image(0, 0, 'ball').setDepth(20).setVisible(false);
    this.marker = scene.add.image(0, 0, 'ball').setDepth(41).setVisible(false).setScrollFactor(0);
    this.arrow = scene.add.triangle(0, 0, 0, 10, 8, -4, -8, -4, 0x2a1b2e).setDepth(41).setVisible(false).setScrollFactor(0);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.ball.setVisible(visible);
    if (!visible) { this.marker.setVisible(false); this.arrow.setVisible(false); this.squashAge = null; }
  }

  /** Starts a contact squash (amount 0..1) against travel direction `angle` (radians). */
  squash(angle: number, amount: number): void {
    this.squashAge = 0;
    this.squashDir = angle;
    this.squashAmount = amount;
  }

  /** @param dt presentation seconds for the squash timeline */
  draw(xPx: number, yPx: number, vx = 0, vy = 0, dt = 0, reduced = false, maxSpeed = 1): void {
    if (!this.visible) this.setVisible(true);
    const base = artScale('ball') * (this.radiusPx / 7.5);
    let angle = Math.atan2(vy, vx);
    let sx = 1;
    let sy = 1;
    if (!reduced) {
      const stretch = Math.min(1, Math.hypot(vx, vy) / maxSpeed) * FX.ballStretch;
      sx = 1 + stretch;
      sy = 1 - stretch * 0.45;
    }
    if (this.squashAge !== null && !reduced) {
      this.squashAge += dt;
      const w = dampedWave(this.squashAge, 7, 14);
      angle = this.squashDir;
      sx = 1 - 0.45 * this.squashAmount * w;
      sy = 1 + 0.3 * this.squashAmount * w;
      if (this.squashAge > 0.35) this.squashAge = null;
    }
    this.ball.setPosition(xPx, yPx).setRotation(angle).setScale(base * sx, base * sy);

    // Off-screen indicator when the ball is above the camera view.
    const cam = this.ball.scene.cameras.main;
    const view = cam.worldView;
    const above = yPx < view.y - this.radiusPx;
    this.marker.setVisible(above);
    this.arrow.setVisible(above);
    if (above) {
      // Scroll-factor-0 objects are still zoomed about the view centre; undo that.
      const z = cam.zoom;
      const hw = WORLD.designWidthPx / 2;
      const hh = WORLD.designHeightPx / 2;
      const sxScreen = Math.max(18, Math.min(WORLD.designWidthPx - 18, (xPx - view.x) * z));
      this.marker.setPosition((sxScreen - hw) / z + hw, (34 - hh) / z + hh).setScale((base * 1.2) / z);
      this.arrow.setPosition((sxScreen - hw) / z + hw, (14 - hh) / z + hh).setScale(1 / z).setRotation(Math.PI);
    }
  }

  destroy(): void {
    this.ball.destroy();
    this.marker.destroy();
    this.arrow.destroy();
  }
}
