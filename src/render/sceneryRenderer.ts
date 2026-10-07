import type Phaser from 'phaser';
import { hex } from '../art/palette';
import { obstacleKey, themeFor } from '../art/sceneryArt';
import { hash01 } from '../fx/easing';
import type { LevelData } from '../levels/types';
import { metresToPixels, simYToWorldY } from '../sim/units';
import { artImage, artMeta, artScale } from './artTextures';

/** Layer depths: background < playfield < actors. */
const DEPTH = { sky: -100, sun: -95, cloud: -90, far: -80, bird: -75, mid: -70, fence: -60, ground: 1, obstacle: 2, prop: 4, flora: 5 } as const;
/** Horizontal extent drawn beyond the 1280 px world so camera zoom-outs never show an edge. */
const LEFT = -700;
const SPAN = 2700;

interface Drifter { obj: Phaser.GameObjects.Image; speed: number; baseY: number; phase: number }

/**
 * Four parallax layers (sky, far, mid, garden) plus the playfield. Built from small shared
 * textures so memory stays low on phones. Ambient motion is slow and small; reduced motion
 * stops it entirely.
 */
export class SceneryRenderer {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private clouds: Drifter[] = [];
  private birds: Drifter[] = [];
  private flora: Array<{ obj: Phaser.GameObjects.Image; phase: number }> = [];
  private rays: Phaser.GameObjects.Image | null = null;
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ppm: number,
    private readonly worldHeightPx: number,
    private readonly worldWidthPx: number,
  ) {}

  draw(level: LevelData): void {
    this.clear();
    const s = this.scene;
    const theme = themeFor(level.id);
    const groundTop = simYToWorldY(level.ground.maxY, this.worldHeightPx, this.ppm);
    s.cameras.main.setBackgroundColor(theme.skyTop);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.objects.push(o); return o; };

    // 1. Sky (fixed), sun and turning rays.
    add(s.add.image(LEFT - 600, groundTop - 768, `sky-${theme.id}`).setOrigin(0, 0)
      .setDisplaySize(SPAN + 1200, 800).setScrollFactor(0).setDepth(DEPTH.sky));
    this.rays = add(s.add.image(1040, theme.sunY, 'sun-rays').setScrollFactor(0.05).setDepth(DEPTH.sun));
    add(s.add.image(1040, theme.sunY, `sun-${theme.id}`).setScrollFactor(0.05).setDepth(DEPTH.sun));
    for (let i = 0; i < 6; i++) {
      const key = ['cloud-a', 'cloud-b', 'cloud-c'][i % 3]!;
      const x = LEFT + 250 + i * 420 + hash01(i + level.id.length) * 160;
      const y = 50 + hash01(i * 7.3) * 170;
      const obj = add(s.add.image(x, y, key).setScrollFactor(0.12, 0.3).setDepth(DEPTH.cloud).setScale(0.8 + hash01(i * 3.1) * 0.5));
      this.clouds.push({ obj, speed: 5 + hash01(i * 5.7) * 9, baseY: y, phase: 0 });
    }

    // 2. Far hills / skyline and 3. mid hills with trees. Solid fills continue downward
    //    so vertical parallax never opens a gap above the ground.
    const far = artMeta(`far-${theme.id}`);
    add(s.add.tileSprite(LEFT, groundTop - 58, SPAN, far.h, `far-${theme.id}`).setOrigin(0, 1)
      .setTilePosition(hash01(level.id.length) * 400, 0).setScrollFactor(0.25, 0.6).setDepth(DEPTH.far));
    add(s.add.rectangle(LEFT, groundTop - 62, SPAN, 400, hex(theme.far)).setOrigin(0, 0).setScrollFactor(0.25, 0.6).setDepth(DEPTH.far));
    const mid = artMeta(`mid-${theme.id}`);
    add(s.add.tileSprite(LEFT, groundTop - 10, SPAN, mid.h, `mid-${theme.id}`).setOrigin(0, 1)
      .setTileScale(1 / mid.scale).setTilePosition(hash01(level.id.length * 2) * 600, 0).setScrollFactor(0.5, 0.8).setDepth(DEPTH.mid));
    add(s.add.rectangle(LEFT, groundTop - 14, SPAN, 400, hex(theme.mid)).setOrigin(0, 0).setScrollFactor(0.5, 0.8).setDepth(DEPTH.mid));
    for (let i = 0; i < 3; i++) {
      const obj = add(s.add.image(-200 - i * 500, 120 + i * 40, 'bird').setScale(artScale('bird')).setScrollFactor(0.3).setDepth(DEPTH.bird));
      this.birds.push({ obj, speed: 38 + i * 9, baseY: 120 + i * 40, phase: i * 1.7 });
    }

    // 4. The garden boundary just behind the playfield.
    add(s.add.tileSprite(LEFT, groundTop + 2, SPAN, 50, 'fence-back').setOrigin(0, 1).setTileScale(0.5).setAlpha(0.85)
      .setScrollFactor(0.85, 1).setDepth(DEPTH.fence));

    // Playfield ground: ink edge sits exactly on the collider top.
    add(s.add.tileSprite(LEFT, groundTop - 1.5, SPAN, 40, 'ground-top').setOrigin(0, 0).setTileScale(0.5).setDepth(DEPTH.ground));
    add(s.add.tileSprite(LEFT, groundTop + 38, SPAN, 400, 'earth').setOrigin(0, 0).setTileScale(0.5).setDepth(DEPTH.ground));

    // Obstacles: textures generated at their collider size.
    for (const obs of level.obstacles) {
      const x = metresToPixels(obs.box.minX, this.ppm);
      const y = simYToWorldY(obs.box.maxY, this.worldHeightPx, this.ppm);
      if (obs.material === 'rubber') {
        // Non-solid hanging chains make the floating bouncy beam read as suspended.
        const w = metresToPixels(obs.box.maxX - obs.box.minX, this.ppm);
        for (const cx of [x + 30, x + w - 30]) {
          add(s.add.rectangle(cx, y - 400, 3, 400, 0x2a1b2e, 0.55).setOrigin(0.5, 0).setDepth(DEPTH.obstacle));
        }
      }
      add(s.add.image(x, y, obstacleKey(level.id, obs)).setOrigin(0, 0).setScale(artScale(obstacleKey(level.id, obs))).setDepth(DEPTH.obstacle));
    }

    // Jonh's tea table, kept on his support surface.
    const b = level.jonhSpawn.bodyBox;
    const jonhX = metresToPixels((b.minX + b.maxX) / 2, this.ppm);
    const baseY = simYToWorldY(b.minY, this.worldHeightPx, this.ppm);
    const support = level.obstacles.find(o => Math.abs(o.box.maxY - b.minY) < 1e-6 && o.box.minX <= b.minX && o.box.maxX >= b.maxX);
    const rightEdge = support ? metresToPixels(support.box.maxX, this.ppm) : this.worldWidthPx;
    const tableX = jonhX + 82 + 32 > rightEdge ? jonhX - 82 : jonhX + 82;
    add(artImage(s, tableX, baseY, 'tea-table').setDepth(DEPTH.prop));

    // Flowers and tufts on open grass only (never on obstacles, the cannon or Jonh).
    const blocked = (x: number) => x < 230 || Math.abs(x - jonhX) < 90 || Math.abs(x - tableX) < 40 ||
      level.obstacles.some(o => x > metresToPixels(o.box.minX, this.ppm) - 16 && x < metresToPixels(o.box.maxX, this.ppm) + 16 && o.box.minY <= level.ground.maxY + 1e-6);
    for (let i = 0; i < 26; i++) {
      const x = 20 + i * 50 + hash01(i * 2.7 + level.id.length) * 30;
      if (blocked(x) || x > this.worldWidthPx - 10) continue;
      const key = i % 3 === 0 ? 'flower-a' : i % 3 === 1 ? 'tuft' : (i % 2 ? 'flower-b' : 'tuft');
      const obj = add(artImage(s, x, groundTop + 6, key).setDepth(DEPTH.flora));
      obj.setScale(obj.scaleX * (0.8 + hash01(i) * 0.4));
      this.flora.push({ obj, phase: hash01(i * 9.1) * Math.PI * 2 });
    }
  }

  /** Ambient motion on the real-time clock (not the hit-stop clock). */
  update(dt: number, reduced: boolean): void {
    if (reduced || !(dt > 0)) return;
    this.time += dt;
    this.rays?.setRotation(this.time * 0.05);
    for (const c of this.clouds) {
      c.obj.x += c.speed * dt;
      if (c.obj.x > LEFT + SPAN) c.obj.x = LEFT - 100;
    }
    for (const b of this.birds) {
      const cycle = 26;
      const local = (this.time + b.phase * 7) % cycle;
      b.obj.setVisible(local < 22);
      b.obj.x = -150 + local * b.speed;
      b.obj.y = b.baseY + Math.sin(local * 1.3) * 6;
      b.obj.scaleY = artScale('bird') * (Math.sin((this.time + b.phase) * 12) > 0 ? 1 : -0.7);
    }
    for (const f of this.flora) f.obj.setRotation(Math.sin(this.time * 1.4 + f.phase) * 0.08);
  }

  private clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.clouds = [];
    this.birds = [];
    this.flora = [];
    this.rays = null;
  }

  destroy(): void { this.clear(); }
}
