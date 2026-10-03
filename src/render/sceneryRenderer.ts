import type Phaser from 'phaser';
import type { LevelData } from '../levels/types';
import { metresToPixels, simYToWorldY } from '../sim/units';

export class SceneryRenderer {
  private graphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly ppm: number,
    private readonly worldHeightPx: number,
    private readonly worldWidthPx: number,
  ) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(0);
  }

  draw(level: LevelData): void {
    this.graphics.clear();

    // 1. Sky backdrop gradient
    this.graphics.fillGradientStyle(0x7ec0ee, 0x7ec0ee, 0xbfe6ff, 0xbfe6ff, 1);
    this.graphics.fillRect(0, 0, this.worldWidthPx, this.worldHeightPx);

    // 2. Soft clouds in the background
    this.graphics.fillStyle(0xffffff, 0.7);
    this.drawCloud(200, 100, 70);
    this.drawCloud(550, 80, 90);
    this.drawCloud(950, 120, 60);

    // 3. Distant treeline / garden hedge
    const groundTopPx = simYToWorldY(level.ground.maxY, this.worldHeightPx, this.ppm);
    this.graphics.fillStyle(0x4a7c36, 1);
    this.graphics.fillRect(0, groundTopPx - 25, this.worldWidthPx, 25);

    // 4. Ground strip
    const groundHeightPx = metresToPixels(level.ground.maxY - level.ground.minY, this.ppm);
    // Grass top
    this.graphics.fillStyle(0x6fbf4a, 1);
    this.graphics.fillRect(0, groundTopPx, this.worldWidthPx, 18);
    // Dirt / earth underneath
    this.graphics.fillStyle(0x735135, 1);
    this.graphics.fillRect(0, groundTopPx + 18, this.worldWidthPx, groundHeightPx - 18);
    // Ground divider line
    this.graphics.lineStyle(4, 0x2b2118, 1);
    this.graphics.lineBetween(0, groundTopPx, this.worldWidthPx, groundTopPx);
  }

  private drawCloud(x: number, y: number, r: number): void {
    this.graphics.fillCircle(x, y, r);
    this.graphics.fillCircle(x - r * 0.6, y + r * 0.2, r * 0.7);
    this.graphics.fillCircle(x + r * 0.6, y + r * 0.2, r * 0.7);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
