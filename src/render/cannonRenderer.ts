import type Phaser from 'phaser';
import type { Point2D } from '../levels/types';
import { metresToPixels, simYToWorldY } from '../sim/units';

export class CannonRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private readonly pivotXPx: number;
  private readonly pivotYPx: number;
  private readonly barrelLengthPx: number;
  private readonly barrelThicknessPx: number;

  constructor(
    scene: Phaser.Scene,
    cannonSpawn: Point2D,
    private readonly ppm: number,
    worldHeightPx: number,
  ) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(10);

    this.pivotXPx = metresToPixels(cannonSpawn.x, ppm);
    this.pivotYPx = simYToWorldY(cannonSpawn.y, worldHeightPx, ppm);
    this.barrelLengthPx = metresToPixels(1.2, ppm);
    this.barrelThicknessPx = metresToPixels(0.36, ppm);
  }

  getMuzzlePosition(angleDeg: number, ballRadiusMetres: number): { x: number; y: number } {
    const rad = (angleDeg * Math.PI) / 180;
    // Spawn tip offset: slightly ahead of barrel so ball cannot intersect barrel
    const offsetMetres = 1.2 + ballRadiusMetres + 0.04;
    const offsetPx = metresToPixels(offsetMetres, this.ppm);
    return {
      x: this.pivotXPx + offsetPx * Math.cos(rad),
      y: this.pivotYPx - offsetPx * Math.sin(rad),
    };
  }

  draw(angleDeg: number): void {
    this.graphics.clear();
    const rad = (angleDeg * Math.PI) / 180;

    // 1. Barrel (rotates around pivot)
    const cos = Math.cos(rad);
    const sin = -Math.sin(rad); // world y down

    // Barrel rectangle corners relative to pivot
    const halfThick = this.barrelThicknessPx / 2;
    const len = this.barrelLengthPx;

    const corners = [
      { x: -10 * cos - halfThick * -sin, y: -10 * sin - halfThick * cos },
      { x: len * cos - halfThick * -sin, y: len * sin - halfThick * cos },
      { x: len * cos + halfThick * -sin, y: len * sin + halfThick * cos },
      { x: -10 * cos + halfThick * -sin, y: -10 * sin + halfThick * cos },
    ];

    this.graphics.fillStyle(0x3a3f47, 1);
    this.graphics.lineStyle(3, 0x1f2329, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(this.pivotXPx + corners[0]!.x, this.pivotYPx + corners[0]!.y);
    for (let i = 1; i < corners.length; i++) {
      this.graphics.lineTo(this.pivotXPx + corners[i]!.x, this.pivotYPx + corners[i]!.y);
    }
    this.graphics.closePath();
    this.graphics.fillPath();
    this.graphics.strokePath();

    // Muzzle band ring
    const bandLen = len - 6;
    const pBand1 = { x: bandLen * cos - (halfThick + 2) * -sin, y: bandLen * sin - (halfThick + 2) * cos };
    const pBand2 = { x: bandLen * cos + (halfThick + 2) * -sin, y: bandLen * sin + (halfThick + 2) * cos };
    this.graphics.lineStyle(4, 0x1f2329, 1);
    this.graphics.lineBetween(
      this.pivotXPx + pBand1.x,
      this.pivotYPx + pBand1.y,
      this.pivotXPx + pBand2.x,
      this.pivotYPx + pBand2.y,
    );

    // Initial aim guide line at muzzle (SPEC §3.2) - short directional indicator
    const guideStart = this.getMuzzlePosition(angleDeg, 0.15);
    const guideLenPx = metresToPixels(0.85, this.ppm);
    const endX = guideStart.x + guideLenPx * cos;
    const endY = guideStart.y + guideLenPx * sin;

    // Outer contrasting line
    this.graphics.lineStyle(4, 0x2b2118, 0.5);
    this.graphics.lineBetween(guideStart.x, guideStart.y, endX, endY);

    // Inner bright directional line
    this.graphics.lineStyle(2, 0xe8572a, 0.95);
    this.graphics.lineBetween(guideStart.x, guideStart.y, endX, endY);

    // Dotted rhythm ticks along guide
    for (let d = 0.2; d <= 0.8; d += 0.2) {
      const tickPx = metresToPixels(d, this.ppm);
      const tx = guideStart.x + tickPx * cos;
      const ty = guideStart.y + tickPx * sin;
      this.graphics.fillStyle(0xfff3e0, 1);
      this.graphics.fillCircle(tx, ty, 2.5);
      this.graphics.lineStyle(1, 0x2b2118, 1);
      this.graphics.strokeCircle(tx, ty, 2.5);
    }

    // Directional arrow tip
    const arrowLen = 7;
    const arrowWidth = 4;
    const normalX = -sin;
    const normalY = cos;
    this.graphics.fillStyle(0xe8572a, 1);
    this.graphics.lineStyle(1.5, 0x2b2118, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(endX, endY);
    this.graphics.lineTo(
      endX - arrowLen * cos + arrowWidth * normalX,
      endY - arrowLen * sin + arrowWidth * normalY,
    );
    this.graphics.lineTo(
      endX - arrowLen * cos - arrowWidth * normalX,
      endY - arrowLen * sin - arrowWidth * normalY,
    );
    this.graphics.closePath();
    this.graphics.fillPath();
    this.graphics.strokePath();

    // 2. Carriage / Base Mount
    // Wooden wheel
    const wheelRadius = metresToPixels(0.45, this.ppm);
    this.graphics.fillStyle(0x8a5229, 1);
    this.graphics.lineStyle(4, 0x3d2010, 1);
    this.graphics.fillCircle(this.pivotXPx - 5, this.pivotYPx + 15, wheelRadius);
    this.graphics.strokeCircle(this.pivotXPx - 5, this.pivotYPx + 15, wheelRadius);

    // Hub
    this.graphics.fillStyle(0x3a3f47, 1);
    this.graphics.fillCircle(this.pivotXPx - 5, this.pivotYPx + 15, 8);

    // Metal pivot bracket
    this.graphics.fillStyle(0x5a6370, 1);
    this.graphics.lineStyle(3, 0x2b2118, 1);
    this.graphics.fillCircle(this.pivotXPx, this.pivotYPx, 12);
    this.graphics.strokeCircle(this.pivotXPx, this.pivotYPx, 12);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
