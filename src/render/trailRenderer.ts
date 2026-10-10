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

export class TrailRenderer {
  private graphics: Phaser.GameObjects.Graphics;
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

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(6);
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
    this.landingText.setVisible(false);
  }

  private redraw(): void {
    this.graphics.clear();
    const marker = this.activeLandingMarker ?? this.previousLandingMarker;
    this.landingText.setVisible(Boolean(marker?.label));
    if (marker) {
      this.landingText.setText(`${this.activeLandingMarker ? '' : 'Last: '}${marker.label}`);
      // Sized and placed in screen terms, so zoomed-out maps keep it readable.
      const k = 1 / (this.view.zoom ?? 1);
      this.landingText.setScale(k).setPosition(
        Math.max(10 * k, Math.min(this.view.width - this.landingText.width * k - 10 * k, marker.x + 12 * k)),
        (this.view.bottom ?? this.view.height) - 56 * k,
      );
    }

    const ink = hex(PAL.ink);
    const g = this.graphics;
    // 1. Previous shot: a quiet comic dotted path (paper dots, thin ink rims) for aiming reference.
    const ghostFill = this.playerColor === null ? hex(PAL.paper) : playerDisplayColor(this.playerColor);
    for (let i = 0; i < this.previousPoints.length; i += 2) {
      const p = this.previousPoints[i]!;
      g.fillStyle(ink, 0.45);
      g.fillCircle(p.x, p.y, 3.6);
      g.fillStyle(ghostFill, 0.75);
      g.fillCircle(p.x, p.y, 2.4);
    }
    if (this.previousLandingMarker) this.drawCross(this.previousLandingMarker.x, this.previousLandingMarker.y, 6, 0.5);

    // 2. Active shot: bold dots in the shooter's colour.
    const activeColor = this.playerColor === null ? hex(PAL.pow) : playerDisplayColor(this.playerColor);
    for (let i = 0; i < this.activePoints.length; i += 2) {
      const p = this.activePoints[i]!;
      g.fillStyle(ink, 0.9);
      g.fillCircle(p.x, p.y, 4.2);
      g.fillStyle(activeColor, 1);
      g.fillCircle(p.x, p.y, 2.8);
    }
    if (this.activeLandingMarker) this.drawCross(this.activeLandingMarker.x, this.activeLandingMarker.y, 9, 1);
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
    this.landingText.destroy();
  }
}

