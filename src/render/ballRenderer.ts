import type Phaser from 'phaser';

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

  draw(xPx: number, yPx: number): void {
    if (!this.visible) this.setVisible(true);

    this.graphics.clear();

    // Dark iron ball
    this.graphics.fillStyle(0x22262c, 1);
    this.graphics.lineStyle(2, 0x111316, 1);
    this.graphics.fillCircle(xPx, yPx, this.radiusPx);
    this.graphics.strokeCircle(xPx, yPx, this.radiusPx);

    // Specular shine highlight
    this.graphics.fillStyle(0x778899, 0.8);
    this.graphics.fillCircle(xPx - this.radiusPx * 0.35, yPx - this.radiusPx * 0.35, this.radiusPx * 0.3);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
