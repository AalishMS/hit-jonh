import type Phaser from 'phaser';
import { LOOK } from '../config/tuning';
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
      fontSize: '18px',
      fontFamily: 'system-ui, sans-serif',
      color: '#2b2118',
      fontStyle: 'bold',
      wordWrap: { width: 240 },
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
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.hitTimerSeconds = LOOK.paperFlightSeconds + LOOK.impactFlashSeconds;
    }
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
    const g = this.graphics;
    const breath = Math.sin(this.idleTimerSeconds * 2) * 0.6;
    // Reclining chair behind the body, with the same ink weight as the figure.
    g.lineStyle(4, LOOK.wood);
    g.lineBetween(cx - 29, groundY, cx + 22, groundY - 34);
    g.lineBetween(cx + 27, groundY, cx - 27, groundY - 70);
    g.lineStyle(9, LOOK.paper);
    g.lineBetween(cx - 26, groundY - 68, cx - 10, groundY - 29);
    g.lineStyle(3, LOOK.trousers);
    g.lineBetween(cx - 26, groundY - 68, cx - 10, groundY - 29);
    // His silhouette fills the actual body box (40 × 90 logical pixels).
    g.fillStyle(LOOK.trousers);
    g.lineStyle(2, LOOK.ink);
    g.fillRoundedRect(cx - 16, groundY - 29, 34, 17, 5);
    g.strokeRoundedRect(cx - 16, groundY - 29, 34, 17, 5);
    g.fillRoundedRect(cx + 3, groundY - 20, 14, 16, 3);
    g.fillStyle(LOOK.ink);
    g.fillRoundedRect(cx - 17, groundY - 8, 15, 7, 3);
    g.fillRoundedRect(cx + 1, groundY - 7, 19, 7, 3);
    g.fillStyle(LOOK.shirt);
    g.fillRoundedRect(cx - 18, groundY - 61 + breath, 36, 35, 8);
    g.strokeRoundedRect(cx - 18, groundY - 61 + breath, 36, 35, 8);
    // Collar and cardigan buttons give him an everyday, slightly fussy look.
    g.fillStyle(LOOK.paper);
    g.fillTriangle(cx - 7, groundY - 60, cx + 7, groundY - 60, cx, groundY - 51);
    g.fillStyle(LOOK.ink);
    g.fillCircle(cx, groundY - 47, 1.5);
    g.fillCircle(cx, groundY - 40, 1.5);
    const headY = groundY - 75 + breath;
    g.fillStyle(LOOK.skin);
    g.fillRoundedRect(cx - 16, headY - 14, 32, 28, 10);
    g.strokeRoundedRect(cx - 16, headY - 14, 32, 28, 10);
    g.fillCircle(cx + 16, headY + 1, 3);
    // Half-lidded glasses, side-eye and a stubborn moustache.
    g.lineStyle(2, LOOK.ink);
    g.strokeRoundedRect(cx - 13, headY - 4, 11, 8, 3);
    g.strokeRoundedRect(cx + 2, headY - 4, 11, 8, 3);
    g.lineBetween(cx - 2, headY - 1, cx + 2, headY - 1);
    g.lineBetween(cx - 13, headY - 7, cx - 3, headY - 8);
    g.lineBetween(cx + 3, headY - 8, cx + 13, headY - 7);
    g.fillStyle(LOOK.ink);
    if (this.idleTimerSeconds % 5 < 4.8) {
      g.fillCircle(cx - 9, headY, 1.5);
      g.fillCircle(cx + 5, headY, 1.5);
    }
    g.fillEllipse(cx - 3, headY + 7, 9, 4);
    g.fillEllipse(cx + 3, headY + 7, 9, 4);
    g.lineBetween(cx - 4, headY + 11, cx + 5, headY + 11);
    // Hat centred on its sensor, with the brim at the top of his head.
    if (this.hatBoxPx) {
      const hatY = this.hatBoxPx.maxY;
      g.fillStyle(LOOK.hat);
      g.fillRoundedRect(cx - 12, this.hatBoxPx.minY, 24, hatY - this.hatBoxPx.minY, 6);
      g.strokeRoundedRect(cx - 12, this.hatBoxPx.minY, 24, hatY - this.hatBoxPx.minY, 6);
      g.fillStyle(LOOK.shirt);
      g.fillRect(cx - 12, hatY - 6, 24, 4);
      g.fillStyle(LOOK.hat);
      g.fillRoundedRect(cx - 16, hatY - 3, 32, 5, 2);
      g.strokeRoundedRect(cx - 16, hatY - 3, 32, 5, 2);
    }
    // Folded newspaper and a hand, leaving the face visible.
    const paperY = groundY - 42 + Math.sin(this.idleTimerSeconds) * 0.6;
    g.fillStyle(LOOK.paper);
    g.lineStyle(2, LOOK.ink);
    g.fillRoundedRect(cx - 15, paperY, 30, 22, 2);
    g.strokeRoundedRect(cx - 15, paperY, 30, 22, 2);
    g.lineStyle(1, LOOK.wood);
    g.lineBetween(cx, paperY + 2, cx, paperY + 20);
    for (let row = 5; row < 18; row += 4) {
      g.lineBetween(cx - 11, paperY + row, cx - 3, paperY + row);
      g.lineBetween(cx + 3, paperY + row, cx + 11, paperY + row);
    }
    g.fillStyle(LOOK.skin);
    g.fillEllipse(cx - 15, paperY + 12, 7, 10);
  }

  private drawKnockedDown(cx: number, groundY: number, _height: number): void {
    const isStrong = this.hitImpactSpeed >= LOOK.strongImpactMs;
    const tumbleProgress = Math.min(1, this.hitTimerSeconds / LOOK.tumbleSeconds);

    // 1. Tumbled / collapsed deckchair
    this.graphics.lineStyle(4, LOOK.wood, 1);
    const chairTiltX = tumbleProgress * 15;
    const chairTiltY = tumbleProgress * 8;
    this.graphics.lineBetween(cx - 35, groundY - 10 + chairTiltY, cx - 5 + chairTiltX, groundY - 5);
    this.graphics.lineBetween(cx - 20, groundY - 25 + chairTiltY, cx + 10 + chairTiltX, groundY - 5);

    // 2. Fallen Jonh on lawn
    const bodySlideX = tumbleProgress * (isStrong ? 28 : 16);
    this.graphics.fillStyle(LOOK.shirt, 1);
    this.graphics.lineStyle(2, LOOK.ink, 1);
    this.graphics.fillRoundedRect(cx - 10 + bodySlideX, groundY - 18, 36, 16, 4);
    this.graphics.strokeRoundedRect(cx - 10 + bodySlideX, groundY - 18, 36, 16, 4);

    // Head
    const headX = cx + 34 + bodySlideX;
    const headY = groundY - 12;
    this.graphics.fillStyle(LOOK.skin, 1);
    this.graphics.fillCircle(headX, headY, 11);
    this.graphics.strokeCircle(headX, headY, 11);

    // A dry glare reads as annoyance, rather than injury.
    this.graphics.lineStyle(2, LOOK.ink);
    this.graphics.lineBetween(headX - 7, headY - 5, headX - 1, headY - 3);
    this.graphics.lineBetween(headX + 1, headY - 3, headX + 7, headY - 5);
    this.graphics.fillStyle(LOOK.ink);
    this.graphics.fillCircle(headX - 4, headY - 1, 1.5);
    this.graphics.fillCircle(headX + 4, headY - 1, 1.5);
    this.graphics.lineBetween(headX - 4, headY + 5, headX + 4, headY + 5);
    const flash = Math.max(0, 1 - this.hitTimerSeconds / LOOK.impactFlashSeconds);
    if (flash > 0) {
      this.graphics.lineStyle(4, LOOK.paper, flash);
      this.graphics.strokeCircle(cx - 15, groundY - 55, 16 + (1 - flash) * 18);
    }

    // 3. Flying Hat spinning off in arc
    const hatT = Math.min(1, this.hitTimerSeconds / LOOK.hatFlightSeconds);
    const hatArcY = -Math.sin(hatT * Math.PI) * (isStrong ? 65 : 40) + hatT * 30;
    const hatX = cx + 5 + hatT * (isStrong ? 55 : 30);
    const hatY = groundY - 65 + hatArcY;

    this.graphics.fillStyle(LOOK.hat, 1);
    this.graphics.lineStyle(2, 0x6e4e1b, 1);
    this.graphics.fillEllipse(hatX, hatY, 26, 10);
    this.graphics.strokeEllipse(hatX, hatY, 26, 10);

    // 4. Newspaper fluttering away
    const paperT = Math.min(1, this.hitTimerSeconds / LOOK.paperFlightSeconds);
    const paperX = cx - 10 - paperT * 25;
    const paperY = groundY - 50 - Math.sin(paperT * Math.PI) * 35 + paperT * 40;
    this.graphics.fillStyle(LOOK.paper, 1);
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
      const bubbleW = 260;
      const bubbleH = 64;
      const bubbleX = cx + 25 - bubbleW / 2;
      const bubbleY = groundY - 170;

      // Update text position to match bubble center
      this.speechText.setPosition(cx + 25, bubbleY + bubbleH / 2);

      // Bubble background pill
      this.graphics.fillStyle(0xffffff, 0.95);
      this.graphics.lineStyle(2, LOOK.ink, 1);
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
      this.graphics.lineStyle(2, LOOK.ink, 1);
      this.graphics.lineBetween(cx + 15, bubbleY + bubbleH, headX - 4, headY - 16);
      this.graphics.lineBetween(headX - 4, headY - 16, cx + 32, bubbleY + bubbleH);
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.speechText.destroy();
  }
}
