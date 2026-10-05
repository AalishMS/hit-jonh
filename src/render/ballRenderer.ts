import type Phaser from 'phaser';
import { JUICE, LOOK, WORLD } from '../config/tuning';

export class BallRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private visible = false;

  constructor(
    scene: Phaser.Scene,
    private readonly radiusPx: number,
  ) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(20);
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.graphics.setVisible(visible);
    if (!visible) {
      this.graphics.clear();
    }
  }

  draw(xPx: number, yPx: number, squash = 0): void {
    if (!this.visible) this.setVisible(true);

    this.graphics.clear();

    if (yPx < 0) {
      const x = Math.max(12, Math.min(WORLD.designWidthPx - 12, xPx));
      this.graphics.fillStyle(LOOK.ink);
      this.graphics.fillTriangle(x, 8, x - 7, 20, x + 7, 20);
      this.graphics.fillStyle(LOOK.paper);
      this.graphics.fillCircle(x, 30, this.radiusPx);
      this.graphics.lineStyle(2, LOOK.ink);
      this.graphics.strokeCircle(x, 30, this.radiusPx);
      return;
    }

    this.graphics.save();
    this.graphics.translateCanvas(xPx, yPx);
    this.graphics.scaleCanvas(1 + squash * JUICE.squashAmount, 1 - squash * JUICE.squashAmount);
    xPx = 0; yPx = 0;

    // Dark iron ball
    this.graphics.fillStyle(0x22262c, 1);
    this.graphics.lineStyle(2, 0x111316, 1);
    this.graphics.fillCircle(xPx, yPx, this.radiusPx);
    this.graphics.strokeCircle(xPx, yPx, this.radiusPx);

    // Specular shine highlight
    this.graphics.fillStyle(0x778899, 0.8);
    this.graphics.fillCircle(xPx - this.radiusPx * 0.35, yPx - this.radiusPx * 0.35, this.radiusPx * 0.3);
    this.graphics.restore();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
