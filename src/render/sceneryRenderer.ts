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
    const jonhBaseWorldPx = simYToWorldY(level.jonhSpawn.bodyBox.minY, this.worldHeightPx, this.ppm);
    const support = level.obstacles.find(o => o.box.maxY === level.jonhSpawn.bodyBox.minY &&
      o.box.minX <= level.jonhSpawn.bodyBox.minX && o.box.maxX >= level.jonhSpawn.bodyBox.maxX);
    // Keep the table on the roof when Jonh sits near its right edge.
    const tableAnchorX = support && jonhX + 107 > metresToPixels(support.box.maxX, this.ppm)
      ? jonhX - 175 : jonhX;
    
    // Draw obstacles before ground so ground overlays bottom slightly if needed, or after ground?
    // Let's draw obstacles after ground divider.
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

    // 5. Obstacles
    for (const obs of level.obstacles) {
      const xPx = metresToPixels(obs.box.minX, this.ppm);
      const wPx = metresToPixels(obs.box.maxX - obs.box.minX, this.ppm);
      // y is inverted
      const yPx = simYToWorldY(obs.box.maxY, this.worldHeightPx, this.ppm);
      const hPx = metresToPixels(obs.box.maxY - obs.box.minY, this.ppm);

      if (obs.id === 'garden-shed') {
        this.graphics.fillStyle(0xbd8c56);
        this.graphics.fillRect(xPx, yPx, wPx, hPx);
        this.graphics.lineStyle(3, LOOK.ink);
        this.graphics.strokeRect(xPx, yPx, wPx, hPx);
        this.graphics.fillStyle(0x70523a);
        this.graphics.fillRect(xPx, yPx, wPx, 12);
        this.graphics.fillRect(xPx + wPx * 0.35, yPx + hPx * 0.5, wPx * 0.3, hPx * 0.5);
        this.graphics.fillStyle(LOOK.sky);
        this.graphics.fillRect(xPx + wPx * 0.2, yPx + hPx * 0.2, wPx * 0.6, hPx * 0.2);
        this.graphics.strokeRect(xPx + wPx * 0.2, yPx + hPx * 0.2, wPx * 0.6, hPx * 0.2);
        this.graphics.fillStyle(LOOK.hat);
        this.graphics.fillCircle(xPx + wPx * 0.58, yPx + hPx * 0.75, 3);
      } else if (obs.material === 'wood') {
        this.graphics.fillStyle(0x754a31, 1); // Dark wood
        this.graphics.fillRect(xPx, yPx, wPx, hPx);
        this.graphics.lineStyle(2, 0x3d2010, 1);
        this.graphics.strokeRect(xPx, yPx, wPx, hPx);
        // Add vertical planks
        for(let px = xPx + 15; px < xPx + wPx; px += 20) {
           this.graphics.lineBetween(px, yPx, px, yPx + hPx);
        }
      } else if (obs.material === 'concrete') {
        this.graphics.fillStyle(0x8a929e, 1); // Concrete grey
        this.graphics.fillRect(xPx, yPx, wPx, hPx);
        this.graphics.lineStyle(2, 0x474c54, 1);
        this.graphics.strokeRect(xPx, yPx, wPx, hPx);
        // Windows make the existing solid collider read as a multistory house.
        this.graphics.fillStyle(LOOK.sky);
        for(let cy = yPx + 30; cy < yPx + hPx - 28; cy += 70) {
          for (let cx = xPx + 30; cx < xPx + wPx - 30; cx += 75) {
            this.graphics.fillRect(cx, cy, 35, 38);
            this.graphics.strokeRect(cx, cy, 35, 38);
            this.graphics.lineBetween(cx + 17, cy, cx + 17, cy + 38);
          }
        }
      } else if (obs.material === 'rubber') {
        this.graphics.fillStyle(0xd95c6f, 1); // Rubber pink/red
        this.graphics.fillRect(xPx, yPx, wPx, hPx);
        this.graphics.lineStyle(3, 0x822131, 1);
        this.graphics.strokeRect(xPx, yPx, wPx, hPx);
        this.graphics.fillStyle(0xed8594, 1);
        this.graphics.fillRect(xPx + 4, yPx + 4, wPx - 8, hPx * 0.1);
      } else {
        this.graphics.fillStyle(LOOK.ink, 1);
        this.graphics.fillRect(xPx, yPx, wPx, hPx);
      }
    }

    // Scenery props near Jonh
    this.graphics.fillStyle(LOOK.ink, 0.14);
    this.graphics.fillEllipse(jonhX + 8, jonhBaseWorldPx + 3, 120, 12);
    this.graphics.fillEllipse(125, groundTopPx + 3, 90, 12); // cannon shadow
    this.graphics.lineStyle(3, LOOK.wood);
    this.graphics.lineBetween(tableAnchorX + 75, jonhBaseWorldPx, tableAnchorX + 75, jonhBaseWorldPx - 31);
    this.graphics.lineBetween(tableAnchorX + 99, jonhBaseWorldPx, tableAnchorX + 99, jonhBaseWorldPx - 31);
    this.graphics.fillStyle(LOOK.wood);
    this.graphics.fillRoundedRect(tableAnchorX + 68, jonhBaseWorldPx - 35, 39, 5, 2);
    this.graphics.fillStyle(LOOK.paper);
    this.graphics.fillRoundedRect(tableAnchorX + 78, jonhBaseWorldPx - 48, 13, 13, 2);
    this.graphics.lineStyle(2, LOOK.paper);
    this.graphics.strokeCircle(tableAnchorX + 93, jonhBaseWorldPx - 42, 4);

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
