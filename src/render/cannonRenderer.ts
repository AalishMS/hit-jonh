import type Phaser from 'phaser';
import { barrelKey } from '../art/cannonArt';
import { PAL, hex } from '../art/palette';
import { AIM, PROJECTILE } from '../config/tuning';
import { clamp01 } from '../fx/easing';
import type { Point2D } from '../levels/types';
import { metresToPixels, simYToWorldY } from '../sim/units';
import { levelPhysics, type LevelPhysics } from '../levels/levelPhysics';
import { artImage, artScale } from './artTextures';

const METER = { width: 170, height: 16, offsetY: 30 } as const;

/**
 * The cannon: carriage, wheel and a barrel painted in the shooter's colour and pattern.
 * Cosmetic only: the physical muzzle position and launch velocity never depend on the drawing.
 */
export class CannonRenderer {
  private recoilPx = 0;
  private windup = 0;
  private time = 0;
  private angleDeg = 45;
  private powerPercent = 50;
  private showAimAids = true;
  private pivotXPx: number;
  private pivotYPx: number;
  private readonly carriage: Phaser.GameObjects.Image;
  private readonly barrel: Phaser.GameObjects.Image;
  private readonly wheel: Phaser.GameObjects.Image;
  private readonly fuse: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly guide: Phaser.GameObjects.Graphics;
  private readonly meter: Phaser.GameObjects.Graphics;
  private readonly meterText: Phaser.GameObjects.Text;
  private lastMeterKey = '';
  /** Size multiplier for the power meter so it stays readable on zoomed-out maps. */
  private uiScale = 1;

  constructor(
    scene: Phaser.Scene,
    cannonSpawn: Point2D,
    private readonly ppm: number,
    private readonly worldHeightPx: number,
    private readonly physics: LevelPhysics = levelPhysics({}),
  ) {
    this.pivotXPx = metresToPixels(cannonSpawn.x, ppm);
    this.pivotYPx = simYToWorldY(cannonSpawn.y, worldHeightPx, ppm);
    this.shadow = scene.add.image(this.pivotXPx, this.pivotYPx + 32, 'fx-shadow').setScale(0.75, 0.5).setDepth(9);
    this.carriage = artImage(scene, this.pivotXPx, this.pivotYPx, 'cannon-carriage').setDepth(10);
    this.barrel = artImage(scene, this.pivotXPx, this.pivotYPx, 'cannon-barrel').setDepth(10.5);
    this.wheel = artImage(scene, this.pivotXPx - 6, this.pivotYPx + 12, 'cannon-wheel').setDepth(11);
    this.fuse = artImage(scene, 0, 0, 'fx-spark-fuse').setDepth(11.5).setVisible(false);
    this.guide = scene.add.graphics().setDepth(12);
    this.meter = scene.add.graphics().setDepth(8);
    this.meterText = scene.add.text(this.pivotXPx, this.pivotYPx + METER.offsetY + 28, '', {
      fontFamily: 'Nunito, system-ui, sans-serif', fontStyle: '900', fontSize: '13px', color: PAL.ink,
    }).setOrigin(0.5, 0).setResolution(2).setDepth(8);
  }

  get pivot(): { x: number; y: number } { return { x: this.pivotXPx, y: this.pivotYPx }; }

  /** On zoomed-out maps (1 / resting zoom) the power meter keeps its on-screen size. */
  setUiScale(k: number): void {
    this.uiScale = k;
    this.lastMeterKey = '';
  }

  setPosition(cannonSpawn: Point2D): void {
    this.pivotXPx = metresToPixels(cannonSpawn.x, this.ppm);
    this.pivotYPx = simYToWorldY(cannonSpawn.y, this.worldHeightPx, this.ppm);
  }

  getMuzzlePosition(angleDeg: number, ballRadiusMetres: number): { x: number; y: number } {
    const rad = (angleDeg * Math.PI) / 180;
    // Spawn tip offset: slightly ahead of barrel so ball cannot intersect barrel
    const offsetMetres = AIM.barrelLengthMetres + ballRadiusMetres + AIM.muzzleGapMetres;
    const offsetPx = metresToPixels(offsetMetres, this.ppm);
    return {
      x: this.pivotXPx + offsetPx * Math.cos(rad),
      y: this.pivotYPx - offsetPx * Math.sin(rad),
    };
  }

  setRecoil(pixels: number, _angleDeg?: number): void { this.recoilPx = pixels; }
  /** 0..1 cannon wind-up before launch (anticipation). */
  setWindup(progress: number): void { this.windup = clamp01(progress); }
  /** Shows the launch preview and power meter only while the player can aim. */
  setAimAids(visible: boolean, powerPercent: number): void {
    this.showAimAids = visible;
    this.powerPercent = powerPercent;
  }

  update(dt: number): void { this.time += dt; }

  draw(angleDeg: number, color: number | null = null, pattern: string = 'solid'): void {
    this.angleDeg = angleDeg;
    const rad = (angleDeg * Math.PI) / 180;
    const key = barrelKey(color, color === null ? null : pattern);
    if (this.barrel.texture.key !== key && this.barrel.scene.textures.exists(key)) this.barrel.setTexture(key);
    const base = artScale('cannon-barrel');
    const w = this.windup;
    const ax = Math.cos(rad);
    const ay = -Math.sin(rad);
    const kick = this.recoilPx;
    // Anticipation squashes the barrel along its axis; recoil slides it back and rolls the carriage.
    this.barrel.setPosition(this.pivotXPx - ax * kick, this.pivotYPx - ay * kick)
      .setRotation(-rad - (kick / Math.max(1, 18)) * 0.06)
      .setScale(base * (1 - 0.14 * w), base * (1 + 0.2 * w));
    const roll = kick * 0.45;
    this.carriage.setPosition(this.pivotXPx - roll, this.pivotYPx + 2 * w).setScale(artScale('cannon-carriage') * (1 + 0.05 * w), artScale('cannon-carriage') * (1 - 0.08 * w));
    this.wheel.setPosition(this.pivotXPx - 6 - roll, this.pivotYPx + 12).setRotation(-roll / 19);
    this.shadow.setPosition(this.pivotXPx - roll, this.pivotYPx + 32);

    this.fuse.setVisible(w > 0);
    if (w > 0) {
      // Breech top in barrel space (-13, -6) mapped through the barrel rotation.
      const fx = this.pivotXPx - 13 * ax + 6 * ay;
      const fy = this.pivotYPx - 13 * ay - 6 * ax;
      this.fuse.setPosition(fx, fy).setScale(artScale('fx-spark-fuse') * (0.8 + 0.6 * Math.abs(Math.sin(this.time * 60))))
        .setRotation(this.time * 20);
    }
    this.drawGuide(rad);
    this.drawMeter();
  }

  /** The first ~0.3 s of the analytic arc: direction and power at a glance, never the landing. */
  private drawGuide(rad: number): void {
    const g = this.guide;
    g.clear();
    if (!this.showAimAids) return;
    const muzzle = this.getMuzzlePosition(this.angleDeg, PROJECTILE.radiusMetres);
    const speedPx = this.physics.launchSpeed(this.powerPercent) * this.ppm;
    const gPx = this.physics.gravity * this.ppm;
    const count = 9;
    for (let i = 1; i <= count; i++) {
      const t = (AIM.previewSeconds * i) / count;
      const x = muzzle.x + Math.cos(rad) * speedPx * t;
      const y = muzzle.y - (Math.sin(rad) * speedPx * t - 0.5 * gPx * t * t);
      const r = 4.2 - (i / count) * 2.2;
      const a = 1 - (i / count) * 0.65;
      g.fillStyle(hex(PAL.ink), a);
      g.fillCircle(x, y, r + 1.6);
      g.fillStyle(hex(PAL.paper), a);
      g.fillCircle(x, y, r);
    }
  }

  private drawMeter(): void {
    const key = `${this.showAimAids}-${this.powerPercent}-${this.angleDeg}`;
    if (key === this.lastMeterKey) return;
    this.lastMeterKey = key;
    const g = this.meter;
    g.clear();
    this.meterText.setVisible(this.showAimAids);
    if (!this.showAimAids) return;
    // Drawn around the pivot so the whole meter scales with uiScale.
    const k = this.uiScale;
    // A scaled-up meter near the map edge is nudged inward so it stays fully on screen.
    const cx = Math.max(this.pivotXPx, (METER.width / 2 + 8) * k);
    g.setPosition(cx, this.pivotYPx).setScale(k);
    this.meterText.setPosition(cx, this.pivotYPx + (METER.offsetY + 28) * k).setScale(k);
    const x = -METER.width / 2;
    const y = METER.offsetY + 6;
    g.fillStyle(hex(PAL.ink), 1);
    g.fillRoundedRect(x + 3, y + 3, METER.width, METER.height, 8);
    g.fillStyle(hex(PAL.paper), 1);
    g.fillRoundedRect(x, y, METER.width, METER.height, 8);
    const filled = (METER.width - 6) * (this.powerPercent / 100);
    if (filled > 1) {
      // Green → zap → pow as power rises, in segments like a fairground strength meter.
      const segments = 12;
      const segW = (METER.width - 6) / segments;
      for (let i = 0; i < segments; i++) {
        const sx = x + 3 + i * segW;
        const w = Math.min(segW - 1.5, filled - i * segW);
        if (w <= 0) break;
        const color = i < 5 ? PAL.leaf : i < 9 ? PAL.zap : PAL.pow;
        g.fillStyle(hex(color), 1);
        g.fillRect(sx, y + 3, w, METER.height - 6);
      }
    }
    g.lineStyle(3, hex(PAL.ink), 1);
    g.strokeRoundedRect(x, y, METER.width, METER.height, 8);
    this.meterText.setText(`ANGLE ${this.angleDeg}°   POWER ${this.powerPercent}%`);
  }

  destroy(): void {
    for (const o of [this.carriage, this.barrel, this.wheel, this.fuse, this.shadow, this.guide, this.meter, this.meterText]) o.destroy();
  }
}
