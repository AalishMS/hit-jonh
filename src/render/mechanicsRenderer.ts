import type Phaser from 'phaser';
import { backdropBox, backdropKey, brokenKey, PORTAL_ART_RADIUS } from '../art/mechanicArt';
import { obstacleKey } from '../art/sceneryArt';
import { MECHANIC_FX } from '../config/tuning';
import { clamp01, easeOutCubic } from '../fx/easing';
import { ParticleSystem, type BurstSpec } from '../fx/particles';
import type { LevelData, ObstacleData, PortalData } from '../levels/types';
import type { MechanicEvent, ProjectileState } from '../physics/matterAdapter';
import { metresToPixels, simYToWorldY } from '../sim/units';
import { artScale } from './artTextures';

/** Sounds the mechanics play (AudioManager implements these). */
export interface MechanicSounds {
  playGlassBreak(strength: number): void;
  playPortal(): void;
}

/** Backdrop < fence-free playfield < obstacles < hoops < trails/ball < particles. */
const DEPTH = { backdrop: -55, pane: 2, swirl: 3, ring: 3.5, arrow: 3.6, sparkle: 3.7, particles: 24 } as const;
const POOL = 48;
/** Impact speed (m/s) that plays the loudest smash. */
const LOUDEST_SMASH_MS = 14;

interface PaneView { image: Phaser.GameObjects.Image; intactKey: string; broken: boolean }

interface PortalView {
  portal: PortalData;
  /** Entry art scale (swirl radius / art radius). */
  k: number;
  entrySwirl: Phaser.GameObjects.Image;
  entryRing: Phaser.GameObjects.Image;
  exitSwirl: Phaser.GameObjects.Image;
  exitRing: Phaser.GameObjects.Image;
  spent: boolean;
  /** Seconds since the ball went through (pop animation), null when idle. */
  popAge: number | null;
}

/**
 * Breakable props and portals on screen (docs/art-direction.md). Draws each breakable obstacle (so it
 * can swap to its smashed texture), the magic hoops and the map's interior backdrop, and turns the
 * physics adapter's per-step events into effects and sound: shards and a crash when a pane breaks,
 * sparkles and a "fwoop" when the ball goes through a hoop. `reset` restores every pane and hoop for
 * the next attempt (SPEC §7.2). Reduced motion keeps the state changes but nothing flies or spins.
 */
export class MechanicsRenderer {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private readonly panes = new Map<string, PaneView>();
  private readonly portals = new Map<string, PortalView>();
  private sparkles: Array<{ obj: Phaser.GameObjects.Image; phase: number; scale: number }> = [];
  private readonly particles: ParticleSystem;
  private pool: Phaser.GameObjects.Image[] = [];
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ppm: number,
    private readonly worldHeightPx: number,
    rng: () => number = Math.random,
  ) {
    this.particles = new ParticleSystem(POOL, rng);
  }

  private px(x: number, y: number): { x: number; y: number } {
    return { x: metresToPixels(x, this.ppm), y: simYToWorldY(y, this.worldHeightPx, this.ppm) };
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objects.push(o);
    return o;
  }

  draw(level: LevelData): void {
    this.clear();
    const s = this.scene;
    const box = backdropBox(level);
    if (box) {
      const key = backdropKey(level.id);
      const at = this.px(box.minX, box.maxY);
      this.add(s.add.image(at.x, at.y, key).setOrigin(0, 0).setScale(artScale(key)).setDepth(DEPTH.backdrop));
    }
    for (const obs of level.obstacles) if (obs.breakable) this.drawPane(level.id, obs);
    for (const portal of level.portals ?? []) this.drawPortal(portal);
    if (this.panes.size > 0 || this.portals.size > 0) this.ensurePool();
  }

  private drawPane(levelId: string, obs: ObstacleData): void {
    const key = obstacleKey(levelId, obs);
    const at = this.px(obs.box.minX, obs.box.maxY);
    const image = this.add(this.scene.add.image(at.x, at.y, key).setOrigin(0, 0).setScale(artScale(key)).setDepth(DEPTH.pane));
    this.panes.set(obs.id, { image, intactKey: key, broken: false });
  }

  private drawPortal(portal: PortalData): void {
    const s = this.scene;
    const k = (portal.entry.radius * this.ppm) / PORTAL_ART_RADIUS;
    const entry = this.px(portal.entry.x, portal.entry.y);
    const exit = this.px(portal.exit.x, portal.exit.y);
    const entrySwirl = this.add(s.add.image(entry.x, entry.y, 'portal-swirl').setDepth(DEPTH.swirl));
    const entryRing = this.add(s.add.image(entry.x, entry.y, 'portal-ring').setDepth(DEPTH.ring));
    // The exit hoop is seen side-on: squashed along its heading, with a chevron pointing the way out.
    const heading = -portal.exit.angleDeg * Math.PI / 180;
    const exitSwirl = this.add(s.add.image(exit.x, exit.y, 'portal-swirl').setDepth(DEPTH.swirl).setRotation(heading));
    const exitRing = this.add(s.add.image(exit.x, exit.y, 'portal-ring').setDepth(DEPTH.ring).setRotation(heading));
    const reach = (PORTAL_ART_RADIUS + 14) * k * MECHANIC_FX.exitScale * MECHANIC_FX.exitSquash + 12;
    this.add(s.add.image(exit.x + Math.cos(heading) * reach, exit.y + Math.sin(heading) * reach, 'portal-arrow')
      .setRotation(heading).setScale(artScale('portal-arrow')).setDepth(DEPTH.arrow));
    const view: PortalView = { portal, k, entrySwirl, entryRing, exitSwirl, exitRing, spent: false, popAge: null };
    this.portals.set(portal.id, view);
    this.poseHoops(view);
    const ringR = (PORTAL_ART_RADIUS + 6) * k;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * 2.1;
      const scale = artScale('fx-magic') * (0.8 + 0.2 * i);
      const obj = this.add(s.add.image(entry.x + Math.cos(a) * ringR, entry.y + Math.sin(a) * ringR, 'fx-magic').setScale(scale).setDepth(DEPTH.sparkle));
      this.sparkles.push({ obj, phase: i * 1.7, scale });
    }
  }

  /** Hoop scales and opacity: a short pop after use, then the entry swirl stays dim (spent). */
  private poseHoops(view: PortalView): void {
    const p = view.popAge === null ? 1 : clamp01(view.popAge / MECHANIC_FX.popSeconds);
    const bump = view.popAge === null ? 0 : Math.sin(p * Math.PI) * 0.25;
    const swirl = artScale('portal-swirl') * view.k;
    const ring = artScale('portal-ring') * view.k;
    const exitK = MECHANIC_FX.exitScale;
    const squash = MECHANIC_FX.exitSquash;
    view.entrySwirl.setScale(swirl * (1 + bump)).setAlpha(view.spent ? 1 - (1 - MECHANIC_FX.spentAlpha) * easeOutCubic(p) : 1);
    view.entryRing.setScale(ring * (1 + bump * 0.5));
    view.exitSwirl.setScale(swirl * exitK * squash * (1 + bump), swirl * exitK * (1 + bump));
    view.exitRing.setScale(ring * exitK * squash * (1 + bump * 0.6), ring * exitK * (1 + bump * 0.6));
  }

  private ensurePool(): void {
    if (this.pool.length > 0) return;
    for (let i = 0; i < POOL; i++) this.pool.push(this.scene.add.image(0, 0, 'fx-shard').setDepth(DEPTH.particles).setVisible(false));
  }

  /**
   * Effects and sound for one physics step. Returns true when a pane broke or the ball went through a
   * hoop this step: the caller should not read that sudden change of velocity as a bounce.
   */
  onStep(state: ProjectileState, reduced: boolean, sounds?: MechanicSounds): boolean {
    for (const event of state.events) this.onEvent(event, state, reduced, sounds);
    return state.events.length > 0;
  }

  /**
   * Plays events from a recorded shot (the title demo and the winning-shot replay animate recorded
   * flights rather than live physics). `vxSim`/`vySim` are the ball's velocity at that step.
   */
  playRecorded(events: readonly MechanicEvent[], vxSim: number, vySim: number, reduced: boolean, sounds?: MechanicSounds): void {
    for (const event of events) this.onEvent(event, { vxSim, vySim }, reduced, sounds);
  }

  private onEvent(event: MechanicEvent, state: Pick<ProjectileState, 'vxSim' | 'vySim'>, reduced: boolean, sounds?: MechanicSounds): void {
    if (event.kind === 'break') {
      const pane = this.panes.get(event.id);
      if (pane && !pane.broken) {
        pane.broken = true;
        pane.image.setTexture(brokenKey(pane.intactKey));
      }
      sounds?.playGlassBreak(clamp01(event.impactSpeedMs / LOUDEST_SMASH_MS));
      if (reduced) return;
      const travel = Math.atan2(-state.vySim, state.vxSim);
      this.burst({
        kind: 'fx-shard', count: MECHANIC_FX.shardCount, x: event.xPx, y: event.yPx, angle: travel, spread: 1.5,
        speed: [MECHANIC_FX.shardSpeedMinPx, MECHANIC_FX.shardSpeedMaxPx], life: [0.5, 0.95], scale: [0.8, 1.35],
        gravity: 720, drag: 1.2, spin: 14,
      });
      this.burst({ kind: 'fx-shard', count: 5, x: event.xPx, y: event.yPx, angle: travel + Math.PI, spread: 1.6, speed: [40, 120], life: [0.4, 0.7], scale: [0.6, 1], gravity: 700, drag: 1.5, spin: 10 });
      this.burst({ kind: 'fx-dust', count: 3, x: event.xPx, y: event.yPx, angle: -Math.PI / 2, spread: 2.4, speed: [20, 60], life: [0.3, 0.5], scale: [0.4, 0.7], endScale: 1.6, gravity: -20, drag: 4 });
      return;
    }
    const view = this.portals.get(event.id);
    if (view) {
      view.spent = true;
      view.popAge = reduced ? null : 0;
      this.poseHoops(view);
    }
    sounds?.playPortal();
    if (reduced) return;
    for (const [x, y] of [[event.entryXPx, event.entryYPx], [event.exitXPx, event.exitYPx]] as const) {
      this.burst({ kind: 'fx-magic', count: MECHANIC_FX.sparkleCount, x, y, angle: 0, spread: Math.PI * 2, speed: [60, 210], life: [0.35, 0.7], scale: [0.6, 1.1], endScale: 0.2, drag: 3, spin: 6 });
    }
  }

  private burst(spec: BurstSpec): void {
    this.ensurePool();
    this.particles.burst(spec);
  }

  /** Swirls turn and sparkles twinkle on the real-time clock; pops and particles play out. */
  update(dt: number, reduced: boolean): void {
    if (reduced) this.particles.clear();
    const step = dt > 0 ? dt : 0;
    if (!reduced && step > 0) {
      this.time += step;
      const spin = (this.time / MECHANIC_FX.swirlTurnSeconds) * Math.PI * 2;
      for (const view of this.portals.values()) if (!view.spent) view.entrySwirl.setRotation(spin);
      for (const sp of this.sparkles) {
        const tw = 0.5 + 0.5 * Math.sin(this.time * 1.6 + sp.phase);
        sp.obj.setAlpha(0.35 + 0.65 * tw).setScale(sp.scale * (0.75 + 0.35 * tw));
      }
    }
    for (const view of this.portals.values()) {
      if (view.popAge === null) continue;
      view.popAge = reduced ? MECHANIC_FX.popSeconds : view.popAge + step;
      if (view.popAge >= MECHANIC_FX.popSeconds) view.popAge = null;
      this.poseHoops(view);
    }
    this.particles.step(step);
    this.drawParticles();
  }

  private drawParticles(): void {
    const list = this.particles.particles;
    for (let i = 0; i < this.pool.length; i++) {
      const img = this.pool[i]!;
      const p = list[i];
      if (!p) { if (img.visible) img.setVisible(false); continue; }
      if (img.texture.key !== p.kind) img.setTexture(p.kind);
      const fade = ParticleSystem.fade(p);
      img.setVisible(true).setPosition(p.x, p.y).setRotation(p.rot)
        .setScale(artScale(p.kind) * ParticleSystem.currentScale(p))
        .setAlpha(p.kind === 'fx-dust' ? Math.min(1, fade * 1.6) : fade > 0.3 ? 1 : fade / 0.3);
    }
  }

  /** Whether a breakable prop is currently shown smashed. */
  isBroken(id: string): boolean {
    return this.panes.get(id)?.broken ?? false;
  }

  /** Whether a portal has been used this shot. */
  isSpent(id: string): boolean {
    return this.portals.get(id)?.spent ?? false;
  }

  /** Scene reset (SPEC §7.2): every pane whole, every hoop ready, no flying bits. */
  reset(): void {
    for (const pane of this.panes.values()) {
      if (!pane.broken) continue;
      pane.broken = false;
      pane.image.setTexture(pane.intactKey);
    }
    for (const view of this.portals.values()) {
      view.spent = false;
      view.popAge = null;
      this.poseHoops(view);
    }
    this.particles.clear();
    this.drawParticles();
  }

  clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.panes.clear();
    this.portals.clear();
    this.sparkles = [];
    this.particles.clear();
    this.drawParticles();
  }

  destroy(): void {
    this.clear();
    for (const img of this.pool) img.destroy();
    this.pool = [];
  }
}
