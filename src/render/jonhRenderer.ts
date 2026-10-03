import type Phaser from 'phaser';
import type { JonhSpawnData } from '../levels/types';
import { metresToPixels, simYToWorldY } from '../sim/units';

export class JonhRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private speechText: Phaser.GameObjects.Text;
  private readonly bodyBoxPx: { minX: number; maxX: number; minY: number; maxY: number };
  private readonly hatBoxPx?: { minX: number; maxX: number; minY: number; maxY: number };

  private isHit = false;
  private hitTimerSeconds = 0;
  private hitImpactSpeed = 0;
  private hitQuote = '';
  private idleTimerSeconds = 0;

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

    const cx = (this.bodyBoxPx.minX + this.bodyBoxPx.maxX) / 2;
    const bubbleY = this.bodyBoxPx.minY - 45;

    this.speechText = scene.add.text(cx + 25, bubbleY, '', {
      fontSize: '13px',
      fontFamily: 'system-ui, sans-serif',
      color: '#2b2118',
      fontStyle: 'bold',
      wordWrap: { width: 170 },
      align: 'center',
    });
    this.speechText.setOrigin(0.5, 0.5);
    this.speechText.setDepth(20);
    this.speechText.setVisible(false);
  }

  update(deltaSeconds: number): void {
    if (this.isHit) {
      this.hitTimerSeconds += deltaSeconds;
    } else {
      this.idleTimerSeconds += deltaSeconds;
    }
    this.draw();
  }

  triggerHit(impactSpeedMs: number, quote: string): void {
    this.isHit = true;
    this.hitTimerSeconds = 0;
    this.hitImpactSpeed = impactSpeedMs;
    this.hitQuote = quote;
    this.speechText.setText(`"${quote}"`);
    this.speechText.setVisible(true);
    this.draw();
  }

  resetToIdle(): void {
    this.isHit = false;
    this.hitTimerSeconds = 0;
    this.hitQuote = '';
    this.speechText.setVisible(false);
    this.draw();
  }

  draw(overrideHit?: boolean): void {
    if (overrideHit !== undefined) {
      this.isHit = overrideHit;
      if (!overrideHit) {
        this.speechText.setVisible(false);
      }
    }

    this.graphics.clear();

    const cx = (this.bodyBoxPx.minX + this.bodyBoxPx.maxX) / 2;
    const groundY = this.bodyBoxPx.maxY;
    const bodyHeight = this.bodyBoxPx.maxY - this.bodyBoxPx.minY;

    if (this.isHit) {
      this.drawKnockedDown(cx, groundY, bodyHeight);
    } else {
      this.drawIdle(cx, groundY, bodyHeight);
    }
  }

  private drawIdle(cx: number, groundY: number, _height: number): void {
    // Idle animation: breathing and paper rustle
    const breathY = Math.sin(this.idleTimerSeconds * 2.8) * 1.5;
    const paperRustle = Math.sin(this.idleTimerSeconds * 1.6) * 1.2;

    // 1. Deckchair frame (stationary on ground)
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

    // 3. Jonh's Torso (green cardigan/shirt, responds slightly to breath)
    const torsoY = groundY - 65 + breathY;
    this.graphics.fillStyle(0x5b8266, 1);
    this.graphics.lineStyle(2, 0x2b2118, 1);
    this.graphics.fillRoundedRect(cx - 22, torsoY, 26, 38, 6);
    this.graphics.strokeRoundedRect(cx - 22, torsoY, 26, 38, 6);

    // 4. Jonh's Head (skin tone)
    const headY = groundY - 75 + breathY * 0.8;
    this.graphics.fillStyle(0xffd1b3, 1);
    this.graphics.fillCircle(cx - 9, headY, 13);
    this.graphics.strokeCircle(cx - 9, headY, 13);

    // Calm face (glasses & moustache)
    this.graphics.lineStyle(2, 0x2b2118, 1);
    // Glasses
    this.graphics.strokeCircle(cx - 13, headY - 1, 4);
    this.graphics.strokeCircle(cx - 5, headY - 1, 4);
    this.graphics.lineBetween(cx - 9, headY - 1, cx - 9, headY - 1);
    // Eyes behind glasses
    const blinkCycle = this.idleTimerSeconds % 4.0;
    if (blinkCycle > 3.85) {
      // Blink (horizontal slit)
      this.graphics.lineBetween(cx - 15, headY - 1, cx - 11, headY - 1);
      this.graphics.lineBetween(cx - 7, headY - 1, cx - 3, headY - 1);
    } else {
      // Open pupils
      this.graphics.fillStyle(0x2b2118, 1);
      this.graphics.fillCircle(cx - 13, headY - 1, 1.5);
      this.graphics.fillCircle(cx - 5, headY - 1, 1.5);
    }

    // Moustache
    this.graphics.fillStyle(0x5a4a42, 1);
    this.graphics.fillRoundedRect(cx - 12, headY + 5, 8, 3, 1);

    // 5. Distinctive Hat (straw bowler hat)
    if (this.hatBoxPx) {
      const hatY = this.hatBoxPx.maxY - 2 + breathY * 0.8;
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

    // 6. Newspaper in hands (subtle rustle/drift)
    const paperY = groundY - 55 + paperRustle;
    this.graphics.fillStyle(0xf0ece1, 1);
    this.graphics.lineStyle(2, 0x4a4a4a, 1);
    this.graphics.fillRoundedRect(cx - 2, paperY, 18, 22, 2);
    this.graphics.strokeRoundedRect(cx - 2, paperY, 18, 22, 2);
    // Newspaper text lines
    this.graphics.lineStyle(1, 0x888888, 1);
    this.graphics.lineBetween(cx + 2, paperY + 5, cx + 12, paperY + 5);
    this.graphics.lineBetween(cx + 2, paperY + 10, cx + 12, paperY + 10);
    this.graphics.lineBetween(cx + 2, paperY + 15, cx + 12, paperY + 15);
  }

  private drawKnockedDown(cx: number, groundY: number, _height: number): void {
    const isStrong = this.hitImpactSpeed >= 10;
    const tumbleProgress = Math.min(1, this.hitTimerSeconds / 0.35);

    // 1. Tumbled / collapsed deckchair
    this.graphics.lineStyle(4, 0xb87333, 1);
    const chairTiltX = tumbleProgress * 15;
    const chairTiltY = tumbleProgress * 8;
    this.graphics.lineBetween(cx - 35, groundY - 10 + chairTiltY, cx - 5 + chairTiltX, groundY - 5);
    this.graphics.lineBetween(cx - 20, groundY - 25 + chairTiltY, cx + 10 + chairTiltX, groundY - 5);

    // 2. Fallen Jonh on lawn
    const bodySlideX = tumbleProgress * (isStrong ? 28 : 16);
    this.graphics.fillStyle(0x5b8266, 1);
    this.graphics.lineStyle(2, 0x2b2118, 1);
    this.graphics.fillRoundedRect(cx - 10 + bodySlideX, groundY - 18, 36, 16, 4);
    this.graphics.strokeRoundedRect(cx - 10 + bodySlideX, groundY - 18, 36, 16, 4);

    // Head
    const headX = cx + 34 + bodySlideX;
    const headY = groundY - 12;
    this.graphics.fillStyle(0xffd1b3, 1);
    this.graphics.fillCircle(headX, headY, 11);
    this.graphics.strokeCircle(headX, headY, 11);

    // Dazed spiral/cross eyes
    this.graphics.lineStyle(2, 0x2b2118, 1);
    this.graphics.lineBetween(headX - 4, headY - 4, headX + 4, headY + 4);
    this.graphics.lineBetween(headX - 4, headY + 4, headX + 4, headY - 4);

    // 3. Flying Hat spinning off in arc
    const hatT = Math.min(1, this.hitTimerSeconds / 0.85);
    const hatArcY = -Math.sin(hatT * Math.PI) * (isStrong ? 65 : 40) + hatT * 30;
    const hatX = cx + 5 + hatT * (isStrong ? 55 : 30);
    const hatY = groundY - 65 + hatArcY;

    this.graphics.fillStyle(0xd4af37, 1);
    this.graphics.lineStyle(2, 0x6e4e1b, 1);
    this.graphics.fillEllipse(hatX, hatY, 26, 10);
    this.graphics.strokeEllipse(hatX, hatY, 26, 10);

    // 4. Newspaper fluttering away
    const paperT = Math.min(1, this.hitTimerSeconds / 1.0);
    const paperX = cx - 10 - paperT * 25;
    const paperY = groundY - 50 - Math.sin(paperT * Math.PI) * 35 + paperT * 40;
    this.graphics.fillStyle(0xf0ece1, 1);
    this.graphics.lineStyle(1, 0x4a4a4a, 1);
    this.graphics.fillRoundedRect(paperX, paperY, 16, 20, 2);
    this.graphics.strokeRoundedRect(paperX, paperY, 16, 20, 2);

    // 5. Impact stars and comic dust
    const starAlpha = Math.max(0, 1 - this.hitTimerSeconds / 1.2);
    if (starAlpha > 0) {
      this.graphics.fillStyle(0xffd700, starAlpha);
      this.graphics.fillCircle(headX - 6, headY - 24, 4);
      this.graphics.fillCircle(headX + 12, headY - 20, 3.5);
      this.graphics.fillCircle(headX + 5, headY - 32, 5);

      // Dust puff at impact point
      this.graphics.fillStyle(0xd0c4b0, starAlpha * 0.7);
      this.graphics.fillCircle(cx + 8, groundY - 14, 12 * tumbleProgress);
      this.graphics.fillCircle(cx + 20, groundY - 10, 9 * tumbleProgress);
    }

    // 6. Speech Bubble with Jonh's dry reaction
    if (this.hitQuote) {
      const bubbleW = 190;
      const bubbleH = 50;
      const bubbleX = cx + 25 - bubbleW / 2;
      const bubbleY = groundY - 125;

      // Update text position to match bubble center
      this.speechText.setPosition(cx + 25, bubbleY + bubbleH / 2);

      // Bubble background pill
      this.graphics.fillStyle(0xffffff, 0.95);
      this.graphics.lineStyle(2, 0x2b2118, 1);
      this.graphics.fillRoundedRect(bubbleX, bubbleY, bubbleW, bubbleH, 10);
      this.graphics.strokeRoundedRect(bubbleX, bubbleY, bubbleW, bubbleH, 10);

      // Speech bubble pointer tail down toward Jonh's head
      this.graphics.fillStyle(0xffffff, 0.95);
      this.graphics.beginPath();
      this.graphics.moveTo(cx + 15, bubbleY + bubbleH);
      this.graphics.lineTo(headX - 4, headY - 16);
      this.graphics.lineTo(cx + 32, bubbleY + bubbleH);
      this.graphics.closePath();
      this.graphics.fillPath();

      // Tail stroke
      this.graphics.lineStyle(2, 0x2b2118, 1);
      this.graphics.lineBetween(cx + 15, bubbleY + bubbleH, headX - 4, headY - 16);
      this.graphics.lineBetween(headX - 4, headY - 16, cx + 32, bubbleY + bubbleH);
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.speechText.destroy();
  }
}
