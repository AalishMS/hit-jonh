import type Phaser from 'phaser';
import { PAL, hex } from '../art/palette';
import { MAGNET } from '../config/tuning';
import { hash01 } from '../fx/easing';
import { fieldGlow, fieldRings, magnetSparks } from '../fx/magnetVisuals';
import type { Box2D, LevelData, MagnetData } from '../levels/types';
import { magnetProfile, magnetProximity } from '../sim/magnet';
import { metresToPixels, pixelsToMetres, simYToWorldY, worldYToSimY } from '../sim/units';

/**
 * Rings behind the playfield (over the sky and hills, under every solid); the cable and chains just
 * behind the housing; the glow and sparks over it.
 */
const DEPTH = { rings: -55, cable: 1.9, glow: 2.4, sparks: 3.2 } as const;
/** How far above the world's top the cable runs, so no camera framing shows its end (px). */
const CABLE_OVERRUN_PX = 600;
/** Chains meet the cable this far above the housing (px). */
const CHAIN_RISE_PX = 26;

/**
 * A level's electromagnet on screen (SPEC §8.9): the crane cable it hangs from (running up out of
 * shot), lifting chains, faint field rings that show its reach and drift inwards (the pull), and a
 * glow plus sparks that swell as the ball comes near (from the drawn ball, so replays and the title
 * demo light it up too). The housing itself is an obstacle texture (art/magnetArt.ts). Nothing here
 * collides or touches the simulation; reduced motion holds the rings still and drops the sparks.
 */
export class MagnetRenderer {
  private objects: Phaser.GameObjects.GameObject[] = [];
  /** The reach and the inner ring: drawn once, brightened by alpha. */
  private edges: Phaser.GameObjects.Graphics | null = null;
  /** The rings drifting inwards: redrawn as they move. */
  private rings: Phaser.GameObjects.Graphics | null = null;
  /** Drawn once at full strength; its alpha follows the ball's proximity. */
  private glow: Phaser.GameObjects.Graphics | null = null;
  private sparks: Phaser.GameObjects.Graphics | null = null;
  private field: MagnetData | null = null;
  private housing: Box2D | null = null;
  private time = 0;
  private sparkTime = 0;
  private reduced = false;
  /** 0..1: how strongly the drawn ball feels the field now. */
  private nearness = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ppm: number,
    private readonly worldHeightPx: number,
  ) {}

  /** Whether the current level has a magnet. */
  get active(): boolean { return this.field !== null; }

  /** 0..1: how strongly the ball last passed to `follow` feels the magnet (0 with no magnet or no ball). */
  get proximity(): number { return this.nearness; }

  draw(level: LevelData): void {
    this.clear();
    const field = level.magnet;
    if (!field) return;
    this.field = field;
    this.housing = level.obstacles.find(o => o.id === field.housingId)?.box ?? null;
    const s = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.objects.push(o); return o; };

    // Cable up out of shot, and a V of lifting chains down to the housing's top corners.
    const h = this.housing;
    const cx = metresToPixels(field.x, this.ppm);
    const top = h ? simYToWorldY(h.maxY, this.worldHeightPx, this.ppm) : simYToWorldY(field.y, this.worldHeightPx, this.ppm);
    const worldTop = simYToWorldY(level.bounds.maxY, this.worldHeightPx, this.ppm);
    const cable = add(s.add.graphics().setDepth(DEPTH.cable));
    const knot = { x: cx, y: top - CHAIN_RISE_PX };
    cable.lineStyle(5, hex(PAL.ink), 1).lineBetween(cx, worldTop - CABLE_OVERRUN_PX, knot.x, knot.y);
    cable.lineStyle(2, hex(PAL.stoneDark), 1).lineBetween(cx, worldTop - CABLE_OVERRUN_PX, knot.x, knot.y);
    if (h) {
      const inset = metresToPixels(Math.min(0.15, (h.maxX - h.minX) / 4), this.ppm);
      for (const x of [metresToPixels(h.minX, this.ppm) + inset, metresToPixels(h.maxX, this.ppm) - inset]) {
        cable.lineStyle(4, hex(PAL.ink), 1).lineBetween(knot.x, knot.y, x, top + 1);
        cable.lineStyle(1.6, hex(PAL.stone), 1).lineBetween(knot.x, knot.y, x, top + 1);
      }
    }
    cable.fillStyle(hex(PAL.ink), 1).fillCircle(knot.x, knot.y, 4.5);
    cable.fillStyle(hex(PAL.brass), 1).fillCircle(knot.x, knot.y, 2.6);

    const fieldX = cx;
    const fieldY = simYToWorldY(field.y, this.worldHeightPx, this.ppm);
    const full = magnetProfile(field.radius).fullRadius;
    this.edges = add(s.add.graphics().setDepth(DEPTH.rings));
    this.strokeRing(this.edges, fieldX, fieldY, field.radius, MAGNET.ringAlpha * 0.75, true);
    this.strokeRing(this.edges, fieldX, fieldY, full, MAGNET.ringAlpha, false);
    this.rings = add(s.add.graphics().setDepth(DEPTH.rings));
    this.glow = add(s.add.graphics().setDepth(DEPTH.glow).setAlpha(0));
    if (h) {
      const hx = metresToPixels((h.minX + h.maxX) / 2, this.ppm);
      const hy = simYToWorldY((h.minY + h.maxY) / 2, this.worldHeightPx, this.ppm);
      const hw = metresToPixels(h.maxX - h.minX, this.ppm);
      this.glow.fillStyle(hex(PAL.field), 0.16).fillCircle(hx, hy, hw * 0.95);
      this.glow.fillStyle(hex(PAL.field), 0.22).fillCircle(hx, hy, hw * 0.65);
    }
    this.sparks = add(s.add.graphics().setDepth(DEPTH.sparks));
    this.paint();
  }

  /** One field ring (radius in metres): a soft dark edge under a bright cyan line, dashed for the reach. */
  private strokeRing(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rMetres: number, alpha: number, dashed: boolean): void {
    const r = metresToPixels(rMetres, this.ppm);
    const a = Math.min(1, alpha);
    if (!dashed) {
      g.lineStyle(4, hex(PAL.fieldDark), a * 0.55).strokeCircle(cx, cy, r);
      g.lineStyle(2, hex(PAL.field), a).strokeCircle(cx, cy, r);
      return;
    }
    const segments = Math.max(24, Math.round(r / 9) * 2);
    for (let i = 0; i < segments; i += 2) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      g.lineStyle(4, hex(PAL.fieldDark), a * 0.55).beginPath().arc(cx, cy, r, a0, a1).strokePath();
      g.lineStyle(2, hex(PAL.field), a).beginPath().arc(cx, cy, r, a0, a1).strokePath();
    }
  }

  /** The drawn ball's position (world px), or null when there is none; sets the glow. */
  follow(ball: { x: number; y: number } | null): void {
    const field = this.field;
    if (!field || !ball) { this.nearness = 0; return; }
    const x = pixelsToMetres(ball.x, this.ppm);
    const y = worldYToSimY(ball.y, this.worldHeightPx, this.ppm);
    this.nearness = magnetProximity(field, x, y, magnetProfile(field.radius).fullRadius);
  }

  /** Real-time clock; the rings hold still and the sparks stop under reduced motion. */
  update(dt: number, reduced: boolean): void {
    if (!this.field) return;
    this.reduced = reduced;
    if (!reduced && dt > 0) {
      this.time += dt;
      this.sparkTime += dt;
    }
    this.paint();
  }

  private paint(): void {
    const field = this.field;
    if (!field || !this.edges || !this.rings || !this.glow || !this.sparks) return;
    const cx = metresToPixels(field.x, this.ppm);
    const cy = simYToWorldY(field.y, this.worldHeightPx, this.ppm);
    const full = magnetProfile(field.radius).fullRadius;
    const glow = fieldGlow(this.nearness);
    const boost = 1 + glow * MAGNET.glowAlpha / MAGNET.ringAlpha;
    this.edges.setAlpha(Math.min(1, 0.7 * boost));
    const g = this.rings;
    g.clear();
    for (const r of fieldRings(field.radius, full, this.reduced ? 0 : this.time)) this.strokeRing(g, cx, cy, r.r, r.alpha * 0.8 * boost, false);

    // Glow round the housing as the ball nears; sparks on its face when it is close.
    this.glow.setAlpha(glow);
    this.sparks.clear();
    const h = this.housing;
    if (!h || this.reduced || !magnetSparks(this.nearness)) return;
    const frame = Math.floor(this.sparkTime * 18);
    const bottom = simYToWorldY(h.minY, this.worldHeightPx, this.ppm);
    const left = metresToPixels(h.minX, this.ppm);
    const hw = metresToPixels(h.maxX - h.minX, this.ppm);
    for (let i = 0; i < 4; i++) {
      const sx = left + hash01(frame * 4.1 + i * 1.7) * hw;
      const len = 5 + hash01(frame * 2.3 + i) * 8;
      const sway = (hash01(frame * 5.9 + i * 3.3) - 0.5) * 8;
      this.sparks.lineStyle(2, hex(PAL.field), 0.9).beginPath().moveTo(sx, bottom).lineTo(sx + sway * 0.5, bottom + len * 0.5)
        .lineTo(sx + sway, bottom + len).strokePath();
    }
  }

  clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.edges = null;
    this.rings = null;
    this.glow = null;
    this.sparks = null;
    this.field = null;
    this.housing = null;
    this.time = 0;
    this.sparkTime = 0;
    this.nearness = 0;
  }

  destroy(): void {
    this.clear();
  }
}
