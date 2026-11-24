import Phaser from 'phaser';
import type { AudioManager } from '../audio/audioManager';
import type { HatId } from '../art/jonhArt';
import { FLOW } from '../config/tuning';
import type { LevelData } from '../levels/types';
import type { RecordedShot } from '../physics/shotRecorder';
import { CameraRig } from '../render/cameraRig';
import { DemoStage } from '../render/demoStage';
import { ImpactTimeline } from '../render/impactTimeline';
import { ShotEffectsRenderer } from '../render/shotEffectsRenderer';
import { ReplayOverlay } from '../ui/replayOverlay';

export interface ShowcaseData {
  level: LevelData;
  shot: RecordedShot;
  angleDeg: number;
  powerPercent: number;
  playerName: string;
  color: number;
  pattern: string;
  hatId: HatId;
  reducedMotion: boolean;
  /** Jonh's line when it lands again. */
  line: string;
  /** In-canvas text size boost on small screens (see fx/readability.ts). */
  textBoost: number;
  audio: AudioManager;
  /** Called once, when the replay ends or is skipped. */
  onDone: () => void;
}

/**
 * The winning shot, replayed. Launched over the game scene when a multiplayer match ends: it shows
 * the garden (and Jonh's spot) where the winner's best hit happened, and plays that shot again —
 * the recorded Matter flight, the full impact — under a "Winning shot" letterbox. Skippable with a
 * tap, Enter, Space or Escape. Presentation only: the match is already decided.
 */
export class ShowcaseScene extends Phaser.Scene {
  private stage: DemoStage | null = null;
  private effects: ShotEffectsRenderer | null = null;
  private overlay: ReplayOverlay | null = null;
  private timeline = new ImpactTimeline();
  private showcase: ShowcaseData | null = null;
  private wait = 0;
  private after: number | null = null;
  private finished = false;
  /** Recreated per run: Phaser reuses this scene instance, and an aborted signal adds no listeners. */
  private abort = new AbortController();

  constructor() { super('ShowcaseScene'); }

  create(data: ShowcaseData): void {
    this.abort = new AbortController();
    this.showcase = data;
    this.finished = false;
    this.wait = FLOW.showcaseLeadSeconds;
    this.after = null;
    this.timeline = new ImpactTimeline();
    this.cameras.main.setBackgroundColor('#5EC2EC');
    this.effects = new ShotEffectsRenderer(this);
    this.stage = new DemoStage(this, data.level,
      { audio: data.audio, effects: this.effects, camera: new CameraRig(this.cameras.main), timeline: this.timeline },
      { hatId: data.hatId, reducedMotion: data.reducedMotion, color: data.color, pattern: data.pattern, textBoost: data.textBoost });
    this.overlay = new ReplayOverlay(document.getElementById('game') ?? document.body);
    this.overlay.setText(`Winning shot · ${data.playerName}`, 'Tap or press Enter to skip');
    this.overlay.show();
    this.input.on('pointerdown', () => this.finish());
    window.addEventListener('keydown', (e) => {
      if (e.repeat || !['Enter', 'Space', 'Escape'].includes(e.code)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.finish();
    }, { capture: true, signal: this.abort.signal });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  override update(_time: number, deltaMs: number): void {
    const data = this.showcase;
    if (!this.stage || !data || this.finished) return;
    const dt = Math.max(0, Math.min(FLOW.maxFrameSeconds, deltaMs / 1000));
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.stage.fire({
          shot: data.shot, angleDeg: data.angleDeg, powerPercent: data.powerPercent, line: data.line,
          onImpact: () => { this.after = FLOW.showcaseAfterSeconds; },
          onDone: () => { if (this.after === null) this.finish(); },
        });
      }
    }
    this.stage.update(dt, data.reducedMotion);
    if (this.after !== null) {
      this.after -= dt;
      if (this.after <= 0) this.finish();
    }
  }

  /** Ends the replay (skip or done): hands control back exactly once. */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    const done = this.showcase?.onDone;
    this.scene.stop();
    done?.();
  }

  private cleanup(): void {
    this.abort.abort();
    this.input.removeAllListeners();
    this.overlay?.destroy();
    this.overlay = null;
    this.stage?.destroy();
    this.stage = null;
    this.effects?.destroy();
    this.effects = null;
  }
}
