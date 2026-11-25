import type Phaser from 'phaser';
import { COACH } from '../config/tuning';
import { PAL, hex } from '../art/palette';
import { clamp01, easeInOutSine } from '../fx/easing';

const INK = hex(PAL.ink);
const PAPER = hex(PAL.paper);
const POW = hex(PAL.pow);
/** The glove is drawn about 40 px tall; this makes it read at a glance on the field. */
const GLOVE_SCALE = 1.4;

/**
 * The coach's ghost hand (rules/coach.ts): a cartoon glove that presses on the cannon and drags
 * up and away, leaving a dashed red pull line, on a loop. Presentation only; it never touches the aim.
 * Under reduced motion it holds still at the end of the drag with the pull line drawn.
 */
export class CoachRenderer {
  private readonly hand: Phaser.GameObjects.Container;
  private readonly line: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private t = 0;

  /** `from` is the cannon pivot and `to` the end of the drag, in world px. */
  constructor(scene: Phaser.Scene, private readonly from: { x: number; y: number }, private readonly to: { x: number; y: number }, private uiScale = 1) {
    this.line = scene.add.graphics().setDepth(44);
    this.ring = scene.add.graphics().setDepth(44);
    const glove = scene.add.graphics();
    // A pointing glove whose fingertip is at (0, 0), leaning back so the finger points up-left.
    glove.lineStyle(3, INK, 1).fillStyle(PAPER, 1);
    glove.fillRoundedRect(-7, -2, 14, 34, 7).strokeRoundedRect(-7, -2, 14, 34, 7);
    glove.fillRoundedRect(-10, 22, 36, 30, 11).strokeRoundedRect(-10, 22, 36, 30, 11);
    glove.fillEllipse(-11, 36, 14, 22).strokeEllipse(-11, 36, 14, 22);
    glove.fillStyle(INK, 1).fillRect(-4, 50, 28, 9);
    glove.lineStyle(2, INK, 0.6).lineBetween(8, 28, 8, 40).lineBetween(17, 28, 17, 40);
    this.hand = scene.add.container(from.x, from.y, [glove]).setDepth(45).setAngle(-18).setAlpha(0);
  }

  /** Keeps the glove the same size on screen on zoomed-out maps and small phones. */
  setUiScale(scale: number): void {
    this.uiScale = scale;
  }

  update(dt: number, reduced: boolean): void {
    const k = this.uiScale;
    this.line.clear();
    this.ring.clear();
    if (reduced) {
      this.hand.setPosition(this.to.x, this.to.y).setScale(k * GLOVE_SCALE).setAlpha(0.95);
      this.drawPull(this.to.x, this.to.y, 1);
      return;
    }
    const loop = COACH.handLoopSeconds;
    this.t = (this.t + dt) % loop;
    const u = this.t / loop;
    // Timeline (fractions of the loop): fade in, press, drag, release, fade out, rest.
    let alpha = 0.95;
    let press = 0;
    let drag = 0;
    if (u < 0.12) { alpha = 0.95 * clamp01(u / 0.12); } else if (u < 0.17) { press = (u - 0.12) / 0.05; } else if (u < 0.55) { press = 1; drag = easeInOutSine((u - 0.17) / 0.38); } else if (u < 0.62) { press = 1 - (u - 0.55) / 0.07; drag = 1; } else if (u < 0.78) { drag = 1; alpha = 0.95 * (1 - (u - 0.62) / 0.16); } else { alpha = 0; drag = 1; }
    const x = this.from.x + (this.to.x - this.from.x) * drag;
    const y = this.from.y + (this.to.y - this.from.y) * drag;
    this.hand.setPosition(x, y).setScale(k * GLOVE_SCALE * (1 - 0.14 * press)).setAlpha(alpha);
    if (press > 0 && drag === 0) {
      // The press: a ring pops out from the fingertip on the cannon.
      this.ring.lineStyle(3 * k, PAPER, 0.9 * (1 - press)).strokeCircle(this.from.x, this.from.y, (10 + 16 * press) * k);
    }
    if (drag > 0 && alpha > 0) this.drawPull(x, y, alpha);
  }

  /** The pull: bold red dashes from the cannon to the glove (unlike the white launch-preview dots). */
  private drawPull(x: number, y: number, alpha: number): void {
    const k = this.uiScale;
    const dx = x - this.from.x;
    const dy = y - this.from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const ux = dx / length;
    const uy = dy / length;
    const dash = 14 * k;
    for (let d = 10 * k; d + dash <= length - 6 * k; d += dash * 1.8) {
      const ax = this.from.x + ux * d, ay = this.from.y + uy * d;
      const bx = ax + ux * dash, by = ay + uy * dash;
      this.line.lineStyle(9 * k, INK, 0.8 * alpha).lineBetween(ax, ay, bx, by);
      this.line.lineStyle(5 * k, POW, alpha).lineBetween(ax, ay, bx, by);
    }
  }

  destroy(): void {
    this.hand.destroy();
    this.line.destroy();
    this.ring.destroy();
  }
}
