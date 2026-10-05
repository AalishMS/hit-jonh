import type Phaser from 'phaser';
import { JUICE, LOOK, WORLD } from '../config/tuning';

type Cue = { x: number; y: number; age: number };

/** All animation is driven explicitly by the scene's pause-aware presentation clock. */
export class ShotEffectsRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private launchCue: Cue | null = null;
  private hitCue: Cue | null = null;
  private motionSuppressed = false;
  private base: { zoom: number; x: number; y: number } | null = null;

  constructor(private scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(24);
    this.label = scene.add.text(0, 0, 'BONK!', {
      fontFamily: 'system-ui, sans-serif', fontStyle: 'bold',
      fontSize: `${JUICE.labelSizePx}px`, color: '#fff9e6',
      stroke: '#293c36', strokeThickness: JUICE.labelStrokePx,
    }).setOrigin(0.5).setDepth(25).setVisible(false);
  }

  launch(x: number, y: number, reduced: boolean): void {
    this.launchCue = reduced ? null : { x, y, age: 0 };
  }

  bodyImpact(x: number, y: number): void {
    this.hitCue = { x, y, age: 0 };
    const camera = this.scene.cameras.main;
    this.base = { zoom: camera.zoom, x: camera.scrollX, y: camera.scrollY };
    this.label.setPosition(
      Math.max(JUICE.labelMarginPx, Math.min(WORLD.designWidthPx - JUICE.labelMarginPx, x + JUICE.labelOffsetXPx)),
      Math.max(JUICE.labelSizePx, Math.min(WORLD.designHeightPx - JUICE.labelSizePx, y)),
    ).setVisible(true).setAlpha(1);
  }

  update(dt: number, reduced: boolean): number {
    this.graphics.clear();
    let recoil = 0;
    if (reduced) { this.motionSuppressed = true; this.launchCue = null; this.restoreCamera(); }
    reduced = reduced || this.motionSuppressed;
    if (this.launchCue) {
      const c = this.launchCue;
      c.age += dt;
      recoil = JUICE.recoilPixels * Math.max(0, 1 - c.age / JUICE.recoilSeconds) ** 2;
      if (c.age < JUICE.flashSeconds) {
        this.graphics.fillStyle(LOOK.hat, 1 - c.age / JUICE.flashSeconds);
        this.graphics.fillCircle(c.x, c.y, JUICE.flashRadiusPx);
      }
      const t = c.age / JUICE.smokeSeconds;
      this.graphics.fillStyle(LOOK.paper, Math.max(0, 1 - t) * JUICE.smokeAlpha);
      for (let i = 0; i < JUICE.smokeCount; i++) this.graphics.fillCircle(c.x + i * JUICE.smokeSpacingPx, c.y - t * JUICE.smokeRisePx - i * JUICE.smokeOffsetYPx, JUICE.smokeRadiusPx + t * JUICE.smokeGrowthPx);
      if (t >= 1) this.launchCue = null;
    }
    if (this.hitCue) {
      const c = this.hitCue;
      c.age += dt;
      const pop = Math.min(1, c.age / JUICE.labelPopSeconds);
      this.label.setScale(reduced ? 1 : JUICE.labelStartScale + (1 - JUICE.labelStartScale) * Math.sin(pop * Math.PI / 2));
      this.label.setAlpha(Math.max(0, 1 - c.age / JUICE.labelSeconds));
      if (!reduced) {
        const camera = this.scene.cameras.main;
        if (this.base) {
          const shake = Math.max(0, 1 - c.age / JUICE.shakeSeconds) * JUICE.shakePixels;
          camera.setZoom(this.base.zoom * (1 + (JUICE.zoomScale - 1) * Math.max(0, 1 - c.age / JUICE.zoomSeconds)));
          camera.setScroll(this.base.x + Math.sin(c.age * JUICE.shakeFrequencyX) * shake, this.base.y + Math.cos(c.age * JUICE.shakeFrequencyY) * shake);
          if (c.age >= Math.max(JUICE.shakeSeconds, JUICE.zoomSeconds)) this.restoreCamera();
        }
        const alpha = Math.max(0, 1 - c.age / JUICE.burstSeconds);
        for (let i = 0; i < JUICE.burstCount; i++) {
          const a = i * Math.PI * 2 / JUICE.burstCount;
          const x = c.x + Math.cos(a) * JUICE.burstSpeedPx * c.age;
          const y = c.y + Math.sin(a) * JUICE.burstSpeedPx * c.age + JUICE.burstGravityPx * c.age ** 2 / 2;
          this.graphics.fillStyle([LOOK.earth, LOOK.hat, LOOK.paper][i % 3]!, alpha);
          if (i % 3 === 2) {
            this.graphics.fillTriangle(x, y - JUICE.starRadiusPx, x - JUICE.fleckWidthPx, y + JUICE.fleckHeightPx, x + JUICE.fleckWidthPx, y + JUICE.fleckHeightPx);
            this.graphics.fillTriangle(x, y + JUICE.starRadiusPx, x - JUICE.fleckWidthPx, y - JUICE.fleckHeightPx, x + JUICE.fleckWidthPx, y - JUICE.fleckHeightPx);
          } else if (i % 3 === 1) this.graphics.fillRect(x, y, JUICE.fleckWidthPx, JUICE.fleckHeightPx);
          else this.graphics.fillCircle(x, y, JUICE.dustRadiusPx + c.age * JUICE.dustGrowthPx);
        }
      }
      if (c.age >= JUICE.labelSeconds) { this.hitCue = null; this.label.setVisible(false); }
    }
    return recoil;
  }

  private restoreCamera(): void {
    if (!this.base) return;
    this.scene.cameras.main.setZoom(this.base.zoom).setScroll(this.base.x, this.base.y);
    this.base = null;
  }

  reset(): void {
    this.restoreCamera(); this.launchCue = null; this.hitCue = null;
    this.motionSuppressed = false;
    this.graphics.clear(); this.label.setVisible(false).setScale(1).setAlpha(1);
  }

  destroy(): void { this.reset(); this.graphics.destroy(); this.label.destroy(); }
}
