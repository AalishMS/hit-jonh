import type Phaser from 'phaser';

export interface LandingFeedback {
  x: number;
  y: number;
  label: string;
}

export class TrailRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private activePoints: Array<{ x: number; y: number }> = [];
  private activeLandingMarker: LandingFeedback | null = null;

  private previousPoints: Array<{ x: number; y: number }> = [];
  private previousLandingMarker: LandingFeedback | null = null;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(6);
  }

  /**
   * Called when a new shot is launched. Archives current active trail to previous trail.
   */
  startNewShot(): void {
    if (this.activePoints.length > 0) {
      this.previousPoints = [...this.activePoints];
      this.previousLandingMarker = this.activeLandingMarker ? { ...this.activeLandingMarker } : null;
    }
    this.activePoints = [];
    this.activeLandingMarker = null;
    this.redraw();
  }

  addPoint(x: number, y: number): void {
    const last = this.activePoints[this.activePoints.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) >= 8) {
      this.activePoints.push({ x, y });
      this.redraw();
    }
  }

  setLandingMarker(x: number, y: number, label = ''): void {
    this.activeLandingMarker = { x, y, label };
    this.redraw();
  }

  /**
   * Preserves previous-shot trail and promotes active to previous if completed.
   */
  onAttemptReset(): void {
    if (this.activePoints.length > 0) {
      this.previousPoints = [...this.activePoints];
      this.previousLandingMarker = this.activeLandingMarker ? { ...this.activeLandingMarker } : null;
    }
    this.activePoints = [];
    this.activeLandingMarker = null;
    this.redraw();
  }

  clearAll(): void {
    this.activePoints = [];
    this.activeLandingMarker = null;
    this.previousPoints = [];
    this.previousLandingMarker = null;
    this.graphics.clear();
  }

  private redraw(): void {
    this.graphics.clear();

    // 1. Draw Previous Shot Trajectory (ghost trail for aiming reference)
    if (this.previousPoints.length > 1) {
      this.graphics.lineStyle(2, 0x4a6572, 0.45);
      this.graphics.beginPath();
      this.graphics.moveTo(this.previousPoints[0]!.x, this.previousPoints[0]!.y);
      for (let i = 1; i < this.previousPoints.length; i++) {
        this.graphics.lineTo(this.previousPoints[i]!.x, this.previousPoints[i]!.y);
      }
      this.graphics.strokePath();

      // Ghost dots
      this.graphics.fillStyle(0x344955, 0.5);
      for (let i = 0; i < this.previousPoints.length; i += 2) {
        this.graphics.fillCircle(this.previousPoints[i]!.x, this.previousPoints[i]!.y, 2.5);
      }
    }

    // Previous landing marker (ghost)
    if (this.previousLandingMarker) {
      const { x, y } = this.previousLandingMarker;
      this.graphics.lineStyle(2, 0x344955, 0.6);
      this.graphics.lineBetween(x - 6, y, x + 6, y);
      this.graphics.lineBetween(x, y - 6, x, y + 6);
      this.graphics.strokeCircle(x, y, 7);

      // Terminal position ring
      this.graphics.fillStyle(0x344955, 0.2);
      this.graphics.fillCircle(x, y, 7);
    }

    // 2. Draw Active Shot Trajectory (vibrant)
    if (this.activePoints.length > 1) {
      this.graphics.lineStyle(3, 0xe8572a, 0.75);
      this.graphics.beginPath();
      this.graphics.moveTo(this.activePoints[0]!.x, this.activePoints[0]!.y);
      for (let i = 1; i < this.activePoints.length; i++) {
        this.graphics.lineTo(this.activePoints[i]!.x, this.activePoints[i]!.y);
      }
      this.graphics.strokePath();

      // Vibrant dots
      this.graphics.fillStyle(0xe8572a, 0.9);
      for (let i = 0; i < this.activePoints.length; i += 2) {
        this.graphics.fillCircle(this.activePoints[i]!.x, this.activePoints[i]!.y, 3);
      }
    }

    // Active landing marker (prominent)
    if (this.activeLandingMarker) {
      const { x, y } = this.activeLandingMarker;
      this.graphics.lineStyle(3, 0xd83a00, 0.95);
      this.graphics.lineBetween(x - 9, y, x + 9, y);
      this.graphics.lineBetween(x, y - 9, x, y + 9);
      this.graphics.strokeCircle(x, y, 9);

      // Inner impact dot
      this.graphics.fillStyle(0xffa726, 0.9);
      this.graphics.fillCircle(x, y, 4);

      // Small terminal crater/ring
      this.graphics.lineStyle(2, 0xffa726, 0.6);
      this.graphics.strokeCircle(x, y, 15);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
