import type Phaser from 'phaser';
import type { AudioManager } from '../audio/audioManager';
import { FLOW, FX, LOOK, PROJECTILE, WORLD } from '../config/tuning';
import { aimFrame, levelView, type Viewport } from '../fx/cameraDirector';
import { clamp01, easeInOutSine } from '../fx/easing';
import { impactProfile, type HitQuality } from '../fx/impactProfile';
import { levelPhysics } from '../levels/levelPhysics';
import type { LevelData } from '../levels/types';
import { routePoseAt } from '../levels/jonhRoute';
import { sampleRecorded, sampleRecordedJonh, type RecordedShot } from '../physics/shotRecorder';
import { metresToPixels, simYToWorldY } from '../sim/units';
import type { HatId } from '../art/jonhArt';
import type { CannonSkinId, OutfitId } from '../rules/cosmetics';
import { BallRenderer } from './ballRenderer';
import type { CameraRig } from './cameraRig';
import { CannonRenderer } from './cannonRenderer';
import type { ImpactTimeline } from './impactTimeline';
import { JonhRenderer } from './jonhRenderer';
import { SceneryRenderer } from './sceneryRenderer';
import type { ShotEffectsRenderer } from './shotEffectsRenderer';

export interface DemoStageDeps {
  audio: AudioManager;
  effects: ShotEffectsRenderer;
  camera: CameraRig;
  /** The hit-stop / slow-motion clock, so a demo bonk lands like a real one. */
  timeline: ImpactTimeline;
}

export interface DemoStageOptions {
  hatId: HatId;
  outfitId?: OutfitId;
  /** Cannon skin (solo/title look; a painted multiplayer cannon stays classic). */
  skin?: CannonSkinId;
  reducedMotion: boolean;
  /** Cannon paint (multiplayer colour + pattern); null keeps the solo cannon. */
  color?: number | null;
  pattern?: string;
  /** In-canvas text size boost on small screens (see fx/readability.ts). */
  textBoost?: number;
}

export interface DemoShot {
  shot: RecordedShot;
  angleDeg: number;
  powerPercent: number;
  /** Jonh's line when it lands. */
  line: string;
  /** Called on the contact frame, and when the ball has bounced away and the stage is free. */
  onImpact?: () => void;
  onDone?: () => void;
}

type Phase = 'aim' | 'windup' | 'flight' | 'after';

/**
 * A self-contained garden that plays a recorded shot at Jonh: the cannon swings round, winds up,
 * fires, the ball follows the recorded (genuine Matter) path, and the full impact plays — comic
 * word, flash, particles, camera punch, sound and knock-back. Presentation only: used by the title
 * screen and the winning-shot replay. It never touches the game's physics or rules.
 */
export class DemoStage {
  readonly scenery: SceneryRenderer;
  readonly jonh: JonhRenderer;
  readonly cannon: CannonRenderer;
  readonly ball: BallRenderer;
  angle = 38;
  private demo: (DemoShot & { aimFrom: number; phase: Phase; t: number; ball: { x: number; y: number; vx: number; vy: number } | null; nextEvent: number }) | null = null;
  private recoverIn: number | null = null;
  private readonly color: number | null;
  private readonly pattern: string;
  /** The map's resting view: wide maps (the Valley) are shown zoomed out, as in play. */
  private readonly view: Viewport;

  constructor(scene: Phaser.Scene, readonly level: LevelData, private readonly deps: DemoStageDeps, options: DemoStageOptions) {
    const { designWidthPx: w, designHeightPx: h, pixelsPerMetre: ppm } = WORLD;
    this.scenery = new SceneryRenderer(scene, ppm, h, w);
    this.scenery.draw(level);
    this.jonh = new JonhRenderer(scene, level.jonhSpawn, ppm, h, { level, hatId: options.hatId, ...(options.outfitId ? { outfitId: options.outfitId } : {}) });
    this.jonh.setReducedMotion(options.reducedMotion);
    this.cannon = new CannonRenderer(scene, level.cannonSpawn, ppm, h, levelPhysics(level), options.skin);
    this.cannon.setAimAids(false, 50);
    this.color = options.color ?? null;
    this.pattern = options.pattern ?? 'solid';
    this.cannon.draw(this.angle, this.color, this.pattern);
    this.ball = new BallRenderer(scene, metresToPixels(PROJECTILE.radiusMetres, ppm));
    this.ball.setVisible(false);
    this.view = levelView(level.bounds.maxX * ppm, { width: w, height: h });
    deps.camera.setView(this.view);
    const k = 1 / (this.view.zoom ?? 1);
    this.cannon.setUiScale(k);
    this.jonh.setUiScale(k * (options.textBoost ?? 1));
  }

  /** A shot is being aimed, flown or is bouncing away. */
  get busy(): boolean { return this.demo !== null; }

  fire(shot: DemoShot): void {
    if (this.demo) return;
    this.jonh.resetToIdle();
    this.jonh.followRoute(this.routeStart());
    this.recoverIn = null;
    this.scenery.mechanics.reset(); // every pane whole, every hoop ready (as before any shot)
    this.demo = { ...shot, aimFrom: this.angle, phase: 'aim', t: 0, ball: null, nextEvent: 0 };
  }

  update(dt: number, reduced: boolean): void {
    const { audio, effects, camera, timeline } = this.deps;
    this.scenery.update(dt, reduced);
    const reaction = timeline.advance(dt, false, reduced);
    const recoil = effects.update(reaction, reduced, dt);
    const d = this.demo;
    if (d) {
      d.t += dt;
      if (d.phase === 'aim') {
        const k = clamp01(d.t / FX.demoAimSeconds);
        this.angle = d.aimFrom + (d.angleDeg - d.aimFrom) * easeInOutSine(k);
        if (k >= 1) { d.phase = 'windup'; d.t = 0; audio.playFuse(); }
      } else if (d.phase === 'windup') {
        this.cannon.setWindup(clamp01(d.t / FX.windupSeconds));
        if (d.t >= FX.windupSeconds) {
          this.cannon.setWindup(0);
          d.phase = 'flight';
          d.t = 0;
          const muzzle = this.cannon.getMuzzlePosition(this.angle, PROJECTILE.radiusMetres);
          effects.launch(muzzle.x, muzzle.y, this.angle * Math.PI / 180, reduced, d.powerPercent / 100);
          audio.playCannonFire(d.powerPercent / 100);
        }
      } else if (d.phase === 'flight') {
        const points = d.shot.points;
        const end = points[d.shot.contactIndex ?? points.length - 1]!.t;
        const now = Math.min(d.t, end);
        const p = sampleRecorded(points, now);
        // Walking Jonh walks the recorded route in step with the ball (he stops where it hits him).
        this.jonh.followRoute(sampleRecordedJonh(d.shot, now));
        const q = sampleRecorded(points, Math.max(0, now - 1 / 60));
        const maxSpeed = levelPhysics(this.level).maxSpeedMs * WORLD.pixelsPerMetre;
        this.ball.draw(p.x, p.y, (p.x - q.x) * 60, (p.y - q.y) * 60, dt, reduced, maxSpeed);
        // Smashed panes and portal jumps happen on the recorded steps, with their sound and sparkle.
        const recorded = d.shot.events;
        while (d.nextEvent < recorded.length && recorded[d.nextEvent]!.t <= now) {
          const e = recorded[d.nextEvent++]!;
          this.scenery.mechanics.playRecorded(e.events, e.vxSim, e.vySim, reduced, audio);
        }
        if (d.t >= end) {
          d.phase = 'after';
          d.t = 0;
          if (d.shot.contactIndex !== null) {
            const quality: HitQuality = d.shot.trick ? 'trick' : d.shot.impactSpeedMs >= LOOK.strongImpactMs ? 'strong' : 'weak';
            const profile = impactProfile(quality, reduced);
            const word = profile.words.length ? profile.words[Math.floor(Math.random() * profile.words.length)]! : null;
            timeline.bodyImpact(reduced, profile);
            effects.impact(p.x, p.y, profile, d.shot.dirX, 0, reduced, word);
            camera.impact(profile.shakePx * 0.6, profile.shakeSeconds, FX.shakeHz, d.shot.dirX, 0, profile.zoomPunch * 0.6, FX.punchSeconds);
            this.ball.squash(Math.atan2(0, d.shot.dirX), 1);
            audio.playHit(quality);
            this.jonh.triggerHit(d.shot.impactSpeedMs, d.line, quality === 'trick' ? 'trick' : quality === 'strong' ? 'strong' : 'weak', d.shot.dirX);
            this.recoverIn = FLOW.attractRecoverSeconds;
            d.onImpact?.();
          }
          d.ball = { x: p.x, y: p.y, vx: -d.shot.dirX * 95, vy: -210 };
        }
      } else if (d.ball) {
        // The ball bounces away cosmetically, as in play.
        const b = d.ball;
        const r = PROJECTILE.radiusMetres * WORLD.pixelsPerMetre;
        b.vy += levelPhysics(this.level).gravity * WORLD.pixelsPerMetre * reaction;
        b.x += b.vx * reaction;
        b.y += b.vy * reaction;
        const floor = simYToWorldY(this.level.ground.maxY, WORLD.designHeightPx, WORLD.pixelsPerMetre) - r;
        if (b.y > floor) { b.y = floor; b.vy = Math.abs(b.vy) > 60 ? -Math.abs(b.vy) * 0.42 : 0; b.vx *= 0.75; }
        this.ball.draw(b.x, b.y, b.vx, b.vy, reaction, reduced, 1);
        if (d.t > 1.6) {
          this.ball.setVisible(false);
          this.demo = null;
          d.onDone?.();
        }
      }
    }
    if (this.recoverIn !== null) {
      this.recoverIn -= dt;
      if (this.recoverIn <= 0) { this.recoverIn = null; this.jonh.resetToIdle(); this.jonh.followRoute(this.routeStart()); }
    }
    this.cannon.update(dt);
    this.cannon.setRecoil(recoil, this.angle);
    this.cannon.draw(this.angle, this.color, this.pattern);
    this.jonh.update(reaction);
    camera.update(dt, aimFrame(this.view), 3.5, reduced);
  }

  /** Walking Jonh's spot while aiming (null on maps where he stands still). */
  private routeStart() {
    return this.level.jonhRoute ? routePoseAt(this.level.jonhRoute, 0) : null;
  }

  destroy(): void {
    this.scenery.destroy();
    this.jonh.destroy();
    this.cannon.destroy();
    this.ball.destroy();
  }
}
