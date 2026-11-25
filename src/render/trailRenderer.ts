import type Phaser from 'phaser';
import type { Viewport } from '../fx/cameraDirector';
import { PAL, hex, playerDisplayColor } from '../art/palette';
import { LOOK, WORLD } from '../config/tuning';

export interface LandingFeedback {
  x: number;
  y: number;
  label: string;
}

export interface TrailData {
  activePoints: Array<{ x: number; y: number }>;
  activeLandingMarker: LandingFeedback | null;
  previousPoints: Array<{ x: number; y: number }>;
  previousLandingMarker: LandingFeedback | null;
}

/** Turns a finished shot's trail into the ghost ("previous") trail shown at that player's next turn. */
export function asPreviousTrail(data: TrailData): TrailData {
  return {
    activePoints: [],
    activeLandingMarker: null,
    previousPoints: [...data.activePoints],
    previousLandingMarker: data.activeLandingMarker ? { ...data.activeLandingMarker } : null,
  };
}

/**
 * Trail dots are pooled sprites of one white disc, tinted and scaled per style (phone pass, next 10
 * item 4). As Graphics circles they were re-triangulated every frame: two circles per dot, about a
 * hundred circles after two shots, the largest part of the render cost on a phone.
 */
const DOT_KEY = 'trail-dot';
const DOT_RADIUS_PX = 16;

function ensureDotTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(DOT_KEY) || typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = DOT_RADIUS_PX * 2 + 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(DOT_RADIUS_PX + 1, DOT_RADIUS_PX + 1, DOT_RADIUS_PX, 0, Math.PI * 2);
  ctx.fill();
  scene.textures.addCanvas(DOT_KEY, canvas);
}

/** One dot style: rim and centre radius (px), colours and alphas. */
interface DotStyle { rim: number; rimAlpha: number; core: number; coreColor: number; coreAlpha: number }

export class TrailRenderer {
  /** Only the landing crosses are drawn as Graphics now (a few lines). */
  private graphics: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  /** Pooled dot sprites: rims under centres. */
  private readonly rims: Phaser.GameObjects.Image[] = [];
  private readonly cores: Phaser.GameObjects.Image[] = [];
  private landingText: Phaser.GameObjects.Text;
  private activePoints: Array<{ x: number; y: number }> = [];
  private activeLandingMarker: LandingFeedback | null = null;

  private previousPoints: Array<{ x: number; y: number }> = [];
  private previousLandingMarker: LandingFeedback | null = null;

  /** Player colour for both trails; null keeps the default solo look. */
  private playerColor: number | null = null;

  private view: Viewport = { width: WORLD.designWidthPx, height: WORLD.designHeightPx };

  /** The map's resting camera view (see levelView). */
  setView(view: Viewport): void {
    this.view = view;
    this.redraw();
  }

  /** Extra label size on small screens (see fx/readability.ts). */
  private textBoost = 1;
  setTextBoost(boost: number): void {
    if (boost === this.textBoost) return;
    this.textBoost = boost;
    this.redraw();
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureDotTexture(scene);
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(6.2);
    this.landingText = scene.add.text(0, 0, '', {
      fontFamily: 'Nunito, system-ui, sans-serif', fontStyle: '900', fontSize: '14px',
      color: PAL.paper, backgroundColor: PAL.ink, padding: { x: 8, y: 4 },
    }).setDepth(7).setResolution(2).setVisible(false);
  }

  setPlayerColor(color: number | null): void {
    this.playerColor = color;
    this.redraw();
  }

  exportData(): TrailData {
    return {
      activePoints: [...this.activePoints],
      activeLandingMarker: this.activeLandingMarker ? { ...this.activeLandingMarker } : null,
      previousPoints: [...this.previousPoints],
      previousLandingMarker: this.previousLandingMarker ? { ...this.previousLandingMarker } : null,
    };
  }

  importData(data: TrailData | null) {
    if (!data) {
      this.activePoints = [];
      this.activeLandingMarker = null;
      this.previousPoints = [];
      this.previousLandingMarker = null;
    } else {
      this.activePoints = [...data.activePoints];
      this.activeLandingMarker = data.activeLandingMarker ? { ...data.activeLandingMarker } : null;
      this.previousPoints = [...data.previousPoints];
      this.previousLandingMarker = data.previousLandingMarker ? { ...data.previousLandingMarker } : null;
    }
    this.redraw();
  }

  /**
   * Called when a new shot is launched. Archives current active trail to previous trail.
   */
  startNewShot(): void {
    if (this.activePoints.length > 0) {
      this.previousPoints = [...this.activePoints];
      this.previousLandingMarker = this.activeLandingMarker ? { ...this.activeLandingMarker } : null;
    }
    this.activePoints = [];
    this.activeLandingMarker = null;
    this.redraw();
  }

  addPoint(x: number, y: number): void {
    const last = this.activePoints[this.activePoints.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) >= LOOK.trailSpacingPx) {
      this.activePoints.push({ x, y });
      this.redraw();
    }
  }

  setLandingMarker(x: number, y: number, label = ''): void {
    this.activeLandingMarker = { x, y, label };
    this.redraw();
  }

  /**
   * Preserves previous-shot trail and promotes active to previous if completed.
   */
  onAttemptReset(): void {
    if (this.activePoints.length > 0) {
      this.previousPoints = [...this.activePoints];
      this.previousLandingMarker = this.activeLandingMarker ? { ...this.activeLandingMarker } : null;
    }
    this.activePoints = [];
    this.activeLandingMarker = null;
    this.redraw();
  }

  clearAll(): void {
    this.activePoints = [];
    this.activeLandingMarker = null;
    this.previousPoints = [];
    this.previousLandingMarker = null;
    this.graphics.clear();
    this.placeDots([]);
    this.landingText.setVisible(false);
  }

  /** Shows exactly `dots` from the pools (growing them as needed) and hides the rest. */
  private placeDots(dots: ReadonlyArray<{ x: number; y: number; style: DotStyle }>): void {
    const ink = hex(PAL.ink);
    for (let i = 0; i < dots.length; i++) {
      const { x, y, style } = dots[i]!;
      const rim = this.rims[i] ?? this.rims[this.rims.push(this.scene.add.image(0, 0, DOT_KEY).setDepth(6)) - 1]!;
      const core = this.cores[i] ?? this.cores[this.cores.push(this.scene.add.image(0, 0, DOT_KEY).setDepth(6.1)) - 1]!;
      rim.setPosition(x, y).setScale(style.rim / DOT_RADIUS_PX).setTint(ink).setAlpha(style.rimAlpha).setVisible(true);
      core.setPosition(x, y).setScale(style.core / DOT_RADIUS_PX).setTint(style.coreColor).setAlpha(style.coreAlpha).setVisible(true);
    }
    for (let i = dots.length; i < this.rims.length; i++) {
      this.rims[i]!.setVisible(false);
      this.cores[i]!.setVisible(false);
    }
  }

  private redraw(): void {
    this.graphics.clear();
    const marker = this.activeLandingMarker ?? this.previousLandingMarker;
    this.landingText.setVisible(Boolean(marker?.label));
    if (marker) {
      this.landingText.setText(`${this.activeLandingMarker ? '' : 'Last: '}${marker.label}`);
      // Sized and placed in screen terms, so zoomed-out maps keep it readable.
      const k = this.textBoost / (this.view.zoom ?? 1);
      this.landingText.setScale(k).setPosition(
        Math.max(10 * k, Math.min(this.view.width - this.landingText.width * k - 10 * k, marker.x + 12 * k)),
        (this.view.bottom ?? this.view.height) - 56 * k,
      );
    }

    const dots: Array<{ x: number; y: number; style: DotStyle }> = [];
    // 1. Previous shot: a quiet comic dotted path (paper dots, thin ink rims) for aiming reference.
    const ghost: DotStyle = { rim: 3.6, rimAlpha: 0.45, core: 2.4, coreColor: this.playerColor === null ? hex(PAL.paper) : playerDisplayColor(this.playerColor), coreAlpha: 0.75 };
    for (let i = 0; i < this.previousPoints.length; i += 2) dots.push({ ...this.previousPoints[i]!, style: ghost });
    if (this.previousLandingMarker) this.drawCross(this.previousLandingMarker.x, this.previousLandingMarker.y, 6, 0.5);

    // 2. Active shot: bold dots in the shooter's colour.
    const active: DotStyle = { rim: 4.2, rimAlpha: 0.9, core: 2.8, coreColor: this.playerColor === null ? hex(PAL.pow) : playerDisplayColor(this.playerColor), coreAlpha: 1 };
    for (let i = 0; i < this.activePoints.length; i += 2) dots.push({ ...this.activePoints[i]!, style: active });
    if (this.activeLandingMarker) this.drawCross(this.activeLandingMarker.x, this.activeLandingMarker.y, 9, 1);
    this.placeDots(dots);
  }

  /** An inked "X marks the spot" where the ball came down. */
  private drawCross(x: number, y: number, size: number, alpha: number): void {
    const g = this.graphics;
    g.lineStyle(size * 0.75, hex(PAL.ink), alpha);
    g.lineBetween(x - size, y - size, x + size, y + size);
    g.lineBetween(x - size, y + size, x + size, y - size);
    g.lineStyle(size * 0.38, hex(PAL.pow), alpha);
    g.lineBetween(x - size + 2, y - size + 2, x + size - 2, y + size - 2);
    g.lineBetween(x - size + 2, y + size - 2, x + size - 2, y - size + 2);
  }

  destroy(): void {
    this.graphics.destroy();
    for (const dot of [...this.rims, ...this.cores]) dot.destroy();
    this.landingText.destroy();
  }
}

