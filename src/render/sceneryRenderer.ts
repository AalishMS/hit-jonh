import type Phaser from 'phaser';
import { LOOK } from '../config/tuning';
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

    // Flat, quiet sky keeps the ball and its trail readable.
    this.graphics.fillStyle(LOOK.sky);
    this.graphics.fillRect(0, 0, this.worldWidthPx, this.worldHeightPx);

    // 2. Soft clouds in the background
    this.graphics.fillStyle(LOOK.cloud);
    this.drawCloud(225, 145, 28);
    this.drawCloud(650, 95, 22);
    this.drawCloud(1050, 175, 32);

    // 3. Distant treeline / garden hedge
    const groundTopPx = simYToWorldY(level.ground.maxY, this.worldHeightPx, this.ppm);
    this.graphics.fillStyle(LOOK.distantGreen);
    for (let x = -40; x < this.worldWidthPx + 80; x += 80) {
      this.graphics.fillEllipse(x, groundTopPx - 45, 180, 110);
    }
    this.graphics.fillRect(0, groundTopPx - 45, this.worldWidthPx, 45);
    // Distant trees at the edges frame the open flight corridor.
    for (const x of [25, this.worldWidthPx - 35]) {
      this.graphics.fillStyle(0xa1ba9c);
      this.graphics.fillEllipse(x, groundTopPx - 140, 145, 165);
      this.graphics.fillEllipse(x + 35, groundTopPx - 120, 100, 115);
      this.graphics.lineStyle(5, 0x8fa78c);
      this.graphics.lineBetween(x, groundTopPx - 30, x, groundTopPx - 130);
      this.graphics.lineBetween(x, groundTopPx - 95, x + 25, groundTopPx - 125);
    }
    // A pale garden boundary is scenery behind the playfield, not a solid obstacle.
    this.graphics.fillStyle(0xd5d6b7);
    this.graphics.fillRect(0, groundTopPx - 35, this.worldWidthPx, 35);
    this.graphics.lineStyle(2, 0xb7bc9c);
    for (let x = 10; x < this.worldWidthPx; x += 35) {
      this.graphics.lineBetween(x, groundTopPx - 35, x, groundTopPx);
    }
    this.graphics.fillStyle(LOOK.hedge);
    this.graphics.fillRect(0, groundTopPx - 12, this.worldWidthPx, 12);

    // A little afternoon context, placed behind Jonh's chair.
    const jonhX = metresToPixels((level.jonhSpawn.bodyBox.minX + level.jonhSpawn.bodyBox.maxX) / 2, this.ppm);
    this.graphics.fillStyle(LOOK.ink, 0.14);
    this.graphics.fillEllipse(jonhX + 8, groundTopPx + 3, 120, 12);
    this.graphics.fillEllipse(125, groundTopPx + 3, 90, 12);
    this.graphics.lineStyle(3, LOOK.wood);
    this.graphics.lineBetween(jonhX + 75, groundTopPx, jonhX + 75, groundTopPx - 31);
    this.graphics.lineBetween(jonhX + 99, groundTopPx, jonhX + 99, groundTopPx - 31);
    this.graphics.fillStyle(LOOK.wood);
    this.graphics.fillRoundedRect(jonhX + 68, groundTopPx - 35, 39, 5, 2);
    this.graphics.fillStyle(LOOK.paper);
    this.graphics.fillRoundedRect(jonhX + 78, groundTopPx - 48, 13, 13, 2);
    this.graphics.lineStyle(2, LOOK.paper);
    this.graphics.strokeCircle(jonhX + 93, groundTopPx - 42, 4);

    // 4. Ground strip
    const groundHeightPx = metresToPixels(level.ground.maxY - level.ground.minY, this.ppm);
    // Grass top
    this.graphics.fillStyle(LOOK.grass, 1);
    this.graphics.fillRect(0, groundTopPx, this.worldWidthPx, 12);
    // Dirt / earth underneath
    this.graphics.fillStyle(LOOK.earth, 1);
    this.graphics.fillRect(0, groundTopPx + 12, this.worldWidthPx, groundHeightPx - 12);
    // Ground divider line
    this.graphics.lineStyle(2, LOOK.ink, 0.65);
    this.graphics.lineBetween(0, groundTopPx, this.worldWidthPx, groundTopPx);
    this.graphics.fillStyle(LOOK.wood, 0.3);
    for (let x = 20; x < this.worldWidthPx; x += 43) {
      this.graphics.fillEllipse(x, groundTopPx + 32 + (x % 19), 5, 2);
    }
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
