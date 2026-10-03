import type Phaser from 'phaser';
import { LOOK, MULTIPLAYER } from '../config/tuning';

export interface SlotPlayer {
  readonly name: string;
  readonly color: number;
  readonly pattern: string;
}

/**
 * Decorative, labelled cannons for the players who are not shooting.
 * Render-only: no physics bodies, no influence on the launch position.
 * They sit in the earth strip below the ground surface, outside the playfield.
 */
export class CannonSlotsRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(5);
  }

  draw(players: readonly SlotPlayer[], activeIndex: number): void {
    this.clear();
    const S = MULTIPLAYER.slots;
    let slot = 0;
    players.forEach((player, i) => {
      if (i === activeIndex) return;
      const x = S.startXPx + slot * S.spacingPx;
      slot++;
      this.drawBarrel(x, S.yPx, player);
      this.labels.push(
        this.scene.add.text(x + S.barrelWidthPx + 10, S.yPx - S.labelFontPx / 2 - 3, `${player.name} · ${player.pattern}`, {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: `${S.labelFontPx}px`,
          color: '#293c36',
        }).setDepth(5),
      );
    });
  }

  private drawBarrel(x: number, y: number, player: SlotPlayer): void {
    const { barrelWidthPx: w, barrelHeightPx: h } = MULTIPLAYER.slots;
    const g = this.graphics;
    const top = y - h / 2;

    g.fillStyle(player.color, 1);
    g.fillRect(x, top, w, h);

    // Pattern in white, matching the active cannon's patterns.
    g.fillStyle(0xffffff, 0.85);
    g.lineStyle(2, 0xffffff, 0.85);
    if (player.pattern === 'stripes') {
      for (let d = 4; d < w - 4; d += 9) g.lineBetween(x + d, top + 1, x + d, top + h - 1);
    } else if (player.pattern === 'dots') {
      for (let d = 8; d < w - 4; d += 12) g.fillCircle(x + d, y, 2.5);
    } else if (player.pattern === 'checks') {
      const cell = h / 2;
      for (let col = 0; col * cell < w; col++) {
        for (let row = 0; row < 2; row++) {
          if ((col + row) % 2 === 0) g.fillRect(x + col * cell, top + row * cell, Math.min(cell, w - col * cell), cell);
        }
      }
    }

    g.lineStyle(3, LOOK.ink, 1);
    g.strokeRect(x, top, w, h);
  }

  private clear(): void {
    this.graphics.clear();
    for (const label of this.labels) label.destroy();
    this.labels = [];
  }

  destroy(): void {
    this.clear();
    this.graphics.destroy();
  }
}
