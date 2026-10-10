import Phaser from 'phaser';
import { AudioManager } from '../audio/audioManager';
import { AIM, FLOW, FX, LOOK, MULTIPLAYER, PHYSICS, PROJECTILE, SHOT, WORLD } from '../config/tuning';
import { CameraRig } from '../render/cameraRig';
import { ReplayBuffer, ReplayDirector, type ReplayFrame } from '../fx/replay';
import { ReplayOverlay } from '../ui/replayOverlay';
import { aimFrame, flightFrame, impactFrame, levelView, replayFrame, type Frame, type Viewport } from '../fx/cameraDirector';
import { clamp01 } from '../fx/easing';
import { hitQuality, impactProfile, type HitQuality } from '../fx/impactProfile';
import type { SurfaceSound } from '../audio/audioManager';
import { CanvasAim } from '../input/canvasAim';
import { AutoAdvance } from '../rules/autoAdvance';
import { InputCoordinator, isTextInputElement } from '../input/controls';
import { MAPS } from '../levels';
import { levelAtMultiplayerPosition } from '../levels/multiplayerPositions';
import { MatterAdapter, type ProjectileState } from '../physics/matterAdapter';
import { BallRenderer } from '../render/ballRenderer';
import { ImpactTimeline } from '../render/impactTimeline';
import { ShotEffectsRenderer } from '../render/shotEffectsRenderer';
import { CannonRenderer } from '../render/cannonRenderer';
import { CannonSlotsRenderer } from '../render/cannonSlotsRenderer';
import { DebugRenderer } from '../render/debugRenderer';
import { JonhRenderer } from '../render/jonhRenderer';
import { SceneryRenderer } from '../render/sceneryRenderer';
import { asPreviousTrail, type TrailData, TrailRenderer } from '../render/trailRenderer';
import { PlayerHistory } from '../rules/playerHistory';
import { classifyShotOutcome, JonhReactionSelector } from '../rules/reactions';
import { SessionCoordinator } from '../rules/sessionCoordinator';
import { ShotAttemptMachine } from '../rules/shotAttempt';
import { SoloChallengeMachine } from '../rules/soloChallenge';
import { SoloCoordinator } from '../rules/soloCoordinator';
import { MultiplayerMatchMachine, OUTCOME_POINTS, type MPPlayerSetup } from '../rules/multiplayerMatch';
import { MultiCoordinator } from '../rules/multiCoordinator';
import { ShotClassifier, type ClassifiedOutcome } from '../sim/classification';
import { FixedStepper } from '../sim/fixedStep';
import {
  launchVelocityToWorld,
  metresToPixels,
  MS_PER_SECOND,
  matterGravityY,
  simYToWorldY,
} from '../sim/units';
import { levelPhysics, type LevelPhysics } from '../levels/levelPhysics';
import { HTMLControls } from '../ui/htmlControls';
import { MenuOverlay, type SoloResultExtras } from '../ui/menuOverlay';
import { loadProgress, loadSaveData, recordSoloResult, saveMultiplayerSetup, saveProgress, saveSettings, saveSoloAim } from '../storage/storage';
import { HAT_ORDER, HAT_RULES, dailyChallenge, dailyStreak, dateKey, freshProgress, newlyUnlocked, recordDaily, recordShot, recordSoloFinish, unlockedHats, type HatName, type Progress } from '../rules/progression';
import { mapPreview } from '../ui/mapPreview';
import type { LevelData } from '../levels/types';
import { isOnlineConfigured } from '../net/convexClient';
import { OnlineController, type OnlineSceneHooks } from './onlineController';

/** Result labels when the official online outcome differs from what this device simulated. */
const OFFICIAL_LABELS: Record<ClassifiedOutcome, string> = {
  ricochet_body: 'Ricochet hit', body: 'Direct hit', hat_only: 'Hat hit', miss: 'Miss',
};

/** Impact sound per obstacle material; anything hard and unlisted clunks like concrete. */
const SURFACE_SOUNDS: Partial<Record<string, SurfaceSound>> = { wood: 'wood', rubber: 'rubber', trampoline: 'rubber', leaves: 'ground' };

export class PrototypeScene extends Phaser.Scene {
  private readonly stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
  private attemptMachine!: ShotAttemptMachine;
  private soloMachine!: SoloChallengeMachine;
  private soloCoordinator!: SoloCoordinator;
  
  private multiMachine!: MultiplayerMatchMachine;
  private multiCoordinator!: MultiCoordinator;
  private sessionCoordinator!: SessionCoordinator;
  
  private activeMode: 'none' | 'solo' | 'multi' = 'none';
  private readonly autoAdvance = new AutoAdvance();
  private readonly impactTimeline = new ImpactTimeline();
  private effects!: ShotEffectsRenderer;
  private cameraRig!: CameraRig;
  private canvasAim!: CanvasAim;
  /** Muzzle position waiting for the cannon wind-up to finish. */
  private pendingLaunch: { x: number; y: number; angleRad: number } | null = null;
  private prevVelocity: { vx: number; vy: number } | null = null;
  /** Horizontal travel direction of the ball before it touched Jonh. */
  private flightDir = 1;
  private impactQuality: HitQuality | null = null;
  private attract: { scenery: SceneryRenderer; jonh: JonhRenderer; cannon: CannonRenderer } | null = null;
  private soloResultExtras: SoloResultExtras = {};
  private progress: Progress = freshProgress();
  private pendingUnlocks: HatName[] = [];
  /** Set while playing today's Daily Bonk (never overwrites solo bests). */
  private daily: { key: string; positionId: string } | null = null;
  private readonly hatImages = new Map<string, string>();
  private readonly replayBuffer = new ReplayBuffer(3);
  private replay: ReplayDirector | null = null;
  private replayCountdown: number | null = null;
  private replayOverlay!: ReplayOverlay;
  private contact: { x: number; y: number; dirX: number; dirY: number; quality: HitQuality; simT: number } | null = null;
  /** After a body hit the ball bounces away cosmetically (the simulation is already resolved). */
  private cosmeticBall: { x: number; y: number; vx: number; vy: number } | null = null;
  private outOfCanvasSoundPlayed = false;
  private skipPresentationFrame = false;

  private get activeCoordinator() {
    return this.activeMode === 'multi' ? this.multiCoordinator : this.soloCoordinator;
  }

  private physicsAdapter!: MatterAdapter;
  private inputCoordinator!: InputCoordinator;
  private htmlControls!: HTMLControls;
  private menuOverlay!: MenuOverlay;
  private audioManager!: AudioManager;
  private reactionSelector = new JonhReactionSelector();
  private classifier = new ShotClassifier();

  private currentLevel!: LevelData;
  private multiplayerPositionKey = '';
  /** Online play glue; null when no Convex deployment is configured. */
  private online: OnlineController | null = null;
  /** This device's view of the current online shot, kept until the official outcome is applied. */
  private onlineLocal: { outcome: ClassifiedOutcome; label: string; quote: string; resultSeconds: number } | null = null;
  private sceneryRenderer!: SceneryRenderer;
  private cannonRenderer!: CannonRenderer;
  private slotsRenderer: CannonSlotsRenderer | null = null;
  private levelPhys: LevelPhysics = levelPhysics({});
  /** Resting camera view of the current map (wider maps are zoomed out). */
  private view: Viewport = { width: WORLD.designWidthPx, height: WORLD.designHeightPx };
  private jonhRenderer!: JonhRenderer;
  private ballRenderer!: BallRenderer;
  private trailRenderer!: TrailRenderer;
  private debugRenderer!: DebugRenderer;

  private trailHistory = new PlayerHistory<TrailData>();
  private shotShooterIndex: number | null = null;

  private currentAngleDeg = 45;
  private currentPowerPercent = 50;
  private lastProjectileState: ProjectileState | null = null;
  private groundFeedbackShown = false;
  private hatReactionTriggered = false;
  private overheadReactionTriggered = false;
  private activeReactionQuote: string | null = null;
  private isDebugEnabled = false;
  private isDevOptIn = false;

  private cleanupHandlers: Array<() => void> = [];

  constructor() {
    super('PrototypeScene');
  }

  create(): void {
    const { designHeightPx: h, pixelsPerMetre: ppm } = WORLD;

    this.progress = loadProgress();
    this.audioManager = new AudioManager();
    if (import.meta.env.DEV) (window as unknown as { __HIT_JONH_AUDIO__: AudioManager }).__HIT_JONH_AUDIO__ = this.audioManager;
    this.effects = new ShotEffectsRenderer(this);
    this.cameraRig = new CameraRig(this.cameras.main);
    this.replayOverlay = new ReplayOverlay(document.getElementById('game') ?? document.body);

    const matterEngine = this.matter.world.engine;
    this.physicsAdapter = new MatterAdapter(matterEngine.world, ppm, h);

    const gameContainer = document.getElementById('game')?.parentElement ?? document.body;
    
    // Check URL param ?debug - explicitly gated dev opt-in (dev mode only)
    const hasDebugParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
    this.isDevOptIn = Boolean(import.meta.env.DEV) && hasDebugParam;
    this.isDebugEnabled = this.isDevOptIn;

    this.sessionCoordinator = new SessionCoordinator({
      onPause: () => {
        this.canvasAim.cancel();
        this.inputCoordinator.setPaused(true);
        this.htmlControls.setControlsInert(true);
        this.menuOverlay.showPauseMenu(this.online?.inMatch ? 'Leave match' : undefined);
      },
      onResume: () => {
        this.inputCoordinator.setPaused(false);
        this.htmlControls.setControlsInert(false);
        if (this.activeMode === 'solo') {
          this.updateUIPerSoloState();
        } else if (this.activeMode === 'multi') {
          this.updateUIPerMultiState();
        }
        this.menuOverlay.hide();
      },
      onQuit: () => {
        this.performQuit();
      }
    }, this.stepper);

    this.htmlControls = new HTMLControls(
      gameContainer,
      {
        onAngleChange: (angle) => this.setAngle(angle),
        onPowerChange: (power) => this.setPower(power),
        onFire: () => this.fire(),
        onReset: () => this.reset(),
        onToggleDebug: (enabled) => {
          if (!this.isDevOptIn) return;
          this.isDebugEnabled = enabled;
          if (this.debugRenderer) this.debugRenderer.setVisible(enabled);
        },
        onToggleMute: () => {
          const muted = this.audioManager.toggleMute();
          return muted;
        },
        onPause: () => this.togglePause(),
        onHome: () => {
          if (this.sessionCoordinator.isPaused) this.sessionCoordinator.quit();
          else this.performQuit();
        },
      },
      this.currentAngleDeg,
      this.currentPowerPercent,
      this.isDebugEnabled,
      this.audioManager.isSilenced,
    );
    this.htmlControls.setDebugOptIn(this.isDevOptIn);

    this.menuOverlay = new MenuOverlay(gameContainer, {
      onMapSelected: (mapId) => this.loadMap(mapId),
      onRetry: () => {
        this.inputCoordinator.setOverlayVisible(false);
        this.htmlControls.setVisible(true);
        this.htmlControls.setControlsInert(false);
        this.soloMachine.retry();
        this.reset();
      },
      onReturnToMenu: () => {
        this.performQuit();
      },
      onStartMultiplayer: (players, maps) => this.startMultiplayer(players, maps),
      onMultiplayerHandoverContinue: () => this.beginMultiplayerTurn(),
      onMultiplayerNextRound: () => this.nextMultiplayerRound(),
      onMultiplayerRematch: () => {
        if (this.online?.inMatch) { this.online.requestRematch(); return; }
        this.inputCoordinator.setOverlayVisible(false);
        this.multiMachine.rematch();
        this.trailHistory.clear();
        this.loadMultiplayerMap(this.multiMachine.currentMapId);
        this.updateUIPerMultiState();
      },
      onPauseResume: () => this.sessionCoordinator.resume(),
      onPauseQuit: () => this.sessionCoordinator.quit(),
      onSettingsChange: (settings) => {
        saveSettings(settings);
        this.audioManager.setMuted(settings.muted);
        this.audioManager.setVolume(settings.volume);
        this.audioManager.setMusicEnabled(settings.music);
        this.htmlControls.setMuted(this.audioManager.isSilenced);
        document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
        if (this.jonhRenderer) this.jonhRenderer.setReducedMotion(settings.reducedMotion);
        this.attract?.jonh.setReducedMotion(settings.reducedMotion);
      },
      onClick: () => this.audioManager.playClick(),
      onHomeExtras: (row, signal) => this.addHomeExtras(row, signal),
      onOnline: isOnlineConfigured() ? () => this.online?.open() : undefined,
    });
    this.online = isOnlineConfigured() ? new OnlineController(this.menuOverlay, this.onlineHooks()) : null;
    document.documentElement.classList.toggle('reduced-motion', loadSaveData().settings.reducedMotion);

    this.inputCoordinator = new InputCoordinator({
      onFire: () => this.fire(),
      onReset: () => this.reset(),
      onContinue: () => {
        if (this.attemptMachine?.state === 'resolved') {
          this.reset();
        }
      },
      onToggleMute: () => {
        const isMuted = this.audioManager.toggleMute();
        this.htmlControls.setMuted(isMuted);
      },
      onAimChange: (deltaAngle, deltaPower) => {
        if (this.attemptMachine?.state !== 'aiming') return;
        if (deltaAngle !== 0) {
          const nextAngle = Math.max(AIM.minAngleDeg, Math.min(AIM.maxAngleDeg, this.currentAngleDeg + deltaAngle));
          this.setAngle(nextAngle);
        }
        if (deltaPower !== 0) {
          const nextPower = Math.max(0, Math.min(100, this.currentPowerPercent + deltaPower));
          this.setPower(nextPower);
        }
      },
      onEscape: () => this.togglePause(),
    });

    this.canvasAim = new CanvasAim(this.game.canvas, {
      canAim: () => this.canAimNow(),
      getAim: () => ({ angle: this.currentAngleDeg, power: this.currentPowerPercent }),
      onAim: (angle, power) => { this.setAngle(angle); this.setPower(power); },
      toWorld: (clientX, clientY) => {
        const rect = this.game.canvas.getBoundingClientRect();
        const x = ((clientX - rect.left) / Math.max(1, rect.width)) * WORLD.designWidthPx;
        const y = ((clientY - rect.top) / Math.max(1, rect.height)) * WORLD.designHeightPx;
        const p = this.cameras.main.getWorldPoint(x, y);
        return { x: p.x, y: p.y };
      },
      pivot: () => this.cannonRenderer?.pivot ?? { x: 0, y: 0 },
      worldPerPx: () => 1 / (this.view.zoom ?? 1),
    });

    // Gesture unlock
    const unlockAudio = () => this.audioManager.unlock();
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
    this.cleanupHandlers.push(() => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    });

    // Keyboard bindings
    const onKeyDown = (e: KeyboardEvent) => {
      const isInput = isTextInputElement(e.target || document.activeElement);

      if (e.code === 'KeyD' && !isInput && this.isDevOptIn) {
        if (this.debugRenderer) this.isDebugEnabled = this.debugRenderer.toggle();
        return;
      }
      
      const isOverlayOpen = this.menuOverlay.isVisible() && !this.menuOverlay.isPauseMenuVisible();
      this.inputCoordinator.setOverlayVisible(isOverlayOpen);

      const focused = e.target instanceof HTMLElement ? e.target : document.activeElement;
      const isActionButton = focused instanceof HTMLButtonElement && focused.id !== 'fire-btn';
      const handled = this.inputCoordinator.handleKeyDown(e.code, e.repeat, isInput, isActionButton);
      if (handled) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.inputCoordinator.handleKeyUp(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.cleanupHandlers.push(() => window.removeEventListener('keydown', onKeyDown));
    this.cleanupHandlers.push(() => window.removeEventListener('keyup', onKeyUp));

    const onHidden = () => { this.stepper.reset(); this.skipPresentationFrame = true; };
    const onVisible = () => { this.stepper.reset(); this.skipPresentationFrame = true; };
    this.game.events.on(Phaser.Core.Events.HIDDEN, onHidden);
    this.game.events.on(Phaser.Core.Events.VISIBLE, onVisible);
    this.cleanupHandlers.push(() => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, onHidden);
      this.game.events.off(Phaser.Core.Events.VISIBLE, onVisible);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    // Start at Home with gameplay controls hidden and disabled.
    this.htmlControls.setCanFire(false);
    this.htmlControls.setControlsInert(true);
    this.htmlControls.setVisible(false);
    this.menuOverlay.showHome();
    this.showAttract();

    // A shared room link (?room=CODE) opens online play directly, rejoining this tab's seat after a reload.
    const roomParam = new URLSearchParams(window.location.search).get('room');
    if (roomParam && this.online) void this.online.openFromLink(roomParam);
  }

  /** True while the active player may adjust aim (drives drag input and the aim aids). */
  private canAimNow(): boolean {
    return this.activeMode !== 'none' && !this.sessionCoordinator.isPaused && !this.menuOverlay.isVisible() &&
      Boolean(this.activeCoordinator?.canAdjustAim()) && this.attemptMachine?.state === 'aiming' && this.canUserAct();
  }

  /** Online: only the seated player the server is waiting on may aim or fire. Hot-seat: always. */
  private canUserAct(): boolean {
    const online = this.online;
    if (!online?.inMatch) return true;
    return online.isMyTurnToAim() && this.multiMachine.activePlayerIndex === online.mySeat;
  }

  private togglePause(): void {
    if (this.sessionCoordinator.isPaused) {
      this.sessionCoordinator.resume();
    } else {
      if (this.activeMode === 'none') return;
      const isModalOpen = this.menuOverlay.isVisible() && !this.menuOverlay.isPauseMenuVisible();
      const shotState = this.attemptMachine?.state ?? 'aiming';
      const canPause = this.sessionCoordinator.canPause(this.activeMode, shotState, isModalOpen);
      if (canPause) {
        this.sessionCoordinator.requestPause(true);
      }
    }
  }

  private performQuit(): void {
    // Leaving an online room tells the server, then tears down gameplay via the leaveToMenu hook.
    if (this.online?.inRoom) { this.online.leave(); return; }
    this.teardownGameplay();
  }

  private teardownGameplay(): void {
    this.daily = null;
    this.autoAdvance.cancel();
    this.resetEffects();
    this.canvasAim.cancel();
    this.inputCoordinator.setPaused(false);
    this.inputCoordinator.setCanFire(false);
    this.activeMode = 'none';
    this.stepper.reset();
    this.classifier.reset();
    this.physicsAdapter.clear();
    this.trailHistory.clear();
    this.lastProjectileState = null;
    this.currentLevel = null as unknown as LevelData;
    this.attemptMachine = null as unknown as ShotAttemptMachine;
    this.shotShooterIndex = null;

    if (this.sceneryRenderer) { this.sceneryRenderer.destroy(); this.sceneryRenderer = null as unknown as SceneryRenderer; }
    if (this.cannonRenderer) { this.cannonRenderer.destroy(); this.cannonRenderer = null as unknown as CannonRenderer; }
    if (this.slotsRenderer) { this.slotsRenderer.destroy(); this.slotsRenderer = null; }
    if (this.jonhRenderer) { this.jonhRenderer.destroy(); this.jonhRenderer = null as unknown as JonhRenderer; }
    if (this.ballRenderer) { this.ballRenderer.destroy(); this.ballRenderer = null as unknown as BallRenderer; }
    if (this.trailRenderer) { this.trailRenderer.destroy(); this.trailRenderer = null as unknown as TrailRenderer; }
    if (this.debugRenderer) { this.debugRenderer.destroy(); this.debugRenderer = null as unknown as DebugRenderer; }

    this.htmlControls.setCanFire(false);
    this.htmlControls.setControlsInert(true);
    this.htmlControls.setVisible(false);
    this.htmlControls.setFeedback('', 'info');
    this.menuOverlay.showHome();
    this.showAttract();
  }

  /** The title screen's live backdrop: Jonh reading in his garden while menus are open. */
  private showAttract(): void {
    this.hideAttract();
    const level = MAPS[0]!;
    const { designWidthPx: w, designHeightPx: h, pixelsPerMetre: ppm } = WORLD;
    const scenery = new SceneryRenderer(this, ppm, h, w);
    scenery.draw(level);
    const jonh = new JonhRenderer(this, level.jonhSpawn, ppm, h, { level, hatId: this.progress.selectedHat });
    jonh.setReducedMotion(loadSaveData().settings.reducedMotion);
    const cannon = new CannonRenderer(this, level.cannonSpawn, ppm, h);
    cannon.setAimAids(false, 50);
    cannon.draw(38, null);
    this.view = { width: w, height: h };
    this.cameraRig?.setView(this.view);
    this.attract = { scenery, jonh, cannon };
  }

  private hideAttract(): void {
    if (!this.attract) return;
    this.attract.scenery.destroy();
    this.attract.jonh.destroy();
    this.attract.cannon.destroy();
    this.attract = null;
  }


  private loadMap(mapId: string, daily: { key: string; positionId: string } | null = null): void {
    this.hideAttract();
    this.autoAdvance.cancel();
    this.resetEffects();
    this.activeMode = 'solo';
    const level = MAPS.find(m => m.id === mapId);
    if (!level) return;
    this.daily = daily;
    this.currentLevel = daily ? levelAtMultiplayerPosition(level, daily.positionId) : level;

    const { designWidthPx: w, designHeightPx: h, pixelsPerMetre: ppm } = WORLD;

    // Clean up old renderers
    if (this.sceneryRenderer) this.sceneryRenderer.destroy();
    if (this.cannonRenderer) this.cannonRenderer.destroy();
    if (this.jonhRenderer) this.jonhRenderer.destroy();
    if (this.ballRenderer) this.ballRenderer.destroy();
    if (this.trailRenderer) this.trailRenderer.destroy();
    if (this.debugRenderer) this.debugRenderer.destroy();

    // Reset physics
    this.physicsAdapter.clear();
    this.loadPhysics();

    // Initialize state machines
    this.attemptMachine = new ShotAttemptMachine(
      this.currentLevel.bounds.maxX,
      SHOT.settledSpeedMs,
      SHOT.settledSeconds,
      SHOT.timeoutSeconds,
      SHOT.boundsMarginMetres,
    );
    this.soloMachine = new SoloChallengeMachine(mapId);

    this.soloCoordinator = new SoloCoordinator(this.attemptMachine, this.soloMachine, {
      onStateChange: () => this.updateUIPerSoloState(),
      onShotFired: (angle, power) => {
        if (!this.daily) saveSoloAim(this.soloMachine.mapId, angle, power);
        
        const muzzle = this.cannonRenderer.getMuzzlePosition(angle, PROJECTILE.radiusMetres);
        const speed = this.levelPhys.launchSpeed(power);
        const vWorld = launchVelocityToWorld(speed, angle, WORLD.pixelsPerMetre);
        const radiusPx = metresToPixels(PROJECTILE.radiusMetres, WORLD.pixelsPerMetre);

        this.physicsAdapter.spawnProjectile(muzzle.x, muzzle.y, radiusPx, vWorld);
        this.ballRenderer.draw(muzzle.x, muzzle.y);
      },
      onShowResult: (res) => {
        this.inputCoordinator.setOverlayVisible(true);
        this.htmlControls.setControlsInert(true);
        this.menuOverlay.showSoloResult(res.success, res.shotsUsed, res.stars, res.hasStyle, this.soloResultExtras);
        this.audioManager.playSting(res.success);
        this.htmlControls.setCanFire(false);
        this.htmlControls.setFeedback('', 'info');
        this.htmlControls.setResetLabel('Continue ↵');
      }
    });

    // Renderers
    this.sceneryRenderer = new SceneryRenderer(this, ppm, h, w);
    this.sceneryRenderer.draw(this.currentLevel);

    this.cannonRenderer = new CannonRenderer(this, this.currentLevel.cannonSpawn, ppm, h, this.levelPhys);
    this.cannonRenderer.setUiScale(1 / (this.view.zoom ?? 1));
    this.jonhRenderer = new JonhRenderer(this, this.currentLevel.jonhSpawn, ppm, h, { level: this.currentLevel, hatId: this.progress.selectedHat });
    this.jonhRenderer.setUiScale(1 / (this.view.zoom ?? 1));
    this.jonhRenderer.draw(false);

    const radiusPx = metresToPixels(PROJECTILE.radiusMetres, ppm);
    this.ballRenderer = new BallRenderer(this, radiusPx);
    this.trailRenderer = new TrailRenderer(this);
    this.trailRenderer.setView(this.view);
    this.debugRenderer = new DebugRenderer(this, ppm, h);
    if (this.isDebugEnabled) this.debugRenderer.setVisible(true);

    // Load saved aim
    const data = loadSaveData();
    if (data.solo[mapId]) {
      this.currentAngleDeg = data.solo[mapId].lastAngle;
      this.currentPowerPercent = data.solo[mapId].lastPower;
    } else {
      this.currentAngleDeg = 45;
      this.currentPowerPercent = 50;
    }

    this.attemptMachine.setAim(this.currentAngleDeg, this.currentPowerPercent);
    this.cannonRenderer.draw(this.currentAngleDeg);
    this.htmlControls.setVisible(true);
    this.htmlControls.setControlsInert(false);
    this.inputCoordinator.setOverlayVisible(false);
    this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
    this.jonhRenderer.setReducedMotion(data.settings.reducedMotion);

    this.reset();
    if (this.currentLevel.arrivalLine) this.jonhRenderer.triggerArrival(this.currentLevel.arrivalLine);
    this.updateUIPerSoloState();
  }

  private setAngle(angle: number): void {
    if (this.activeMode === 'none' || this.sessionCoordinator?.isPaused || this.menuOverlay.isVisible() || !this.activeCoordinator) return;
    if (!this.canUserAct()) return;
    const res = this.activeCoordinator.adjustAim(this.currentAngleDeg, this.currentPowerPercent, angle - this.currentAngleDeg, 0);
    if (res) {
      this.currentAngleDeg = res.angle;
      this.drawCannon();
      this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
    }
  }

  private setPower(power: number): void {
    if (this.activeMode === 'none' || this.sessionCoordinator?.isPaused || this.menuOverlay.isVisible() || !this.activeCoordinator) return;
    if (!this.canUserAct()) return;
    const res = this.activeCoordinator.adjustAim(this.currentAngleDeg, this.currentPowerPercent, 0, power - this.currentPowerPercent);
    if (res) {
      this.currentPowerPercent = res.power;
      this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
    }
  }

  private fire(source: 'user' | 'remote' = 'user'): void {
    if (this.activeMode === 'none' || this.sessionCoordinator?.isPaused || this.menuOverlay.isVisible() || !this.activeCoordinator || !this.activeCoordinator.canFire()) return;
    if (source === 'user' && !this.canUserAct()) return;

    this.canvasAim.cancel();
    this.autoAdvance.cancel();
    this.resetEffects();
    this.outOfCanvasSoundPlayed = false;
    this.audioManager.unlock();

    this.classifier.reset();
    this.inputCoordinator.setCanFire(false);
    this.htmlControls.setCanFire(false);

    this.activeCoordinator.fire(this.currentAngleDeg, this.currentPowerPercent);
    if (source === 'user' && this.online?.inMatch) this.online.onUserFire(this.currentAngleDeg, this.currentPowerPercent);
    const muzzle = this.cannonRenderer.getMuzzlePosition(this.currentAngleDeg, PROJECTILE.radiusMetres);
    this.pendingLaunch = { x: muzzle.x, y: muzzle.y, angleRad: this.currentAngleDeg * Math.PI / 180 };
    this.replayBuffer.clear();
    this.cosmeticBall = null;
    this.contact = null;
    this.prevVelocity = null;
    this.impactQuality = null;
    if (this.jonhRenderer.isReducedMotionActive()) {
      this.releaseLaunch();
    } else {
      // Anticipation: simulation time is held (never the step size) while the cannon winds up.
      this.impactTimeline.hold(FX.windupSeconds);
      this.ballRenderer.setVisible(false);
      this.audioManager.playFuse();
    }

    if (this.activeMode === 'solo') {
      this.htmlControls.setFeedback(`Attempt ${3 - this.soloMachine.attemptsLeft}/3: Cannonball in flight...`, 'simulating');
    } else {
      this.shotShooterIndex = this.multiMachine.lastShooterIndex;
      const shooter = this.multiMachine.players[this.shotShooterIndex!]!;
      this.trailRenderer.setPlayerColor(shooter.color);
      this.htmlControls.setFeedback(`${shooter.name}'s shot: Cannonball in flight...`, 'simulating');
    }

    this.trailRenderer.startNewShot();
    this.groundFeedbackShown = false;
    this.hatReactionTriggered = false;
    this.overheadReactionTriggered = false;
    this.activeReactionQuote = null;
    this.jonhRenderer.resetToIdle();
  }

  reset(): void {
    if (this.activeMode === 'none' || this.sessionCoordinator?.isPaused || !this.physicsAdapter || !this.activeCoordinator) return;

    if (!this.activeCoordinator.canReset()) return;
    // Online: the official outcome hasn't been applied yet (hot-seat scores before it can get here).
    if (this.activeMode === 'multi' && this.multiMachine.state === 'simulating') return;
    this.autoAdvance.cancel();
    this.resetEffects();
    this.activeCoordinator.reset(this.currentAngleDeg, this.currentPowerPercent);

    if (this.activeMode === 'solo' && this.soloMachine.state === 'solo_result') return;
    if (this.activeMode === 'multi' && (this.multiMachine.state === 'round_result' || this.multiMachine.state === 'match_result')) return;

    this.audioManager.unlock();
    this.physicsAdapter.clear();
    this.loadPhysics();
    this.stepper.reset();
    this.classifier.reset();
    
    this.lastProjectileState = null;
    this.groundFeedbackShown = false;
    this.hatReactionTriggered = false;
    this.overheadReactionTriggered = false;
    this.activeReactionQuote = null;

    this.ballRenderer.setVisible(false);
    this.jonhRenderer.resetToIdle();
    this.jonhRenderer.draw(false);
    this.drawCannon();
    this.trailRenderer.onAttemptReset();
    
    if (this.activeMode === 'solo') {
      this.updateUIPerSoloState();
    } else {
      this.updateUIPerMultiState();
    }
  }

  private updateUIPerSoloState(): void {
    if (this.soloMachine.state === 'aiming') {
      this.htmlControls.setControlsInert(false);
      this.inputCoordinator.setCanFire(true);
      this.htmlControls.setCanFire(true);
      this.htmlControls.setResetLabel('Aim again ↵');
      this.htmlControls.setMatchStatus(this.daily ? `Daily Bonk · ${this.currentLevel.name}` : this.currentLevel.name, []);
      this.htmlControls.setStreak(this.progress.currentStreak);
      const left = this.soloMachine.attemptsLeft;
      this.htmlControls.setAttempts(left);
      this.htmlControls.setFeedback(left === 3 ? 'Drag the cannon (or the field) to aim, then FIRE' : `${left} shot${left === 1 ? '' : 's'} left. Adjust and fire again`, 'info');
    }
  }

  override update(_time: number, deltaMs: number): void {
    this.online?.update(Math.max(0, Math.min(FLOW.maxFrameSeconds, deltaMs / MS_PER_SECOND)));
    if (this.activeMode === 'none' && this.attract) {
      const dt = Math.max(0, Math.min(FLOW.maxFrameSeconds, deltaMs / MS_PER_SECOND));
      const reduced = this.attract.jonh.isReducedMotionActive();
      this.attract.scenery.update(dt, reduced);
      this.attract.jonh.update(dt);
      return;
    }
    if (this.sessionCoordinator?.isPaused || this.activeMode === 'none' || !this.currentLevel || !this.attemptMachine) return;
    if (this.skipPresentationFrame) { this.skipPresentationFrame = false; return; }
    const dtSeconds = Math.max(0, Math.min(FLOW.maxFrameSeconds, deltaMs / MS_PER_SECOND));
    const reduced = this.jonhRenderer.isReducedMotionActive();
    this.sceneryRenderer.update(dtSeconds, reduced);
    const wasHolding = this.impactTimeline.isHolding;
    const timelineSeconds = this.impactTimeline.advance(dtSeconds, false, reduced);
    if (this.pendingLaunch && (!this.impactTimeline.isHolding || !wasHolding)) this.releaseLaunch();
    // Presentation time: the replay (if playing) drives Jonh, effects and the ball instead.
    const replayFrameNow = this.advanceReplay(dtSeconds, reduced);
    const reactionSeconds = replayFrameNow
      ? (replayFrameNow.phase === 'pre' ? dtSeconds * FX.replaySpeed : replayFrameNow.reactionDt)
      : timelineSeconds;
    const recoil = this.effects.update(reactionSeconds, reduced, dtSeconds);
    this.cannonRenderer.update(dtSeconds);
    this.cannonRenderer.setRecoil(recoil, this.currentAngleDeg);
    this.cannonRenderer.setWindup(this.pendingLaunch ? 1 - this.impactTimeline.holdRemainingSeconds / Math.max(0.001, FX.windupSeconds) : 0);
    this.cannonRenderer.setAimAids(this.canAimNow(), this.currentPowerPercent);
    this.drawCannon();

    const advance = this.autoAdvance.advance(dtSeconds);
    if (advance === 'shot') { this.reset(); return; }
    if (advance === 'handover') { this.beginMultiplayerTurn(); return; }
    if (advance === 'round') { this.nextMultiplayerRound(); return; }

    this.jonhRenderer.setAware(this.canvasAim.isDragging);
    this.jonhRenderer.setAlarm(replayFrameNow?.phase === 'pre' ? this.replayAlarm(replayFrameNow) : this.incomingAlarm());
    this.jonhRenderer.update(reactionSeconds);
    const steps = this.stepper.advance(timelineSeconds);
    const stepMs = PHYSICS.fixedStepSeconds * MS_PER_SECOND;

    for (let i = 0; i < steps; i++) {
      this.matter.world.step(stepMs);

      if (this.attemptMachine.state === 'simulating') {
        const state = this.physicsAdapter.stepProjectile(this.currentLevel, PROJECTILE.radiusMetres);
        if (state) {
          // Sound follows the visible canvas; top exits still keep their valid flight path.
          const v = this.view;
          const bottom = v.bottom ?? v.height;
          if (!this.outOfCanvasSoundPlayed && (state.xPx < 0 || state.xPx > v.width ||
            state.yPx < bottom - v.height || state.yPx > bottom)) {
            this.outOfCanvasSoundPlayed = true;
            this.audioManager.playOutOfBounds();
          }
          if (!state.hitJonh && Math.abs(state.vxSim) > 0.05) this.flightDir = Math.sign(state.vxSim);
          this.detectBounce(state, reduced);
          this.lastProjectileState = state;
          const ppmNow = WORLD.pixelsPerMetre;
          this.replayBuffer.push({ t: this.attemptMachine.simulatedTime + PHYSICS.fixedStepSeconds, x: state.xPx, y: state.yPx, vx: state.vxSim * ppmNow, vy: -state.vySim * ppmNow });
          this.trailRenderer.addPoint(state.xPx, state.yPx);
          if (state.firstGroundContact && !this.groundFeedbackShown) {
            this.groundFeedbackShown = true;
            const landing = state.firstGroundContact;
            this.trailRenderer.setLandingMarker(landing.xPx, landing.yPx, 'Landed');
          }

          if (state.hitHat && !state.hitJonh && !this.hatReactionTriggered) {
            this.hatReactionTriggered = true;
            this.activeReactionQuote = this.reactionSelector.selectReaction('hat');
            this.jonhRenderer.triggerHatHit(this.activeReactionQuote, this.flightDir);
            this.playImpactMoment('hat', state.xPx, state.yPx, reduced);
          } else if (state.passedOverhead && !state.hitJonh && !state.hitHat && !this.overheadReactionTriggered && !this.hatReactionTriggered) {
            this.overheadReactionTriggered = true;
            this.activeReactionQuote = this.reactionSelector.selectReaction('overhead');
            this.jonhRenderer.triggerOverhead(this.activeReactionQuote);
          }

          const result = this.attemptMachine.step(PHYSICS.fixedStepSeconds, {
            x: state.xSim,
            y: state.ySim,
            speed: state.speedMs,
            hitBody: state.hitJonh,
            hitHat: state.hitHat,
          });

          if (result.resolved) {
            this.handleResolution(result, state);
            break;
          }
        }
      }
    }

    this.drawBall(reactionSeconds, reduced, replayFrameNow);
    const flying = this.attemptMachine.state === 'simulating' && this.lastProjectileState && !this.impactTimeline.isHolding;
    this.audioManager.setFlightWhoosh(flying ? this.lastProjectileState!.speedMs / 20 : null);
    this.updateCamera(dtSeconds, reduced, replayFrameNow);

    if (this.isDebugEnabled) {
      const speed = this.levelPhys.launchSpeed(this.currentPowerPercent);
      const impulse = this.levelPhys.launchImpulse(this.currentPowerPercent);
      const muzzle = this.cannonRenderer.getMuzzlePosition(this.currentAngleDeg, PROJECTILE.radiusMetres);
      this.debugRenderer.draw(this.currentLevel, {
        angleDeg: this.currentAngleDeg,
        powerPercent: this.currentPowerPercent,
        launchSpeedMs: speed,
        launchImpulseNs: impulse,
        shotState: this.attemptMachine.state,
        simulatedTimeSeconds: this.attemptMachine.simulatedTime,
        projectile: this.lastProjectileState,
        muzzlePosPx: muzzle,
      });
    }
  }

  private handleResolution(result: { resolved: true; outcome: 'hit' | 'miss'; reason?: string; hadHatHit?: boolean }, state: ProjectileState): void {
    for (const obs of state.obstacleContacts) {
      this.classifier.recordContact({ role: 'obstacle', id: obs.id, ricochet: obs.ricochet });
    }
    if (state.hitGround) this.classifier.recordContact({ role: 'ground' });
    if (state.hitHat || result.hadHatHit) this.classifier.recordContact({ role: 'jonhHat' });
    if (state.hitJonh) this.classifier.recordContact({ role: 'jonhBody' });
    if (state.passedOverhead) this.classifier.recordOverhead();

    const classification = this.classifier.classify(true);
    const isBodyHit = classification.isHit;

    const quality = hitQuality(classification.outcome, state.impactSpeedMs, LOOK.strongImpactMs);
    const reducedNow = this.jonhRenderer.isReducedMotionActive();
    const hitProfile = impactProfile(quality, reducedNow);
    if (isBodyHit && this.impactTimeline.bodyImpact(reducedNow, hitProfile)) {
      this.stepper.reset();
      this.playImpactMoment(quality, state.xPx, state.yPx, reducedNow);
      const v = this.prevVelocity ?? { vx: this.flightDir, vy: 0 };
      this.contact = { x: state.xPx, y: state.yPx, dirX: v.vx, dirY: -v.vy, quality, simT: this.attemptMachine.simulatedTime };
      this.startCosmeticBall();
      if (hitProfile.replay && this.replayBuffer.length > 2) this.replayCountdown = FX.replayAfterSeconds;
    }

    if (this.activeMode === 'solo') {
      this.soloCoordinator.resolveShot(isBodyHit, classification.outcome === 'ricochet_body');
    } else if (this.activeMode === 'multi' && !this.online?.inMatch) {
      this.multiCoordinator.resolveShot(classification.outcome);
    }

    const feedback = classifyShotOutcome(
      isBodyHit,
      isBodyHit ? state.xSim : state.firstGroundContact?.xSim ?? state.xSim,
      this.currentLevel.jonhSpawn.bodyBox.minX,
      this.currentLevel.jonhSpawn.bodyBox.maxX,
      { classifiedOutcome: classification.outcome, passedOverhead: state.passedOverhead, obstacleContacts: state.obstacleContacts },
    );

    const quote = isBodyHit
      ? this.reactionSelector.selectReaction(feedback.category)
      : (this.activeReactionQuote ?? this.reactionSelector.selectReaction(feedback.category));

    const landing = !isBodyHit ? state.firstGroundContact : null;
    this.trailRenderer.setLandingMarker(
      landing?.xPx ?? state.xPx,
      landing?.yPx ?? state.yPx,
      // Misses keep the aim label as a learning aid; hits already have the HUD caption.
      isBodyHit ? '' : `${feedback.label} · ${this.currentAngleDeg}° / ${this.currentPowerPercent}%`,
    );
    if (this.activeMode === 'multi' && this.shotShooterIndex !== null) {
      this.trailHistory.record(this.shotShooterIndex, this.trailRenderer.exportData());
    }

    if (isBodyHit) {
      this.jonhRenderer.triggerHit(state.impactSpeedMs, quote,
        quality === 'trick' ? 'trick' : quality === 'strong' ? 'strong' : 'weak', this.flightDir);
      this.htmlControls.setFeedback(`${feedback.label}  +${classification.points}`, 'hit', `Jonh: “${quote}”`);
    } else if (classification.outcome === 'hat_only') {
      if (!this.hatReactionTriggered) this.jonhRenderer.triggerHatHit(quote, this.flightDir);
      this.htmlControls.setFeedback(`${feedback.label}  +${classification.points}`, 'hit', `Jonh: “${quote}”`);
    } else if (feedback.category === 'overhead') {
      if (!this.overheadReactionTriggered) this.jonhRenderer.triggerOverhead(quote);
      this.htmlControls.setFeedback(feedback.label, 'miss', `Jonh: “${quote}”`);
    } else {
      this.jonhRenderer.triggerMiss(feedback.category === 'short' ? 'smug' : feedback.category === 'over' ? 'glare' : 'wince', quote);
      this.htmlControls.setFeedback(feedback.label, 'miss', `Jonh: “${quote}”`);
    }

    this.inputCoordinator.setCanFire(false);
    this.htmlControls.setCanFire(false);
    if (this.online?.inMatch) {
      // Jonh has reacted to the local simulation; score and label wait for the official outcome.
      this.onlineLocal = { outcome: classification.outcome, label: feedback.label, quote, resultSeconds: this.resultWindowSeconds(isBodyHit) };
      this.htmlControls.setFeedback('…', 'info', `Jonh: “${quote}”`);
      this.htmlControls.setResetLabel('Next now ↵');
      this.online.onLocalResolution(classification.outcome);
      return;
    }

    // Retention: hits, streak, three-star maps, daily results and hat unlocks.
    const before = this.progress;
    let after = recordShot(before, classification.outcome, this.activeMode === 'solo');
    if (this.activeMode === 'solo' && this.soloMachine.state === 'solo_result') {
      const res = this.soloMachine.result!;
      if (this.daily) after = recordDaily(after, this.daily.key, res.success ? res.stars : 0);
      else if (res.success) after = recordSoloFinish(after, this.currentLevel.id, res.stars);
    }
    const unlocks = newlyUnlocked(before, after, MAPS.map(m => m.id));
    this.progress = after;
    // Storage writes wait until after the contact frame so the hit-stop starts on time.
    setTimeout(() => saveProgress(after), 0);
    this.pendingUnlocks.push(...unlocks);
    if (this.activeMode === 'solo') this.htmlControls.setStreak(after.currentStreak);
    if (unlocks.length && this.activeMode === 'multi') {
      this.htmlControls.setFeedback(`New hat for Jonh: ${HAT_RULES[unlocks[0]!].name}!`, 'hit');
    }

    if (this.activeMode === 'solo' && this.soloMachine.state === 'solo_result') {
      const res = this.soloMachine.result!;
      const previous = loadSaveData().solo[this.currentLevel.id]?.bestShots ?? null;
      this.soloResultExtras = {
        newBest: !this.daily && res.success && (previous === null || res.shotsUsed < previous),
        quote,
        streak: after.currentStreak,
        unlockHtml: this.unlockHtml(this.pendingUnlocks),
      };
      this.pendingUnlocks = [];
      if (res.success && !this.daily) {
        const [mapId, angle, power] = [this.currentLevel.id, this.currentAngleDeg, this.currentPowerPercent];
        setTimeout(() => recordSoloResult(mapId, res.shotsUsed, res.hasStyle, angle, power), 0);
      }
    }
    
    this.htmlControls.setResetLabel('Next now ↵');
    this.autoAdvance.schedule('shot', this.resultWindowSeconds(isBodyHit));
  }

  /** How long a shot's result stays up; stretched to fit the replay of big hits. */
  private resultWindowSeconds(isBodyHit: boolean): number {
    const replaySeconds = this.replayCountdown !== null ? FX.replayAfterSeconds + this.replayPlan().lead / FX.replaySpeed + this.replayPlan().post : 0;
    return isBodyHit ? Math.max(FLOW.bodyHitResultSeconds, replaySeconds + 0.6) : FLOW.shotResultSeconds;
  }

  /** A rasterized hat as an image URL for HTML menus. */
  private hatImage(id: HatName): string {
    const cached = this.hatImages.get(id);
    if (cached) return cached;
    const source = this.textures.get(`hat-${id}`).getSourceImage() as HTMLCanvasElement;
    const url = typeof source.toDataURL === 'function' ? source.toDataURL() : '';
    this.hatImages.set(id, url);
    return url;
  }

  private unlockHtml(hats: readonly HatName[]): string {
    return [...new Set(hats)].map(id => {
      const card = document.createElement('div');
      card.className = 'unlock-card';
      const img = document.createElement('img');
      img.src = this.hatImage(id);
      img.alt = '';
      const text = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `New hat: ${HAT_RULES[id].name}`;
      text.append(title, document.createTextNode('Put it on Jonh in the hat locker.'));
      card.append(img, text);
      return card.outerHTML;
    }).join('');
  }

  private addHomeExtras(row: HTMLElement, signal: AbortSignal): void {
    const today = dateKey(new Date());
    const done = today in this.progress.daily;
    const daily = document.createElement('button');
    daily.type = 'button';
    daily.className = 'btn';
    daily.textContent = done ? 'Daily Bonk ✓' : 'Daily Bonk';
    daily.addEventListener('click', () => this.showDaily(), { signal });
    const hats = document.createElement('button');
    hats.type = 'button';
    hats.className = 'btn';
    hats.textContent = `Hats ${unlockedHats(this.progress, MAPS.map(m => m.id)).length}/${HAT_ORDER.length}`;
    hats.addEventListener('click', () => this.showLocker(), { signal });
    row.append(daily, hats);
  }

  private showDaily(): void {
    const key = dateKey(new Date());
    const pick = dailyChallenge(key, MAPS);
    if (!pick) return;
    const map = MAPS.find(m => m.id === pick.mapId)!;
    this.menuOverlay.showCustom('daily', (content, signal) => {
      const h = document.createElement('h2');
      h.textContent = 'Daily Bonk';
      const intro = document.createElement('p');
      intro.textContent = `${key} · ${map.name}. Jonh has picked a new spot today. Three shots. Your first run of the day counts.`;
      const art = document.createElement('div');
      art.className = 'map-btn';
      art.style.maxWidth = '360px';
      art.style.margin = '0 auto';
      art.style.padding = '0';
      art.innerHTML = mapPreview(map.id);
      const status = document.createElement('p');
      const result = this.progress.daily[key];
      const streak = dailyStreak(this.progress, new Date());
      status.className = 'quote';
      status.textContent = result === undefined
        ? (streak > 0 ? `Daily streak: ${streak} day${streak === 1 ? '' : 's'}. Keep it going!` : 'Not played yet today.')
        : `Today: ${result > 0 ? '★'.repeat(result) + '☆'.repeat(3 - result) : 'missed'} · Streak ${streak} day${streak === 1 ? '' : 's'}. Replays are just for fun.`;
      const actions = document.createElement('div');
      actions.className = 'result-actions';
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'btn btn-primary';
      play.textContent = result === undefined ? 'Play today' : 'Play again';
      play.addEventListener('click', () => {
        this.menuOverlay.hide();
        this.loadMap(pick.mapId, { key, positionId: pick.positionId });
      }, { signal });
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'btn';
      back.textContent = 'Back';
      back.addEventListener('click', () => this.menuOverlay.showHome(), { signal });
      actions.append(play, back);
      content.append(h, intro, art, status, actions);
      play.focus();
    });
  }

  private showLocker(): void {
    const mapIds = MAPS.map(m => m.id);
    this.menuOverlay.showCustom('locker', (content, signal) => {
      const h = document.createElement('h2');
      h.textContent = "Jonh's hats";
      const intro = document.createElement('p');
      intro.textContent = 'Earn hats by ruining his afternoon in new ways. Pick one; he will wear it everywhere.';
      const grid = document.createElement('div');
      grid.className = 'hat-grid';
      const unlocked = new Set(unlockedHats(this.progress, mapIds));
      for (const id of HAT_ORDER) {
        const rule = HAT_RULES[id];
        const open = unlocked.has(id);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `hat-card${open ? '' : ' locked'}${this.progress.selectedHat === id ? ' selected' : ''}`;
        card.disabled = !open;
        card.setAttribute('aria-pressed', String(this.progress.selectedHat === id));
        const img = document.createElement('img');
        img.src = this.hatImage(id);
        img.alt = '';
        const name = document.createElement('span');
        name.textContent = open ? rule.name : 'Locked';
        const hint = document.createElement('small');
        hint.textContent = rule.hint;
        card.append(img, name, hint);
        card.addEventListener('click', () => {
          this.progress = { ...this.progress, selectedHat: id };
          saveProgress(this.progress);
          this.attract?.jonh.setHat(id);
          this.showLocker();
        }, { signal });
        grid.appendChild(card);
      }
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'btn';
      back.textContent = 'Back';
      back.addEventListener('click', () => this.menuOverlay.showHome(), { signal });
      const stats = document.createElement('p');
      stats.className = 'home-note';
      stats.textContent = `Hits: ${this.progress.totalHits} · Best streak: ${this.progress.bestStreak} · Three-star gardens: ${this.progress.threeStarMaps.length}/${mapIds.length}`;
      content.append(h, intro, grid, stats, back);
      (grid.querySelector('button:not(:disabled)') as HTMLElement | null)?.focus();
    });
  }

  private replayPlan() {
    const contactT = this.contact?.simT ?? 0;
    const lead = Math.min(FX.replayLeadSeconds, Math.max(0, contactT - (this.replayBuffer.startTime ?? contactT)));
    return { contactT, lead, speed: FX.replaySpeed, post: 1.0, postSpeed: 0.55 };
  }

  /** Counts down to the replay, then plays it. Returns this frame's replay state (or null). */
  private advanceReplay(realDt: number, reduced: boolean): ReplayFrame | null {
    if (reduced) { if (this.replay || this.replayCountdown !== null) this.stopReplay(); return null; }
    if (this.replayCountdown !== null) {
      this.replayCountdown -= realDt;
      if (this.replayCountdown > 0) return null;
      this.replayCountdown = null;
      this.replay = new ReplayDirector(this.replayPlan());
      this.replayOverlay.show();
      this.jonhRenderer.beginReplay();
      this.effects.reset();
      this.ballRenderer.setVisible(false);
      return this.replay.advance(0);
    }
    if (!this.replay) return null;
    const frame = this.replay.advance(realDt);
    if (frame.contact && this.contact) {
      this.jonhRenderer.replayContact();
      const c = this.contact;
      const profile = impactProfile(c.quality, false);
      const word = profile.words.length ? profile.words[Math.floor(Math.random() * profile.words.length)]! : null;
      this.effects.impact(c.x, c.y, profile, c.dirX, c.dirY, false, word);
      this.cameraRig.impact(profile.shakePx * 0.8, profile.shakeSeconds, FX.shakeHz, c.dirX, c.dirY, profile.zoomPunch, FX.punchSeconds);
      this.ballRenderer.squash(Math.atan2(c.dirY, c.dirX), 1);
      this.audioManager.playHit(c.quality);
      this.startCosmeticBall();
    }
    if (frame.phase === 'done') { this.stopReplay(); return null; }
    return frame;
  }

  private stopReplay(): void {
    this.replay = null;
    this.replayCountdown = null;
    this.replayOverlay?.hide();
    this.jonhRenderer?.settleImpact();
  }

  private replayAlarm(frame: ReplayFrame): number {
    const s = this.replayBuffer.sampleAt(frame.simT);
    if (!s) return 0;
    const jonh = this.jonhRenderer.position;
    const d = Math.hypot(jonh.x - s.x, (jonh.y - 50) - s.y);
    return clamp01(1 - (d - 50) / 170);
  }

  private startCosmeticBall(): void {
    const c = this.contact;
    if (!c) return;
    const dir = Math.sign(c.dirX) || 1;
    this.cosmeticBall = { x: c.x, y: c.y, vx: -dir * 95, vy: -210 };
  }

  /** Nearest surface top at or below (x, y) in world pixels: ground or an obstacle roof. */
  private floorAt(x: number, y: number): number {
    const ppm = WORLD.pixelsPerMetre;
    const h = WORLD.designHeightPx;
    let floor = simYToWorldY(this.currentLevel.ground.maxY, h, ppm);
    for (const o of this.currentLevel.obstacles) {
      const top = simYToWorldY(o.box.maxY, h, ppm);
      if (x >= o.box.minX * ppm && x <= o.box.maxX * ppm && top >= y - 2 && top < floor) floor = top;
    }
    return floor;
  }

  private drawBall(dt: number, reduced: boolean, frame: ReplayFrame | null): void {
    const ppm = WORLD.pixelsPerMetre;
    const maxSpeed = this.levelPhys.maxSpeedMs * ppm;
    if (frame?.phase === 'pre') {
      const s = this.replayBuffer.sampleAt(frame.simT);
      if (s) this.ballRenderer.draw(s.x, s.y, s.vx, s.vy, dt, reduced, maxSpeed);
      return;
    }
    const b = this.cosmeticBall;
    if (b && this.attemptMachine.state === 'resolved') {
      const r = PROJECTILE.radiusMetres * ppm;
      b.vy += this.levelPhys.gravity * ppm * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const floor = this.floorAt(b.x, b.y - b.vy * dt) - r;
      if (b.y > floor) {
        b.y = floor;
        b.vy = Math.abs(b.vy) > 60 ? -Math.abs(b.vy) * 0.42 : 0;
        b.vx *= 0.75;
      }
      this.ballRenderer.draw(b.x, b.y, b.vx, b.vy, dt, reduced, maxSpeed);
      return;
    }
    if (this.lastProjectileState && this.attemptMachine.state !== 'aiming') {
      const p = this.lastProjectileState;
      this.ballRenderer.draw(p.xPx, p.yPx, p.vxSim * ppm, -p.vySim * ppm, dt, reduced, maxSpeed);
    }
  }

  /**
   * Every layer of the impact fires on this same frame: hit-stop (already started on the
   * timeline), flash, contact star, burst, comic word, camera punch/shake, ball squash and
   * layered sound. Intensity follows hit quality.
   */
  private playImpactMoment(quality: HitQuality, x: number, y: number, reduced: boolean): void {
    const profile = impactProfile(quality, reduced);
    this.impactQuality = quality;
    if (quality === 'hat') this.impactTimeline.pulse(profile, reduced);
    const v = this.prevVelocity ?? { vx: this.flightDir, vy: 0 };
    const dirX = v.vx;
    const dirY = -v.vy;
    const word = profile.words.length ? profile.words[Math.floor(Math.random() * profile.words.length)]! : null;
    this.effects.impact(x, y, profile, dirX, dirY, reduced, word);
    this.cameraRig.impact(profile.shakePx, profile.shakeSeconds, FX.shakeHz, dirX, dirY, profile.zoomPunch, FX.punchSeconds);
    this.ballRenderer.squash(Math.atan2(dirY, dirX), Math.min(1, profile.intensity));
    if (quality === 'hat') this.audioManager.playHatHit();
    else this.audioManager.playHit(quality);
  }

  /** Cosmetic bounce detection: an abrupt velocity change means the ball struck something. */
  private detectBounce(state: ProjectileState, reduced: boolean): void {
    const prev = this.prevVelocity;
    this.prevVelocity = { vx: state.vxSim, vy: state.vySim };
    if (!prev || state.hitJonh) return;
    const dvx = state.vxSim - prev.vx;
    const dvy = state.vySim - prev.vy + this.levelPhys.gravity * PHYSICS.fixedStepSeconds;
    const dv = Math.hypot(dvx, dvy);
    if (dv < 1.2) return;
    const surface = this.surfaceAt(state.xSim, state.ySim);
    this.audioManager.playSurface(surface, dv / 14);
    this.effects.dust(state.xPx, state.yPx + PROJECTILE.radiusMetres * WORLD.pixelsPerMetre, clamp01(dv / 10) + 0.3, reduced,
      surface === 'wood' ? 'fx-chip' : surface === 'ground' ? 'fx-leaf' : 'fx-dust');
    if (surface !== 'ground' && dv > 4) this.cameraRig.impact(4 * clamp01(dv / 12), 0.18, FX.shakeHz, -prev.vx, prev.vy, 0, 0);
  }

  private surfaceAt(x: number, y: number): SurfaceSound {
    const r = PROJECTILE.radiusMetres + 0.15;
    for (const o of this.currentLevel.obstacles) {
      const b = o.box;
      if (x >= b.minX - r && x <= b.maxX + r && y >= b.minY - r && y <= b.maxY + r) {
        return SURFACE_SOUNDS[o.material] ?? 'concrete';
      }
    }
    return 'ground';
  }

  /** 0..1: how imminent the incoming ball is (Jonh notices and flinches). Cosmetic only. */
  private incomingAlarm(): number {
    const p = this.lastProjectileState;
    if (!p || this.attemptMachine.state !== 'simulating' || this.jonhRenderer.mode !== 'idle') return 0;
    const jonh = this.jonhRenderer.position;
    const dx = jonh.x - p.xPx;
    if (Math.sign(dx) !== Math.sign(p.vxSim) && Math.abs(dx) > 20) return 0;
    const d = Math.hypot(dx, (jonh.y - 50) - p.yPx);
    return clamp01(1 - (d - 50) / 170);
  }

  private releaseLaunch(): void {
    const launch = this.pendingLaunch;
    this.pendingLaunch = null;
    if (!launch) return;
    this.effects.launch(launch.x, launch.y, launch.angleRad, this.jonhRenderer.isReducedMotionActive());
    this.audioManager.playCannonFire();
  }

  private updateCamera(realDt: number, reduced: boolean, frame: ReplayFrame | null): void {
    const view = this.view;
    const jonh = this.jonhRenderer.position;
    const p = this.lastProjectileState;
    let target: Frame = aimFrame(view);
    let rate = 3.5;
    const sample = frame?.phase === 'pre' ? this.replayBuffer.sampleAt(frame.simT) : null;
    if (sample) {
      target = replayFrame({ x: sample.x, y: sample.y }, view, 2.1);
      rate = 7;
    } else if (frame) {
      target = impactFrame({ x: jonh.x, y: jonh.y }, this.flightDir, view, 1.9);
      rate = 9;
    } else if (this.jonhRenderer.isHit || (this.impactQuality !== null && this.impactQuality !== 'hat' && this.impactTimeline.age !== null)) {
      target = impactFrame({ x: jonh.x, y: jonh.y }, this.flightDir, view, FX.impactZoom);
      rate = 9;
    } else if (p && this.attemptMachine.state !== 'aiming') {
      target = flightFrame({ x: p.xPx, y: p.yPx }, { x: jonh.x, y: jonh.y }, view, 1.15, FX.flightZoomMin);
      rate = this.attemptMachine.state === 'simulating' ? FX.followRate : 2.5;
    }
    this.cameraRig.update(realDt, target, rate, reduced);
  }

  private resetEffects(): void {
    this.audioManager?.setFlightWhoosh(null);
    this.impactTimeline.reset();
    this.replay = null;
    this.replayCountdown = null;
    this.replayOverlay?.hide();
    this.cosmeticBall = null;
    this.pendingLaunch = null;
    this.impactQuality = null;
    this.effects?.reset();
    this.cameraRig?.reset();
    this.cannonRenderer?.setRecoil(0, this.currentAngleDeg);
    this.jonhRenderer?.settleImpact();
    if (this.lastProjectileState && this.ballRenderer) {
      this.ballRenderer.draw(this.lastProjectileState.xPx, this.lastProjectileState.yPx);
    }
  }

  private cleanup(): void {
    this.online?.destroy();
    this.autoAdvance.cancel();
    this.resetEffects();
    this.canvasAim.destroy();
    for (const h of this.cleanupHandlers) h();
    this.cleanupHandlers = [];

    this.audioManager.destroy();
    this.effects.destroy();
    this.replayOverlay.destroy();
    this.physicsAdapter.clear();
    this.htmlControls.destroy();
    this.menuOverlay.destroy();
    if (this.sceneryRenderer) this.sceneryRenderer.destroy();
    if (this.cannonRenderer) this.cannonRenderer.destroy();
    if (this.slotsRenderer) this.slotsRenderer.destroy();
    this.slotsRenderer = null;
    if (this.jonhRenderer) this.jonhRenderer.destroy();
    if (this.ballRenderer) this.ballRenderer.destroy();
    if (this.trailRenderer) this.trailRenderer.destroy();
    if (this.debugRenderer) this.debugRenderer.destroy();
  }

  private startMultiplayer(players: MPPlayerSetup[], maps: string[]): void {
    this.beginMatch(new MultiplayerMatchMachine(players, maps));
  }

  /** Shows a match from its machine: a fresh hot-seat match, or an online match fast-forwarded by replayMatch. */
  private beginMatch(machine: MultiplayerMatchMachine): void {
    this.hideAttract();
    this.activeMode = 'multi';
    this.multiMachine = machine;
    this.trailHistory.clear();
    this.loadMultiplayerMap(machine.currentMapId);
    this.updateUIPerMultiState();
  }

  /** Draws the cannon in the active player's colour and pattern (solo keeps the default look). */
  private drawCannon(): void {
    if (this.activeMode === 'multi') {
      const player = this.multiMachine.state === 'result' && this.shotShooterIndex !== null
        ? this.multiMachine.players[this.shotShooterIndex]!
        : this.multiMachine.activePlayer;
      this.cannonRenderer.draw(this.currentAngleDeg, player.color, player.pattern);
    } else {
      this.cannonRenderer.draw(this.currentAngleDeg, null);
    }
  }

  private loadMultiplayerMap(mapId: string): void {
    this.autoAdvance.cancel();
    this.resetEffects();
    const level = MAPS.find(m => m.id === mapId);
    if (!level) return;
    this.currentLevel = levelAtMultiplayerPosition(level, this.multiMachine.activePositionId);
    this.multiplayerPositionKey = `${mapId}:${this.multiMachine.activePositionId}`;

    const { designWidthPx: w, designHeightPx: h, pixelsPerMetre: ppm } = WORLD;

    // Clean up old renderers
    if (this.sceneryRenderer) this.sceneryRenderer.destroy();
    if (this.cannonRenderer) this.cannonRenderer.destroy();
    if (this.slotsRenderer) this.slotsRenderer.destroy();
    this.slotsRenderer = null;
    if (this.jonhRenderer) this.jonhRenderer.destroy();
    if (this.ballRenderer) this.ballRenderer.destroy();
    if (this.trailRenderer) this.trailRenderer.destroy();
    if (this.debugRenderer) this.debugRenderer.destroy();

    // Reset physics
    this.physicsAdapter.clear();
    this.loadPhysics();

    // Initialize state machines
    this.attemptMachine = new ShotAttemptMachine(
      this.currentLevel.bounds.maxX,
      SHOT.settledSpeedMs,
      SHOT.settledSeconds,
      SHOT.timeoutSeconds,
      SHOT.boundsMarginMetres,
    );
    
    this.multiCoordinator = new MultiCoordinator(this.attemptMachine, this.multiMachine, {
      onStateChange: () => this.updateUIPerMultiState(),
      onShotFired: (angle, power) => {
        // The machine already stored this aim at Fire; persist the whole setup from a fresh read.
        // Online seats must never overwrite the saved hot-seat roster.
        if (!this.online?.inMatch) saveMultiplayerSetup(this.multiMachine.setups);
        
        const muzzle = this.cannonRenderer.getMuzzlePosition(angle, PROJECTILE.radiusMetres);
        const speed = this.levelPhys.launchSpeed(power);
        const vWorld = launchVelocityToWorld(speed, angle, WORLD.pixelsPerMetre);
        const radiusPx = metresToPixels(PROJECTILE.radiusMetres, WORLD.pixelsPerMetre);

        this.physicsAdapter.spawnProjectile(muzzle.x, muzzle.y, radiusPx, vWorld);
        this.ballRenderer.draw(muzzle.x, muzzle.y);
      }
    });

    // Renderers
    this.sceneryRenderer = new SceneryRenderer(this, ppm, h, w);
    this.sceneryRenderer.draw(this.currentLevel);

    this.cannonRenderer = new CannonRenderer(this, this.currentLevel.cannonSpawn, ppm, h, this.levelPhys);
    this.cannonRenderer.setUiScale(1 / (this.view.zoom ?? 1));
    this.slotsRenderer = new CannonSlotsRenderer(this);
    this.jonhRenderer = new JonhRenderer(this, this.currentLevel.jonhSpawn, ppm, h, { level: this.currentLevel, hatId: this.progress.selectedHat });
    this.jonhRenderer.setUiScale(1 / (this.view.zoom ?? 1));
    this.jonhRenderer.draw(false);
    const data = loadSaveData();
    this.jonhRenderer.setReducedMotion(data.settings.reducedMotion);
    if (this.currentLevel.arrivalLine) this.jonhRenderer.triggerArrival(this.currentLevel.arrivalLine);

    const radiusPx = metresToPixels(PROJECTILE.radiusMetres, ppm);
    this.ballRenderer = new BallRenderer(this, radiusPx);
    this.trailRenderer = new TrailRenderer(this);
    this.trailRenderer.setView(this.view);
    this.debugRenderer = new DebugRenderer(this, ppm, h);
    if (this.isDebugEnabled) this.debugRenderer.setVisible(true);

    this.htmlControls.setVisible(true);
    this.inputCoordinator.setOverlayVisible(false);

    // Nothing from the previous map may leak into this one.
    this.stepper.reset();
    this.classifier.reset();
    this.lastProjectileState = null;
    this.groundFeedbackShown = false;
    this.hatReactionTriggered = false;
    this.overheadReactionTriggered = false;
    this.activeReactionQuote = null;
    this.shotShooterIndex = null;
    this.inputCoordinator.setCanFire(false);
    this.htmlControls.setCanFire(false);

    this.drawCannon();
  }

  private updateUIPerMultiState(): void {
    const match = this.multiMachine;
    if (match.state === 'handover') this.applyMultiplayerPosition();
    this.htmlControls.setMatchStatus(`${this.currentLevel.name} · Round ${Math.min(match.roundIndex + 1, match.roundCount)}/${match.roundCount} · Cycle ${match.activeCycleIndex + 1}/${MULTIPLAYER.shotsPerRound}`,
      match.players, match.state === 'result' ? match.lastShooterIndex : match.activePlayerIndex);
    if (match.state === 'handover') {
      const player = match.activePlayer;
      this.currentAngleDeg = player.lastAngle;
      this.currentPowerPercent = player.lastPower;
      
      this.drawCannon();
      this.slotsRenderer?.draw(match.players, match.activePlayerIndex, this.view.zoom ?? 1);
      // Only this player's own previous trail, in their colour.
      this.trailRenderer.setPlayerColor(player.color);
      const history = this.trailHistory.get(match.activePlayerIndex);
      this.trailRenderer.importData(history ? asPreviousTrail(history) : null);
      this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
      
      this.htmlControls.setControlsInert(true);
      const headline = this.online?.inMatch
        ? (match.activePlayerIndex === this.online.mySeat ? 'Your turn!' : `${player.name} is up`)
        : undefined;
      this.menuOverlay.showMPHandover(player, this.currentLevel.name, match.activePlayerShotNumber + 1, headline);
      this.autoAdvance.schedule('handover', FLOW.handoverSeconds);
      this.htmlControls.setCanFire(false);
      this.htmlControls.setFeedback('', 'info');
      this.htmlControls.setResetLabel('Continue ↵');
    } else if (match.state === 'aiming') {
      // Hot-seat: canAct is always true, so this is the plain live panel. Online, on someone else's turn, the panel
      // stays live so Mute and Pause work (touch has no Escape/M); Fire, the sliders and Reset stay disabled.
      const canAct = this.canUserAct();
      this.htmlControls.setControlsInert(false);
      this.inputCoordinator.setCanFire(canAct);
      this.htmlControls.setCanFire(canAct);
      this.htmlControls.setResetEnabled(canAct);
      this.htmlControls.setResetLabel('Aim again ↵');
      const movement = match.activeCycleIndex > 0 ? ' · Jonh has moved—adjust your aim' : '';
      const status = this.online?.inMatch && match.activePlayerIndex !== this.online.mySeat
        ? `${match.activePlayer.name} is aiming…`
        : `${match.activePlayer.name}'s turn · Cycle ${match.activeCycleIndex + 1}/${MULTIPLAYER.shotsPerRound}${movement}`;
      this.htmlControls.setFeedback(status, 'info');
    } else if (match.state === 'round_result') {
      this.htmlControls.setControlsInert(true);
      this.menuOverlay.showMPRoundResult(match.players, match.roundIndex, match.roundCount);
      this.autoAdvance.schedule('round', FLOW.roundResultSeconds);
      this.htmlControls.setCanFire(false);
      this.htmlControls.setFeedback('', 'info');
      this.htmlControls.setResetLabel('Continue ↵');
    } else if (match.state === 'match_result') {
      this.htmlControls.setControlsInert(true);
      this.menuOverlay.showMPMatchResult(match.getWinners(), match.players, this.online?.inMatch ? this.online.resultExtras() : undefined);
      this.htmlControls.setCanFire(false);
      this.htmlControls.setFeedback('', 'info');
      this.htmlControls.setResetLabel('Continue ↵');
    }
  }

  /** Colliders, gravity and cannon speed range for `currentLevel`. */
  private loadPhysics(): void {
    this.physicsAdapter.setupLevel(this.currentLevel);
    this.levelPhys = levelPhysics(this.currentLevel);
    this.matter.world.setGravity(0, matterGravityY(this.levelPhys.gravity, WORLD.pixelsPerMetre, PHYSICS.matterGravityScale), PHYSICS.matterGravityScale);
    this.htmlControls.setLaunchSpeed(this.levelPhys.launchSpeed);
    const view = levelView(this.currentLevel.bounds.maxX * WORLD.pixelsPerMetre, { width: WORLD.designWidthPx, height: WORLD.designHeightPx });
    if (view.width !== this.view.width) {
      this.view = view;
      this.cameraRig.setView(view);
    }
    this.trailRenderer?.setView(this.view);
  }

  /** Called only at handover; results and live shots retain their original colliders. */
  private applyMultiplayerPosition(): void {
    const match = this.multiMachine;
    const key = `${match.currentMapId}:${match.activePositionId}`;
    if (key === this.multiplayerPositionKey) return;
    const base = MAPS.find(level => level.id === match.currentMapId)!;
    this.currentLevel = levelAtMultiplayerPosition(base, match.activePositionId);
    this.multiplayerPositionKey = key;
    this.physicsAdapter.clear();
    this.loadPhysics();
    this.stepper.reset();
    this.classifier.reset();
    this.lastProjectileState = null;
    this.ballRenderer.setVisible(false);
    this.sceneryRenderer.draw(this.currentLevel);
    this.jonhRenderer.destroy();
    this.jonhRenderer = new JonhRenderer(this, this.currentLevel.jonhSpawn,
      WORLD.pixelsPerMetre, WORLD.designHeightPx, { level: this.currentLevel, hatId: this.progress.selectedHat });
    this.jonhRenderer.setUiScale(1 / (this.view.zoom ?? 1));
    this.jonhRenderer.setReducedMotion(loadSaveData().settings.reducedMotion);
    this.jonhRenderer.draw(false);
  }

  private beginMultiplayerTurn(): void {
    if (this.activeMode !== 'multi' || this.multiMachine.state !== 'handover') return;
    this.autoAdvance.cancel();
    this.resetEffects();
    this.menuOverlay.hide();
    this.inputCoordinator.setOverlayVisible(false);
    this.multiCoordinator.beginTurn(this.currentAngleDeg, this.currentPowerPercent);
  }

  private nextMultiplayerRound(): void {
    if (this.activeMode !== 'multi' || this.multiMachine.state !== 'round_result') return;
    this.autoAdvance.cancel();
    this.resetEffects();
    this.menuOverlay.hide();
    this.inputCoordinator.setOverlayVisible(false);
    this.multiMachine.nextRound();
    if (!this.multiMachine.isMatchComplete) {
      this.trailHistory.clear();
      this.loadMultiplayerMap(this.multiMachine.currentMapId);
    }
    this.updateUIPerMultiState();
  }

  private onlineHooks(): OnlineSceneHooks {
    return {
      showOnlineMatch: machine => {
        // A (re)built match replaces whatever was on screen, including a pause.
        if (this.sessionCoordinator.isPaused) this.sessionCoordinator.resume();
        this.menuOverlay.hide();
        this.inputCoordinator.setOverlayVisible(false);
        this.autoAdvance.cancel();
        this.pendingLaunch = null;
        this.onlineLocal = null;
        this.beginMatch(machine);
      },
      presentation: () => ({
        state: this.multiMachine?.state ?? 'handover',
        activeSeat: this.multiMachine?.activePlayerIndex ?? 0,
        ready: this.activeMode === 'multi' && !this.sessionCoordinator.isPaused && !this.menuOverlay.isVisible() &&
          this.attemptMachine?.state === 'aiming' && this.pendingLaunch === null,
        shotInFlight: this.attemptMachine?.state === 'simulating' || this.pendingLaunch !== null,
      }),
      playShot: (angle, power) => this.playOnlineShot(angle, power),
      presentSkippedTurn: (seat, angle, power, text) => this.presentSkippedTurn(seat, angle, power, text),
      applyOfficialOutcome: (outcome, mine) => this.applyOfficialOutcome(outcome, mine),
      refreshMatchResult: () => {
        if (this.activeMode === 'multi' && this.multiMachine.state === 'match_result') this.updateUIPerMultiState();
      },
      refreshAimingControls: () => {
        // While paused the controls stay inert; onResume re-applies them with the current turn.
        if (this.activeMode === 'multi' && this.multiMachine.state === 'aiming' && !this.sessionCoordinator.isPaused) this.updateUIPerMultiState();
      },
      leaveToMenu: () => {
        // Server-driven exits can land mid-pause; quit() clears the pause, then tears down via performQuit.
        if (this.sessionCoordinator.isPaused) this.sessionCoordinator.quit();
        else this.teardownGameplay();
      },
    };
  }

  /** Fires someone else's (or my recovered) shot with its recorded aim; input stays locked. */
  private playOnlineShot(angle: number, power: number): void {
    this.currentAngleDeg = angle;
    this.currentPowerPercent = power;
    this.attemptMachine.setAim(angle, power);
    this.htmlControls.setValues(angle, power);
    this.drawCannon();
    this.fire('remote');
  }

  /** A server-skipped turn: nothing is fired; the match records a miss and moves on. */
  private presentSkippedTurn(seat: number, angle: number, power: number, text: string): void {
    this.canvasAim.cancel();
    this.autoAdvance.cancel();
    if (!this.multiMachine.fire(angle, power)) return;
    this.multiMachine.resolveShot('miss');
    this.shotShooterIndex = seat;
    this.inputCoordinator.setCanFire(false);
    this.htmlControls.setCanFire(false);
    this.updateUIPerMultiState();
    this.htmlControls.setFeedback(text, 'miss');
    this.htmlControls.setResetLabel('Next now ↵');
    this.autoAdvance.schedule('shot', FLOW.shotResultSeconds);
  }

  /** Scores and labels the current online shot with the server's outcome. */
  private applyOfficialOutcome(outcome: ClassifiedOutcome, mine: boolean): void {
    if (!this.multiCoordinator.resolveShot(outcome)) return;
    const local = this.onlineLocal;
    this.onlineLocal = null;
    const label = local && local.outcome === outcome ? local.label : OFFICIAL_LABELS[outcome];
    const scored = outcome !== 'miss';
    this.htmlControls.setFeedback(scored ? `${label}  +${OUTCOME_POINTS[outcome]}` : label, scored ? 'hit' : 'miss',
      local ? `Jonh: “${local.quote}”` : '');
    if (mine) this.recordOnlineProgress(outcome);
    this.htmlControls.setResetLabel('Next now ↵');
    this.autoAdvance.schedule('shot', local?.resultSeconds ?? FLOW.shotResultSeconds);
  }

  /** Hats and streaks count only this player's own online shots. */
  private recordOnlineProgress(outcome: ClassifiedOutcome): void {
    const before = this.progress;
    const after = recordShot(before, outcome, false);
    const unlocks = newlyUnlocked(before, after, MAPS.map(m => m.id));
    this.progress = after;
    setTimeout(() => saveProgress(after), 0);
    if (unlocks.length) this.htmlControls.setFeedback(`New hat for Jonh: ${HAT_RULES[unlocks[0]!].name}!`, 'hit');
  }

}




