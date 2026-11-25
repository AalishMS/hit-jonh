import type Phaser from 'phaser';
import { PAL, hex } from '../art/palette';
import { WIND } from '../config/tuning';
import { hash01 } from '../fx/easing';
import { sockChain, sockLift, streakAlpha, streakDriftPxPerSecond, windCaption, windDirection } from '../fx/windVisuals';
import type { LevelData } from '../levels/types';
import { metresToPixels, simYToWorldY } from '../sim/units';
import { artImage } from './artTextures';

/** Behind the playfield (the pole stands on the back lawn); the caption and streaks sit over it. */
const DEPTH = { pole: -58, sock: -57, streak: 3.8, caption: 6 } as const;
/** Pole height above the ground (px). */
const POLE_PX = 132;
/** How far streaks run past the visible world before wrapping (px). */
const WRAP_MARGIN = 120;

interface Streak { image: Phaser.GameObjects.Image; x: number; speedFactor: number }

/**
 * A level's constant wind on screen (SPEC §8.7): a windsock on a pole that lifts and points
 * downwind with the wind's strength, a "Wind ← 3" caption, and faint streaks drifting the same way.
 * Reduced motion keeps the sock, caption and streaks but holds them still. Nothing here collides
 * or affects physics; draws nothing on a calm level.
 */
export class WindRenderer {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private streaks: Streak[] = [];
  private sock: Phaser.GameObjects.Graphics | null = null;
  private level: LevelData | null = null;
  private poleX = 0;
  private poleTop = 0;
  private left = 0;
  private right = 0;
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ppm: number,
    private readonly worldHeightPx: number,
    private readonly worldWidthPx: number,
  ) {}

  /** Whether the current level has wind (the scene may show the caption in its HUD too). */
  get active(): boolean { return this.level?.wind !== undefined; }

  draw(level: LevelData): void {
    this.clear();
    const wind = level.wind;
    if (!wind) return;
    this.level = level;
    const s = this.scene;
    const a = wind.accelerationMs2;
    const dir = windDirection(a);
    const groundTop = simYToWorldY(level.ground.maxY, this.worldHeightPx, this.ppm);
    this.poleX = metresToPixels(wind.windsockX ?? WIND.defaultSockXMetres, this.ppm);
    this.poleTop = groundTop - POLE_PX;
    this.left = -WRAP_MARGIN;
    this.right = Math.max(this.worldWidthPx, metresToPixels(level.bounds.maxX, this.ppm)) + WRAP_MARGIN;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.objects.push(o); return o; };

    // Pole, base plate and the sock's mouth ring.
    const pole = add(s.add.graphics().setDepth(DEPTH.pole));
    pole.lineStyle(7, hex(PAL.ink), 1).lineBetween(this.poleX, groundTop + 2, this.poleX, this.poleTop);
    pole.lineStyle(3.5, hex(PAL.stone), 1).lineBetween(this.poleX, groundTop + 2, this.poleX, this.poleTop);
    pole.fillStyle(hex(PAL.ink), 1).fillCircle(this.poleX, this.poleTop, 5.5);
    pole.fillStyle(hex(PAL.brass), 1).fillCircle(this.poleX, this.poleTop, 3.2);
    this.sock = add(s.add.graphics().setDepth(DEPTH.sock));
    this.drawSock(0, false);

    // The caption: readable before the first shot.
    add(s.add.text(this.poleX, this.poleTop - 34, windCaption(a), {
      fontFamily: 'Nunito, system-ui, sans-serif', fontStyle: '900', fontSize: '17px', color: PAL.paper,
    }).setOrigin(0.5, 0.5).setStroke(PAL.ink, 5).setResolution(2).setDepth(DEPTH.caption));

    // Drifting streaks, laid out by a fixed hash so every visit to the garden looks the same.
    const top = 24;
    const bottom = groundTop - 36;
    for (let i = 0; i < WIND.streakCount; i++) {
      const x = this.left + hash01(i * 3.7 + 1) * (this.right - this.left);
      const y = top + hash01(i * 5.3 + 2) * (bottom - top);
      const length = 0.6 + hash01(i * 7.1 + 3) * 0.9;
      const image = add(artImage(s, x, y, 'wind-streak').setDepth(DEPTH.streak).setAlpha(streakAlpha(a) * (0.5 + hash01(i * 2.9 + 4) * 0.5)));
      image.setScale(image.scaleX * length * (dir === 0 ? 1 : dir), image.scaleY);
      this.streaks.push({ image, x, speedFactor: 0.7 + hash01(i * 4.1 + 5) * 0.6 });
    }
  }

  /** Real-time clock; held still under reduced motion. */
  update(dt: number, reduced: boolean): void {
    const wind = this.level?.wind;
    if (!wind || reduced || !(dt > 0)) return;
    this.time += dt;
    this.drawSock(this.time, true);
    const drift = streakDriftPxPerSecond(wind.accelerationMs2);
    const span = this.right - this.left;
    for (const streak of this.streaks) {
      streak.x += drift * streak.speedFactor * dt;
      if (streak.x > this.right) streak.x -= span;
      else if (streak.x < this.left) streak.x += span;
      streak.image.setPosition(streak.x, streak.image.y);
    }
  }

  private drawSock(time: number, flutter: boolean): void {
    const wind = this.level?.wind;
    if (!wind || !this.sock) return;
    const dir = windDirection(wind.accelerationMs2) || 1;
    const g = this.sock;
    g.clear();
    const segments = sockChain(sockLift(wind.accelerationMs2), time, flutter);
    segments.forEach((seg, i) => {
      const ox = this.poleX;
      const oy = this.poleTop;
      const pt = (x: number, y: number) => ({ x: ox + x * dir, y: oy + y });
      const quad = [pt(seg.top.x0, seg.top.y0), pt(seg.top.x1, seg.top.y1), pt(seg.bottom.x1, seg.bottom.y1), pt(seg.bottom.x0, seg.bottom.y0)];
      g.fillStyle(hex(i % 2 === 0 ? PAL.pow : PAL.paper), 1);
      g.lineStyle(2.4, hex(PAL.ink), 1);
      g.beginPath();
      g.moveTo(quad[0]!.x, quad[0]!.y);
      for (const p of quad.slice(1)) g.lineTo(p.x, p.y);
      g.closePath();
      g.fillPath();
      g.strokePath();
    });
  }

  clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.streaks = [];
    this.sock = null;
    this.level = null;
    this.time = 0;
  }

  destroy(): void {
    this.clear();
  }
}
