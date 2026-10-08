import type Phaser from 'phaser';
import { FX, WORLD } from '../config/tuning';
import { clamp, clamp01, easeOutBack, easeOutCubic } from '../fx/easing';
import type { ImpactProfile } from '../fx/impactProfile';
import { ParticleSystem, type BurstSpec } from '../fx/particles';
import { artScale } from './artTextures';
import { COMIC_WORD_PX, COMIC_WORD_RES, comicWordKey } from './comicWords';

const POOL = 96;

/**
 * Launch and impact effects. Everything is advanced explicitly by the scene's pause-aware clock:
 * `update(dt)` receives presentation time (hit-stop scaled); the flash counts rendered frames.
 */
export class ShotEffectsRenderer {
  private readonly particles: ParticleSystem;
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly flash: Phaser.GameObjects.Rectangle;
  private readonly star: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  private readonly muzzle: Phaser.GameObjects.Image;
  /** Pre-rendered comic word (see comicWords.ts): swapping textures costs nothing on the contact frame. */
  private readonly label: Phaser.GameObjects.Image;
  private labelBaseScale = 1;
  private flashFramesLeft = 0;
  private muzzleFrames = 0;
  private launchAge: number | null = null;
  private hit: { x: number; y: number; age: number; profile: ImpactProfile; reduced: boolean; dir: number } | null = null;
  private labelAge: number | null = null;
  private labelBase = { x: 0, y: 0, rot: 0 };
  private motionSuppressed = false;

  constructor(private readonly scene: Phaser.Scene, rng: () => number = Math.random) {
    this.particles = new ParticleSystem(POOL, rng);
    this.flash = scene.add.rectangle(WORLD.designWidthPx / 2, WORLD.designHeightPx / 2, 6000, 4000, 0xffffff, 1)
      .setScrollFactor(0).setDepth(60).setVisible(false);
    this.ring = scene.add.image(0, 0, 'fx-ring').setDepth(23).setVisible(false);
    this.star = scene.add.image(0, 0, 'fx-impact-star').setDepth(13).setVisible(false);
    this.muzzle = scene.add.image(0, 0, 'fx-muzzle').setOrigin(30 / 80, 0.5).setDepth(21).setVisible(false);
    for (let i = 0; i < POOL; i++) this.pool.push(scene.add.image(0, 0, 'fx-dust').setDepth(24).setVisible(false));
    this.label = scene.add.image(0, 0, 'fx-pixel').setDepth(50).setVisible(false);
  }

  /** Muzzle flash, smoke and sparks on the frame the ball leaves the barrel. */
  launch(x: number, y: number, angleRad: number, reduced: boolean): void {
    this.launchAge = 0;
    if (reduced) return;
    const dir = -angleRad; // screen y is down
    this.muzzleFrames = 3;
    this.muzzle.setPosition(x, y).setRotation(dir).setVisible(true).setScale(artScale('fx-muzzle') * 1.1);
    this.burst({ kind: 'fx-smoke', count: 7, x, y, angle: dir, spread: 0.9, speed: [40, 150], life: [0.45, 0.85], scale: [0.55, 0.9], endScale: 2.1, gravity: -40, drag: 3.2, spin: 1.5 });
    this.burst({ kind: 'fx-spark', count: 8, x, y, angle: dir, spread: 0.7, speed: [260, 520], life: [0.12, 0.26], scale: [0.7, 1.1], endScale: 0.2, drag: 4 });
  }

  /** Small dust puff where the ball lands or strikes scenery. */
  dust(x: number, y: number, amount: number, reduced: boolean, kind: 'fx-dust' | 'fx-chip' | 'fx-leaf' = 'fx-dust'): void {
    if (reduced || amount <= 0) return;
    this.burst({ kind: 'fx-dust', count: Math.round(5 * amount), x, y: y - 3, angle: -Math.PI / 2, spread: 2.4, speed: [30, 110], life: [0.3, 0.6], scale: [0.4, 0.8], endScale: 1.8, gravity: -20, drag: 4 });
    if (kind !== 'fx-dust') this.burst({ kind, count: Math.round(4 * amount), x, y, angle: -Math.PI / 2, spread: 2.2, speed: [80, 200], life: [0.5, 0.9], scale: [0.8, 1.1], gravity: 520, drag: 1, spin: 10 });
  }

  /**
   * Every layer fires on the same frame: flash, contact star, shockwave ring, radial burst
   * and the comic word. Intensity comes from the impact profile (hit quality).
   */
  impact(x: number, y: number, profile: ImpactProfile, dirX: number, dirY: number, reduced: boolean, word: string | null): void {
    const k = profile.intensity;
    const dir = Math.sign(dirX) || 1;
    this.hit = { x, y, age: 0, profile, reduced, dir };
    if (!reduced) {
      // Layers are shown on this very frame (the scene's effects update already ran).
      this.flash.setVisible(profile.flashFrames > 0).setAlpha(FX.flashAlpha);
      this.flashFramesLeft = Math.max(0, profile.flashFrames - 1);
      const back = Math.hypot(dirX, dirY) || 1;
      this.star.setPosition(x - (dirX / back) * 12, y - (dirY / back) * 12).setRotation(Math.random() * Math.PI).setVisible(k >= 0.3);
      this.ring.setPosition(x, y).setVisible(k >= 0.3);
      this.poseContactSprites(0, k);
      const travel = Math.atan2(dirY, dirX);
      const n = profile.particles;
      this.burst({ kind: 'fx-star', count: Math.round(n * 0.3), x, y, angle: 0, spread: Math.PI * 2, speed: [220 * k, 520 * k], life: [0.35, 0.7], scale: [0.7, 1.2], endScale: 0.4, gravity: 600, drag: 2.5, spin: 9 }, 14);
      this.burst({ kind: 'fx-dust', count: Math.round(n * 0.3), x, y, angle: 0, spread: Math.PI * 2, speed: [80 * k, 220 * k], life: [0.4, 0.75], scale: [0.6, 1.1], endScale: 2.2, gravity: -30, drag: 4 }, 10);
      this.burst({ kind: 'fx-spark', count: Math.round(n * 0.25), x, y, angle: travel, spread: 1.6, speed: [380 * k, 760 * k], life: [0.12, 0.28], scale: [0.8, 1.3], endScale: 0.2, drag: 5 }, 6);
      if (profile.quality !== 'hat') {
        this.burst({ kind: 'fx-scrap', count: Math.round(n * 0.2), x, y: y + 10, angle: -Math.PI / 2 - dir * 0.6, spread: 1.6, speed: [120, 300], life: [1.1, 1.7], scale: [0.9, 1.3], gravity: 160, drag: 2.2, spin: 6, sway: 40 }, 8);
      } else {
        this.burst({ kind: 'fx-star', count: 6, x, y, angle: -Math.PI / 2, spread: 2, speed: [100, 220], life: [0.3, 0.5], scale: [0.5, 0.8], endScale: 0.3, gravity: 300, drag: 2 }, 6);
      }
    }
    if (word && profile.textColor) {
      this.label.setTexture(comicWordKey(word));
      this.labelBaseScale = (40 + 22 * Math.min(1.2, k)) / COMIC_WORD_PX / COMIC_WORD_RES;
      this.labelAge = 0;
      this.labelBase = { x: x - dir * 95, y: y - 70, rot: -0.12 * dir + (Math.random() - 0.5) * 0.1 };
      this.label.setVisible(true).setAlpha(1).setRotation(this.labelBase.rot);
      this.placeLabel(reduced ? 1 : 0.35);
    }
  }

  /** Contact star pops at full size on frame 0 then shrinks; the ring expands. Returns true when both are done. */
  private poseContactSprites(age: number, k: number): boolean {
    const starP = clamp01(age / 0.2);
    const pop = starP < 0.15 ? 1 + starP : 1.15 * (1 - easeOutCubic((starP - 0.15) / 0.85));
    this.star.setScale(artScale('fx-impact-star') * (0.38 + 0.3 * k) * pop);
    this.star.setAlpha(starP < 0.6 ? 1 : 1 - (starP - 0.6) / 0.4);
    if (starP >= 1) this.star.setVisible(false);
    const ringP = clamp01(age / 0.32);
    this.ring.setScale(artScale('fx-ring') * (0.3 + 2.2 * easeOutCubic(ringP)) * (0.6 + 0.4 * k)).setAlpha(1 - ringP);
    if (ringP >= 1) this.ring.setVisible(false);
    return starP >= 1 && ringP >= 1;
  }

  private burst(spec: BurstSpec, startRadius = 0): void {
    const before = this.particles.particles.length;
    this.particles.burst(spec);
    if (startRadius > 0) {
      for (let i = before; i < this.particles.particles.length; i++) {
        const p = this.particles.particles[i]!;
        const len = Math.hypot(p.vx, p.vy) || 1;
        p.x += (p.vx / len) * startRadius;
        p.y += (p.vy / len) * startRadius;
      }
    }
  }

  private placeLabel(scale: number): void {
    const view = this.scene.cameras.main.worldView;
    const s = this.labelBaseScale * scale;
    const halfW = (this.label.width * s) / 2;
    const halfH = (this.label.height * s) / 2;
    const x = clamp(this.labelBase.x, view.x + halfW + 6, Math.max(view.x + halfW + 6, view.right - halfW - 6));
    const y = clamp(this.labelBase.y, view.y + halfH + 6, Math.max(view.y + halfH + 6, view.bottom - halfH - 6));
    this.label.setPosition(x, y).setScale(s);
  }

  /**
   * @param dt presentation seconds (hit-stop scaled) for particles and contact sprites
   * @param realDt real seconds for the recoil and comic word (they read during the freeze)
   * @returns current barrel recoil in px
   */
  update(dt: number, reduced: boolean, realDt = dt): number {
    if (reduced && !this.motionSuppressed) {
      this.motionSuppressed = true;
      this.particles.clear();
      this.flashFramesLeft = 0;
      this.muzzleFrames = 0;
      this.star.setVisible(false);
      this.ring.setVisible(false);
    }
    if (!reduced) this.motionSuppressed = false;

    // Frame-counted flash: full on the contact frame (set in impact), dimmer on the next.
    this.flash.setVisible(this.flashFramesLeft > 0);
    if (this.flashFramesLeft > 0) {
      this.flash.setAlpha(FX.flashAlpha * 0.45);
      this.flashFramesLeft--;
    }
    this.muzzle.setVisible(this.muzzleFrames > 0);
    if (this.muzzleFrames > 0) {
      this.muzzle.setScale(artScale('fx-muzzle') * (this.muzzleFrames === 3 ? 1.15 : this.muzzleFrames === 2 ? 0.9 : 0.5));
      this.muzzleFrames--;
    }

    let recoil = 0;
    if (this.launchAge !== null) {
      this.launchAge += realDt;
      const p = clamp01(this.launchAge / 0.32);
      recoil = reduced ? 0 : FX.recoilPx * (p < 0.12 ? p / 0.12 : (1 - easeOutCubic((p - 0.12) / 0.88)));
      if (p >= 1) this.launchAge = null;
    }

    if (this.hit) {
      const h = this.hit;
      h.age += dt;
      const done = this.poseContactSprites(h.age, h.profile.intensity);
      if (done && this.labelAge === null) this.hit = null;
    }

    if (this.labelAge !== null) {
      this.labelAge += realDt;
      const a = this.labelAge;
      const life = FX.textSeconds;
      const isReduced = this.hit?.reduced ?? reduced;
      let scale = 1;
      let alpha = 1;
      if (isReduced) {
        alpha = a < life * 0.7 ? 1 : Math.max(0, 1 - (a - life * 0.7) / (life * 0.3));
      } else {
        scale = a < 0.18 ? 0.35 + 0.65 * easeOutBack(a / 0.18, 3.2) : 1 + 0.03 * Math.sin(a * 9);
        if (a > life - 0.16) {
          const out = clamp01((a - (life - 0.16)) / 0.16);
          scale *= 1 + 0.35 * out;
          alpha = 1 - out;
        }
        this.labelBase.y -= realDt * 14;
      }
      this.label.setAlpha(alpha);
      this.placeLabel(scale);
      if (a >= life) { this.labelAge = null; this.label.setVisible(false); }
    }

    this.particles.step(dt);
    this.drawParticles();
    return recoil;
  }

  private drawParticles(): void {
    const list = this.particles.particles;
    for (let i = 0; i < this.pool.length; i++) {
      const img = this.pool[i]!;
      const p = list[i];
      if (!p) { if (img.visible) img.setVisible(false); continue; }
      if (img.texture.key !== p.kind) img.setTexture(p.kind);
      const fade = ParticleSystem.fade(p);
      img.setVisible(true).setPosition(p.x, p.y).setRotation(p.kind === 'fx-spark' ? Math.atan2(p.vy, p.vx) : p.rot)
        .setScale(artScale(p.kind) * ParticleSystem.currentScale(p))
        .setAlpha(p.kind === 'fx-smoke' || p.kind === 'fx-dust' ? Math.min(1, fade * 1.6) : fade > 0.25 ? 1 : fade * 4);
    }
  }

  /** Number of live particles (bounded by the pool). */
  get particleCount(): number { return this.particles.particles.length; }

  reset(): void {
    this.particles.clear();
    this.drawParticles();
    this.hit = null;
    this.launchAge = null;
    this.labelAge = null;
    this.flashFramesLeft = 0;
    this.muzzleFrames = 0;
    this.motionSuppressed = false;
    this.flash.setVisible(false);
    this.star.setVisible(false);
    this.ring.setVisible(false);
    this.muzzle.setVisible(false);
    this.label.setVisible(false).setAlpha(1);
  }

  destroy(): void {
    this.reset();
    for (const img of this.pool) img.destroy();
    this.flash.destroy();
    this.star.destroy();
    this.ring.destroy();
    this.muzzle.destroy();
    this.label.destroy();
  }
}
