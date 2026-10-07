import Phaser from 'phaser';
import type { HatId } from '../art/jonhArt';
import { PAL, hex } from '../art/palette';
import { HIT_TIMING, RIG, jonhPose, type HitStrength, type JonhPose, type ReactionKind } from '../fx/jonhPose';
import { clamp01, easeOutBack } from '../fx/easing';
import type { JonhSpawnData, LevelData } from '../levels/types';
import { metresToPixels, simYToWorldY } from '../sim/units';
import { makeArtImage, setArt } from './artTextures';

export type JonhReactionMode = 'idle' | 'hit' | 'hat' | 'overhead';

/** One complete set of Jonh's parts; the renderer owns a main rig and a ghost for smears. */
class JonhRig {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly torso: Phaser.GameObjects.Container;
  readonly head: Phaser.GameObjects.Container;
  private readonly chair: Phaser.GameObjects.Image;
  private readonly torsoImg: Phaser.GameObjects.Image;
  private readonly legs: Phaser.GameObjects.Image;
  private readonly armFront: Phaser.GameObjects.Image;
  private readonly armBack: Phaser.GameObjects.Image;
  private readonly paperOn: Phaser.GameObjects.Image;
  private readonly paperFree: Phaser.GameObjects.Image;
  private readonly face: Phaser.GameObjects.Image;
  private readonly tuft: Phaser.GameObjects.Image;
  private readonly hatOn: Phaser.GameObjects.Image;
  private readonly hatFree: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, hatId: HatId) {
    const img = (key: string, px = 0, py = 0) => makeArtImage(scene, px, py, key);
    this.chair = img('jonh-chair', RIG.chair.x, RIG.chair.y);
    this.legs = img('jonh-legs');
    this.torsoImg = img('jonh-torso');
    this.armFront = img('jonh-arm-front', RIG.armFront.x, RIG.armFront.y);
    this.armBack = img('jonh-arm-back', RIG.armBack.x, RIG.armBack.y);
    this.paperOn = img('jonh-paper', RIG.paper.x, RIG.paper.y);
    this.paperFree = img('jonh-paper');
    this.face = img('jonh-face-bored');
    this.tuft = img('jonh-tuft', RIG.hatOnHead.x, RIG.hatOnHead.y + 2);
    this.hatOn = img(`hat-${hatId}`, RIG.hatOnHead.x, RIG.hatOnHead.y);
    this.hatFree = img(`hat-${hatId}`);
    this.head = scene.make.container({ x: RIG.neck.x, y: RIG.neck.y, add: false },);
    this.head.add([img('jonh-head'), this.face, this.tuft, this.hatOn]);
    this.torso = scene.make.container({ x: RIG.hip.x, y: RIG.hip.y, add: false });
    this.torso.add([this.armBack, this.torsoImg, this.head, this.paperOn, this.armFront]);
    this.legs.setPosition(RIG.hip.x, RIG.hip.y);
    this.body = scene.make.container({ x: 0, y: 0, add: false });
    this.body.add([this.torso, this.legs]);
    this.root = scene.add.container(x, y, [this.chair, this.body, this.paperFree, this.hatFree]);
  }

  setHat(hatId: HatId): void {
    setArt(this.hatOn, `hat-${hatId}`);
    setArt(this.hatFree, `hat-${hatId}`);
  }

  apply(pose: JonhPose): void {
    const b = pose.body;
    this.body.setPosition(b.x, b.y).setRotation(b.rot).setScale(b.sx, b.sy);
    this.torso.setRotation(pose.torso.rot).setScale(pose.torso.sx, pose.torso.sy);
    this.head.setPosition(RIG.neck.x + pose.head.dx, RIG.neck.y + pose.head.dy).setRotation(pose.head.rot);
    this.legs.setRotation(pose.legs);
    this.armFront.setRotation(pose.armFront);
    this.armBack.setRotation(pose.armBack);
    setArt(this.face, `jonh-face-${pose.face}`);
    const c = pose.chair;
    this.chair.setPosition(c.x, c.y).setRotation(c.rot);

    const paper = pose.paper;
    this.paperOn.setVisible(paper.attached);
    this.paperFree.setVisible(!paper.attached);
    if (paper.attached) {
      this.paperOn.setPosition(RIG.paper.x + paper.dx, RIG.paper.y + paper.dy).setRotation(paper.rot);
      setArt(this.paperOn, 'jonh-paper', paper.sx, 1);
    } else {
      this.paperFree.setPosition(paper.x, paper.y).setRotation(paper.rot);
    }
    const hat = pose.hat;
    this.hatOn.setVisible(hat.attached);
    this.hatFree.setVisible(!hat.attached);
    this.tuft.setVisible(!hat.attached);
    if (hat.attached) this.hatOn.setPosition(RIG.hatOnHead.x + hat.dx, RIG.hatOnHead.y + hat.dy).setRotation(hat.rot);
    else this.hatFree.setPosition(hat.x, hat.y).setRotation(hat.rot);
  }

  /** World position of the centre of his head. */
  headWorld(): { x: number; y: number } {
    const m = this.head.getWorldTransformMatrix();
    return { x: m.tx + m.b * 0 + m.c * -18, y: m.ty + m.d * -18 };
  }

  destroy(): void { this.root.destroy(true); }
}

/** Speech bubble in the art direction's comic style; redrawn only when the text changes. */
class SpeechBubble {
  private readonly container: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private age = 0;
  private shown = false;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.make.graphics({}, false);
    this.text = scene.make.text({
      x: 0, y: 0, text: '', add: false,
      style: { fontFamily: 'Nunito, system-ui, sans-serif', fontStyle: '800', fontSize: '17px', color: PAL.ink, align: 'center', wordWrap: { width: 210 } },
    }).setOrigin(0.5).setResolution(2);
    this.container = scene.add.container(0, 0, [this.graphics, this.text]).setDepth(26).setVisible(false);
  }

  show(quote: string, x: number, y: number): void {
    this.text.setText(quote);
    const w = Math.max(90, this.text.width + 30);
    const h = this.text.height + 22;
    const g = this.graphics;
    g.clear();
    g.fillStyle(hex(PAL.ink), 1);
    g.fillRoundedRect(-w / 2 + 4, -h + 4, w, h, 16);
    g.fillStyle(hex(PAL.paper), 1);
    g.lineStyle(3, hex(PAL.ink), 1);
    g.fillRoundedRect(-w / 2, -h, w, h, 16);
    g.strokeRoundedRect(-w / 2, -h, w, h, 16);
    g.fillTriangle(-14, -2, 6, -2, -22, 20);
    g.lineBetween(-14, -1, -22, 20);
    g.lineBetween(6, -1, -22, 20);
    g.fillStyle(hex(PAL.paper), 1);
    g.fillRect(-15, -5, 22, 4);
    this.text.setPosition(0, -h / 2);
    this.container.setPosition(x, y).setVisible(true).setScale(0.2);
    this.age = 0;
    this.shown = true;
  }

  hide(): void { this.shown = false; this.container.setVisible(false); }
  get visible(): boolean { return this.shown; }

  update(dt: number, reduced: boolean): void {
    if (!this.shown) return;
    this.age += dt;
    this.container.setScale(reduced ? 1 : 0.2 + 0.8 * easeOutBack(clamp01(this.age / 0.22), 2.2));
  }

  /** Keeps the bubble inside the given world rectangle. */
  clampTo(view: Phaser.Geom.Rectangle): void {
    const b = this.container;
    const halfW = (this.text.width + 30) / 2;
    const h = this.text.height + 22;
    b.setPosition(
      Phaser.Math.Clamp(b.x, view.x + halfW + 8, view.right - halfW - 8),
      Phaser.Math.Clamp(b.y, view.y + h + 8, view.bottom - 30),
    );
  }

  destroy(): void { this.container.destroy(true); }
}

export interface JonhRendererOptions {
  hatId?: HatId;
  level?: LevelData;
}

export class JonhRenderer {
  private readonly rig: JonhRig;
  private readonly ghost: JonhRig;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly stars: Phaser.GameObjects.Image[] = [];
  private readonly speedLines: Phaser.GameObjects.Image[] = [];
  private readonly bubble: SpeechBubble;
  private readonly originX: number;
  private readonly originY: number;
  /** Free space on his support surface to the right / left (px), for the knock-back arc. */
  private readonly roomRight: number;
  private readonly roomLeft: number;

  private reactionMode: JonhReactionMode = 'idle';
  private kind: ReactionKind = 'idle';
  private strength: HitStrength = 'strong';
  private dir = 1;
  private t = 0;
  private idleT = 0;
  private reactionQuote = '';
  private pendingQuote: string | null = null;
  private reducedMotion = false;
  private aware = false;
  private alarm = 0;
  private lastPose: JonhPose | null = null;

  constructor(private readonly scene: Phaser.Scene, jonhSpawn: JonhSpawnData, ppm: number, worldHeightPx: number, options: JonhRendererOptions = {}) {
    const b = jonhSpawn.bodyBox;
    this.originX = metresToPixels((b.minX + b.maxX) / 2, ppm);
    this.originY = simYToWorldY(b.minY, worldHeightPx, ppm);
    const support = options.level?.obstacles.find(o => Math.abs(o.box.maxY - b.minY) < 1e-6 && o.box.minX <= b.minX && o.box.maxX >= b.maxX);
    const right = support ? metresToPixels(support.box.maxX, ppm) : metresToPixels(options.level?.bounds.maxX ?? 25.6, ppm);
    const left = support ? metresToPixels(support.box.minX, ppm) : 0;
    this.roomRight = Math.max(0, right - this.originX - 55);
    this.roomLeft = Math.max(0, this.originX - left - 55);

    this.shadow = scene.add.image(this.originX + 4, this.originY + 1, 'fx-shadow').setScale(0.5 * 1.15, 0.5).setDepth(14);
    const hatId = options.hatId ?? 'boater';
    this.ghost = new JonhRig(scene, this.originX, this.originY, hatId);
    this.ghost.root.setDepth(14.5).setAlpha(0.35).setVisible(false);
    this.rig = new JonhRig(scene, this.originX, this.originY, hatId);
    this.rig.root.setDepth(15);
    for (let i = 0; i < 3; i++) this.stars.push(scene.add.image(0, 0, 'fx-star').setScale(0.5).setDepth(16).setVisible(false));
    for (let i = 0; i < 3; i++) this.speedLines.push(scene.add.image(0, 0, 'fx-speedline').setScale(0.5).setDepth(14.4).setVisible(false));
    this.bubble = new SpeechBubble(scene);
    this.applyPose();
  }

  get position(): { x: number; y: number } { return { x: this.originX, y: this.originY }; }

  setHat(hatId: HatId): void { this.rig.setHat(hatId); this.ghost.setHat(hatId); }

  setReducedMotion(enabled: boolean): void { this.reducedMotion = enabled; }

  isReducedMotionActive(): boolean {
    if (this.reducedMotion) return true;
    return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  }

  /** Kept for API compatibility: ball squash now lives in the ball renderer. */
  get impactSquash(): number { return 0; }
  get isHit(): boolean { return this.reactionMode === 'hit'; }
  get mode(): JonhReactionMode { return this.reactionMode; }
  get quote(): string { return this.reactionQuote; }
  get reactionTime(): number { return this.t; }

  /** Player is aiming: Jonh peeks nervously. */
  setAware(aware: boolean): void { this.aware = aware; }
  /** 0..1: how imminent an incoming ball is. */
  setAlarm(alarm: number): void { this.alarm = alarm; }

  update(deltaSeconds: number): void {
    const dt = Math.max(0, deltaSeconds);
    this.idleT += dt;
    if (this.kind !== 'idle') this.t += dt;
    const reduced = this.isReducedMotionActive();
    if (reduced && this.kind === 'hit') this.t = Math.max(this.t, HIT_TIMING.strongAir + 0.5);
    if (reduced && this.kind === 'hat') this.t = Math.max(this.t, 1.0);
    this.applyPose();
    // The quote appears once he has landed (or immediately for smaller reactions).
    const quoteAt = this.kind === 'hit' ? HIT_TIMING.starsFrom + 0.05 : this.kind === 'hat' ? 0.4 : 0;
    if (this.pendingQuote !== null && this.t >= quoteAt) {
      this.showBubble(this.pendingQuote);
      this.pendingQuote = null;
    }
    this.bubble.update(dt, reduced);
    this.bubble.clampTo(this.scene.cameras.main.worldView);
  }

  private applyPose(): void {
    const reduced = this.isReducedMotionActive();
    const pose = jonhPose({
      kind: this.kind, t: this.t, idleT: this.idleT, strength: this.strength, dir: this.dir,
      room: this.dir >= 0 ? this.roomRight : this.roomLeft,
      aware: this.aware, alarm: reduced ? 0 : this.alarm,
    });
    this.lastPose = pose;
    this.rig.apply(pose);
    this.shadow.setPosition(this.originX + pose.body.x + 6 * this.dir, this.originY + 1);
    this.shadow.setScale(0.5 * (1.15 + (pose.body.rot !== 0 ? 0.6 : 0)), 0.5 * Math.max(0.4, 1 + pose.body.y / 160));

    const smear = reduced ? 0 : pose.smear;
    this.ghost.root.setVisible(smear > 0);
    if (smear > 0) {
      this.ghost.apply(jonhPose({ kind: this.kind, t: Math.max(0, this.t - 0.045), idleT: this.idleT, strength: this.strength, dir: this.dir, room: this.dir >= 0 ? this.roomRight : this.roomLeft }));
      this.ghost.root.setAlpha(0.4 * smear);
    }
    this.speedLines.forEach((line, i) => {
      line.setVisible(smear > 0);
      if (smear > 0) {
        line.setPosition(this.originX + pose.body.x - this.dir * (34 + i * 9), this.originY - 70 + i * 22)
          .setAlpha(0.8 * smear).setScale(0.5 * (0.7 + i * 0.25), 0.5);
      }
    });
    const head = this.rig.headWorld();
    this.stars.forEach((star, i) => {
      const visible = pose.stars > 0;
      star.setVisible(visible);
      if (!visible) return;
      const a = this.idleT * (reduced ? 0 : 4.2) + (i * Math.PI * 2) / 3;
      star.setPosition(head.x + Math.cos(a) * 22, head.y - 14 + Math.sin(a) * 7).setAlpha(pose.stars).setRotation(a);
    });
  }

  private showBubble(quote: string): void {
    const head = this.rig.headWorld();
    this.bubble.show(quote, head.x + 26, head.y - 26);
  }

  private start(kind: ReactionKind, quote: string | null, mode: JonhReactionMode): void {
    this.kind = kind;
    this.reactionMode = mode;
    // Reduced motion cuts straight to the settled pose (no in-between motion).
    this.t = this.isReducedMotionActive() ? (kind === 'hit' ? HIT_TIMING.strongAir + 0.5 : kind === 'hat' ? 1.0 : 0) : 0;
    this.reactionQuote = quote ?? '';
    this.bubble.hide();
    this.pendingQuote = quote;
    this.alarm = 0;
    this.applyPose();
  }

  triggerArrival(quote: string): void {
    this.pendingQuote = null;
    this.showBubble(quote);
  }

  /** Body hit. `strength` picks the knock-back; `dir` is the ball's horizontal direction. */
  triggerHit(impactSpeedMs: number, quote: string, strength?: HitStrength, dir = 1): void {
    this.strength = strength ?? (impactSpeedMs >= 10 ? 'strong' : 'weak');
    this.dir = dir >= 0 ? 1 : -1;
    this.start('hit', quote, 'hit');
  }

  triggerHatHit(quote: string, dir = 1): void {
    this.dir = dir >= 0 ? 1 : -1;
    this.start('hat', quote, 'hat');
  }

  triggerOverhead(quote: string): void { this.start('duck', quote, 'overhead'); }

  /** Smaller reactions to misses: 'smug' (short), 'glare' (over), 'wince' (obstacle noise). */
  triggerMiss(kind: 'smug' | 'glare' | 'wince', quote: string): void { this.start(kind, quote, 'idle'); }

  private replaySaved: { kind: ReactionKind; mode: JonhReactionMode } | null = null;

  /** Replay lead-up: shows him back in his chair, unaware, until the replayed contact. */
  beginReplay(): void {
    if (this.kind === 'idle' || this.replaySaved) return;
    this.replaySaved = { kind: this.kind, mode: this.reactionMode };
    this.pendingQuote = null;
    this.kind = 'idle';
    this.t = 0;
    this.bubble.hide();
    this.applyPose();
  }

  /** Replay contact: re-runs the saved reaction from its most extreme frame. */
  replayContact(): void {
    if (!this.replaySaved) return;
    this.kind = this.replaySaved.kind;
    this.reactionMode = this.replaySaved.mode;
    this.replaySaved = null;
    this.alarm = 0;
    this.t = 0;
    this.pendingQuote = this.reactionQuote || null;
    this.applyPose();
  }

  /** Restarts the current body-hit reaction from its first frame. */
  restartReaction(): void {
    if (this.kind === 'idle') return;
    this.t = 0;
    this.bubble.hide();
    this.applyPose();
  }

  /** Jumps a reaction to its settled pose and shows the quote (skip / reduced motion). */
  settleImpact(): void {
    if (this.replaySaved) this.replayContact();
    if (this.kind === 'idle') return;
    this.t = Math.max(this.t, this.kind === 'hit' ? HIT_TIMING.annoyedFrom + 0.1 : 1.6);
    if (this.pendingQuote !== null) { this.showBubble(this.pendingQuote); this.pendingQuote = null; }
    this.applyPose();
  }

  resetToIdle(): void {
    this.replaySaved = null;
    this.kind = 'idle';
    this.reactionMode = 'idle';
    this.t = 0;
    this.reactionQuote = '';
    this.pendingQuote = null;
    this.alarm = 0;
    this.bubble.hide();
    this.applyPose();
  }

  hideBubble(): void { this.bubble.hide(); }

  /** Legacy entry point: draw(false) resets to idle, draw(true) shows the hit pose. */
  draw(overrideHit?: boolean): void {
    if (overrideHit === false) { this.resetToIdle(); return; }
    if (overrideHit === true && this.kind !== 'hit') this.start('hit', null, 'hit');
    this.applyPose();
  }

  get pose(): JonhPose | null { return this.lastPose; }

  destroy(): void {
    this.rig.destroy();
    this.ghost.destroy();
    this.shadow.destroy();
    for (const s of this.stars) s.destroy();
    for (const l of this.speedLines) l.destroy();
    this.bubble.destroy();
  }
}
