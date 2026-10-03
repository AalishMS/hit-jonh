import type Phaser from 'phaser';
import type { JonhSpawnData } from '../levels/types';
import { metresToPixels, simYToWorldY } from '../sim/units';

export class JonhRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private readonly bodyBoxPx: { minX: number; maxX: number; minY: number; maxY: number };
  private readonly hatBoxPx?: { minX: number; maxX: number; minY: number; maxY: number };

  constructor(
    scene: Phaser.Scene,
    jonhSpawn: JonhSpawnData,
    ppm: number,
    worldHeightPx: number,
  ) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(15);

    const b = jonhSpawn.bodyBox;
    this.bodyBoxPx = {
      minX: metresToPixels(b.minX, ppm),
      maxX: metresToPixels(b.maxX, ppm),
      // In world coords: b.maxY is higher up -> smaller y in px
      minY: simYToWorldY(b.maxY, worldHeightPx, ppm),
      maxY: simYToWorldY(b.minY, worldHeightPx, ppm),
    };

    if (jonhSpawn.hatBox) {
      const h = jonhSpawn.hatBox;
      this.hatBoxPx = {
        minX: metresToPixels(h.minX, ppm),
        maxX: metresToPixels(h.maxX, ppm),
        minY: simYToWorldY(h.maxY, worldHeightPx, ppm),
        maxY: simYToWorldY(h.minY, worldHeightPx, ppm),
      };
    }
  }

  draw(isHit = false): void {
    this.graphics.clear();

    const cx = (this.bodyBoxPx.minX + this.bodyBoxPx.maxX) / 2;
    const groundY = this.bodyBoxPx.maxY;
    const bodyHeight = this.bodyBoxPx.maxY - this.bodyBoxPx.minY;

    if (isHit) {
      // Hit reaction: Jonh knocked back / chair tilted
      this.drawKnockedDown(cx, groundY, bodyHeight);
    } else {
      // Calm idle: Jonh relaxing in deckchair reading newspaper
      this.drawIdle(cx, groundY, bodyHeight);
    }
  }

  private drawIdle(cx: number, groundY: number, _height: number): void {
    // 1. Deckchair frame
    this.graphics.lineStyle(4, 0xb87333, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(cx - 28, groundY);
    this.graphics.lineTo(cx + 8, groundY - 45);
    this.graphics.lineTo(cx - 18, groundY - 75);
    this.graphics.strokePath();

    this.graphics.lineStyle(4, 0xb87333, 1);
    this.graphics.lineBetween(cx - 15, groundY, cx + 22, groundY - 35);

    // Canvas fabric (striped orange)
    this.graphics.lineStyle(6, 0xe8572a, 1);
    this.graphics.lineBetween(cx - 15, groundY - 70, cx + 5, groundY - 30);
    this.graphics.lineBetween(cx + 5, groundY - 30, cx + 18, groundY - 10);

    // 2. Jonh's legs (blue trousers)
    this.graphics.fillStyle(0x34568b, 1);
    this.graphics.fillRoundedRect(cx - 5, groundY - 28, 28, 14, 4);

    // 3. Jonh's Torso (green cardigan/shirt)
    this.graphics.fillStyle(0x5b8266, 1);
    this.graphics.lineStyle(2, 0x2b2118, 1);
    this.graphics.fillRoundedRect(cx - 22, groundY - 65, 26, 38, 6);
    this.graphics.strokeRoundedRect(cx - 22, groundY - 65, 26, 38, 6);

    // 4. Jonh's Head (skin tone)
    const headY = groundY - 75;
    this.graphics.fillStyle(0xffd1b3, 1);
    this.graphics.fillCircle(cx - 9, headY, 13);
    this.graphics.strokeCircle(cx - 9, headY, 13);

    // Calm face (glasses & moustache)
    this.graphics.lineStyle(2, 0x2b2118, 1);
    // Glasses
    this.graphics.strokeCircle(cx - 13, headY - 1, 4);
    this.graphics.strokeCircle(cx - 5, headY - 1, 4);
    this.graphics.lineBetween(cx - 9, headY - 1, cx - 9, headY - 1);
    // Moustache
    this.graphics.fillStyle(0x5a4a42, 1);
    this.graphics.fillRoundedRect(cx - 12, headY + 5, 8, 3, 1);

    // 5. Distinctive Hat (straw bowler hat)
    if (this.hatBoxPx) {
      const hatY = this.hatBoxPx.maxY - 2;
      // Hat brim
      this.graphics.fillStyle(0xd4af37, 1);
      this.graphics.lineStyle(2, 0x6e4e1b, 1);
      this.graphics.fillEllipse(cx - 9, hatY + 6, 32, 8);
      this.graphics.strokeEllipse(cx - 9, hatY + 6, 32, 8);
      // Hat dome
      this.graphics.fillRoundedRect(cx - 18, hatY - 8, 18, 14, 6);
      this.graphics.strokeRoundedRect(cx - 18, hatY - 8, 18, 14, 6);
      // Hat ribbon
      this.graphics.fillStyle(0x8b0000, 1);
      this.graphics.fillRect(cx - 18, hatY + 1, 18, 4);
    }

    // 6. Newspaper in hands
    this.graphics.fillStyle(0xf0ece1, 1);
    this.graphics.lineStyle(2, 0x4a4a4a, 1);
    this.graphics.fillRoundedRect(cx - 2, groundY - 55, 18, 22, 2);
    this.graphics.strokeRoundedRect(cx - 2, groundY - 55, 18, 22, 2);
    // Newspaper text lines
    this.graphics.lineStyle(1, 0x888888, 1);
    this.graphics.lineBetween(cx + 2, groundY - 50, cx + 12, groundY - 50);
    this.graphics.lineBetween(cx + 2, groundY - 45, cx + 12, groundY - 45);
    this.graphics.lineBetween(cx + 2, groundY - 40, cx + 12, groundY - 40);
  }

  private drawKnockedDown(cx: number, groundY: number, _height: number): void {
    // Tumbled chair
    this.graphics.lineStyle(4, 0xb87333, 1);
    this.graphics.lineBetween(cx - 35, groundY - 10, cx - 5, groundY - 5);
    this.graphics.lineBetween(cx - 20, groundY - 25, cx + 10, groundY - 5);

    // Fallen Jonh (tumbled on ground)
    this.graphics.fillStyle(0x5b8266, 1);
    this.graphics.lineStyle(2, 0x2b2118, 1);
    this.graphics.fillRoundedRect(cx - 10, groundY - 18, 36, 16, 4);
    this.graphics.strokeRoundedRect(cx - 10, groundY - 18, 36, 16, 4);

    // Head
    this.graphics.fillStyle(0xffd1b3, 1);
    this.graphics.fillCircle(cx + 34, groundY - 12, 11);
    this.graphics.strokeCircle(cx + 34, groundY - 12, 11);

    // Flying hat spinning off
    this.graphics.fillStyle(0xd4af37, 1);
    this.graphics.lineStyle(2, 0x6e4e1b, 1);
    this.graphics.fillEllipse(cx + 15, groundY - 60, 26, 10);
    this.graphics.strokeEllipse(cx + 15, groundY - 60, 26, 10);

    // Comic impact stars
    this.graphics.fillStyle(0xffd700, 1);
    this.graphics.fillCircle(cx + 30, groundY - 35, 4);
    this.graphics.fillCircle(cx + 42, groundY - 30, 3);
    this.graphics.fillCircle(cx + 38, groundY - 45, 5);

    // Comic "OOF!" badge
    this.graphics.fillStyle(0xe8572a, 1);
    this.graphics.lineStyle(2, 0x2b2118, 1);
    this.graphics.fillRoundedRect(cx + 20, groundY - 95, 45, 24, 6);
    this.graphics.strokeRoundedRect(cx + 20, groundY - 95, 45, 24, 6);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
