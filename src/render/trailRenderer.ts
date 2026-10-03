import type Phaser from 'phaser';

export class TrailRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private points: Array<{ x: number; y: number }> = [];
  private landingMarker: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(5);
  }

  addPoint(x: number, y: number): void {
    const last = this.points[this.points.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) >= 8) {
      this.points.push({ x, y });
      this.redraw();
    }
  }

  setLandingMarker(x: number, y: number): void {
    this.landingMarker = { x, y };
    this.redraw();
  }

  clear(): void {
    this.points = [];
    this.landingMarker = null;
    this.graphics.clear();
  }

  private redraw(): void {
    this.graphics.clear();

    // 1. Trail dots
    if (this.points.length > 1) {
      this.graphics.lineStyle(2, 0xe8572a, 0.4);
      this.graphics.beginPath();
      this.graphics.moveTo(this.points[0]!.x, this.points[0]!.y);
      for (let i = 1; i < this.points.length; i++) {
        this.graphics.lineTo(this.points[i]!.x, this.points[i]!.y);
      }
      this.graphics.strokePath();

      // Individual dots
      this.graphics.fillStyle(0xe8572a, 0.6);
      for (let i = 0; i < this.points.length; i += 2) {
        this.graphics.fillCircle(this.points[i]!.x, this.points[i]!.y, 2.5);
      }
    }

    // 2. Landing marker
    if (this.landingMarker) {
      const { x, y } = this.landingMarker;
      this.graphics.lineStyle(2, 0xe8572a, 0.8);
      // Small crosshair
      this.graphics.lineBetween(x - 8, y, x + 8, y);
      this.graphics.lineBetween(x, y - 8, x, y + 8);
      this.graphics.strokeCircle(x, y, 6);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
