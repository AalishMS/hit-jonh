import Phaser from 'phaser';
import type { AudioManager } from '../audio/audioManager';
import type { HatId } from '../art/jonhArt';
import type { CannonSkinId, OutfitId } from '../rules/cosmetics';
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
  /** Cannon paint (multiplayer); null keeps the solo cannon, which then wears `skin`. */
  color: number | null;
  pattern: string;
  skin?: CannonSkinId;
  hatId: HatId;
  outfitId: OutfitId;
  reducedMotion: boolean;
  /** Jonh's line when it lands again. */
  line: string;
  /** In-canvas text size boost on small screens (see fx/readability.ts). */
  textBoost: number;
  audio: AudioManager;
  /** The letterbox tag, e.g. "Winning shot · Ana" (the default) or "Replay". */
  tag?: string;
  /**
   * Shareable clip: this run is played only to be recorded (see share/clipDirector.ts). The scene
   * ends at `endAt` (its own clock, 0 = start) instead of after the usual linger; a skip or an early
   * stop discards the recording.
   */
  clip?: {
    startAt: number;
    endAt: number;
    onRecordStart: () => void;
    /** `completed` is false when the replay was skipped or torn down before `endAt`. */
    onEnd: (completed: boolean) => void;
  };
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
  /** Clip mode: seconds on the scene's own clock, and whether recording started / the clip has been told the end. */
  private clock = 0;
  private clipStarted = false;
  private clipEnded = false;
  /** Recreated per run: Phaser reuses this scene instance, and an aborted signal adds no listeners. */
  private abort = new AbortController();

  constructor() { super('ShowcaseScene'); }

  create(data: ShowcaseData): void {
    this.abort = new AbortController();
    this.showcase = data;
    this.finished = false;
    this.clock = 0;
    this.clipStarted = false;
    this.clipEnded = false;
    this.wait = FLOW.showcaseLeadSeconds;
    this.after = null;
    this.timeline = new ImpactTimeline();
    this.cameras.main.setBackgroundColor('#5EC2EC');
    this.effects = new ShotEffectsRenderer(this);
    this.stage = new DemoStage(this, data.level,
      { audio: data.audio, effects: this.effects, camera: new CameraRig(this.cameras.main), timeline: this.timeline },
      { hatId: data.hatId, outfitId: data.outfitId, reducedMotion: data.reducedMotion, color: data.color, pattern: data.pattern, textBoost: data.textBoost,
        ...(data.skin ? { skin: data.skin } : {}) });
    this.overlay = new ReplayOverlay(document.getElementById('game') ?? document.body);
    if (data.clip) this.overlay.setText('Recording clip', 'Tap or press Enter to cancel');
    else this.overlay.setText(data.tag ?? `Winning shot · ${data.playerName}`, 'Tap or press Enter to skip');
    this.overlay.show();
    this.input.on('pointerdown', () => this.finish());
    window.addEventListener('keydown', (e) => {
      // While a clip is recorded no other key may reach the card or the game behind this scene.
      if (data.clip) e.stopImmediatePropagation();
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
    this.clock += dt;
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.stage.fire({
          shot: data.shot, angleDeg: data.angleDeg, powerPercent: data.powerPercent, line: data.line,
          onImpact: () => { if (!data.clip) this.after = FLOW.showcaseAfterSeconds; },
          onDone: () => { if (this.after === null && !data.clip) this.finish(true); },
        });
      }
    }
    this.stage.update(dt, data.reducedMotion);
    if (this.after !== null) {
      this.after -= dt;
      if (this.after <= 0) this.finish(true);
    }
    const clip = data.clip;
    if (clip) {
      if (!this.clipStarted && this.clock >= clip.startAt) {
        this.clipStarted = true;
        clip.onRecordStart();
      }
      if (this.clock >= clip.endAt) this.finish(true);
    }
  }

  /** Ends the replay (`completed`: it ran to its end; false: skipped): hands control back exactly once. */
  finish(completed = false): void {
    if (this.finished) return;
    this.finished = true;
    const done = this.showcase?.onDone;
    this.endClip(completed);
    this.scene.stop();
    done?.();
  }

  /** Tells the clip recording how the replay ended (once). */
  private endClip(completed: boolean): void {
    if (this.clipEnded) return;
    this.clipEnded = true;
    this.showcase?.clip?.onEnd(completed);
  }

  private cleanup(): void {
    // Stopped from outside (Home, a new match): a recording in progress is discarded.
    this.endClip(false);
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
