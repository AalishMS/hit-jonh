import Phaser from 'phaser';
import { AudioManager } from '../audio/audioManager';
import { AIM, FLOW, MULTIPLAYER, PHYSICS, PROJECTILE, SHOT, WORLD } from '../config/tuning';
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
import { MultiplayerMatchMachine, type MPPlayerSetup } from '../rules/multiplayerMatch';
import { MultiCoordinator } from '../rules/multiCoordinator';
import { ShotClassifier } from '../sim/classification';
import { FixedStepper } from '../sim/fixedStep';
import {
  launchVelocityToWorld,
  metresToPixels,
  MS_PER_SECOND,
  powerToLaunchSpeed,
} from '../sim/units';
import { HTMLControls } from '../ui/htmlControls';
import { MenuOverlay } from '../ui/menuOverlay';
import { loadSaveData, recordSoloResult, saveMultiplayerSetup, saveSettings, saveSoloAim } from '../storage/storage';
import type { LevelData } from '../levels/types';

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
  private canvasAim!: CanvasAim;
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
  private sceneryRenderer!: SceneryRenderer;
  private cannonRenderer!: CannonRenderer;
  private slotsRenderer: CannonSlotsRenderer | null = null;
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

    this.audioManager = new AudioManager();
    this.effects = new ShotEffectsRenderer(this);

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
        this.menuOverlay.showPauseMenu();
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
      this.audioManager.isMuted,
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
        this.htmlControls.setMuted(settings.muted);
        if (this.jonhRenderer) this.jonhRenderer.setReducedMotion(settings.reducedMotion);
      }
    });

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

    this.canvasAim = new CanvasAim(this.game.canvas,
      () => this.activeMode !== 'none' && !this.sessionCoordinator.isPaused &&
        !this.menuOverlay.isVisible() && this.activeCoordinator.canAdjustAim(),
      () => this.currentAngleDeg, (angle) => this.setAngle(angle));

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
    this.htmlControls.setFeedback('Jonh is reading. Set your angle and power.', 'info');
    this.menuOverlay.showHome();
  }


  private loadMap(mapId: string): void {
    this.autoAdvance.cancel();
    this.resetEffects();
    this.activeMode = 'solo';
    const level = MAPS.find(m => m.id === mapId);
    if (!level) return;
    this.currentLevel = level;

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
    this.physicsAdapter.setupLevel(this.currentLevel);

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
        saveSoloAim(this.soloMachine.mapId, angle, power);
        
        const muzzle = this.cannonRenderer.getMuzzlePosition(angle, PROJECTILE.radiusMetres);
        const speed = powerToLaunchSpeed(power, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg);
        const vWorld = launchVelocityToWorld(speed, angle, WORLD.pixelsPerMetre);
        const radiusPx = metresToPixels(PROJECTILE.radiusMetres, WORLD.pixelsPerMetre);

        this.physicsAdapter.spawnProjectile(muzzle.x, muzzle.y, radiusPx, vWorld);
        this.ballRenderer.draw(muzzle.x, muzzle.y);
      },
      onShowResult: (res) => {
        this.inputCoordinator.setOverlayVisible(true);
        this.htmlControls.setControlsInert(true);
        this.menuOverlay.showSoloResult(res.success, res.shotsUsed, res.stars, res.hasStyle);
        this.htmlControls.setCanFire(false);
        this.htmlControls.setFeedback('', 'info');
        this.htmlControls.setResetLabel('Continue ↵');
      }
    });

    // Renderers
    this.sceneryRenderer = new SceneryRenderer(this, ppm, h, w);
    this.sceneryRenderer.draw(this.currentLevel);

    this.cannonRenderer = new CannonRenderer(this, this.currentLevel.cannonSpawn, ppm, h);
    this.jonhRenderer = new JonhRenderer(this, this.currentLevel.jonhSpawn, ppm, h);
    this.jonhRenderer.draw(false);

    const radiusPx = metresToPixels(PROJECTILE.radiusMetres, ppm);
    this.ballRenderer = new BallRenderer(this, radiusPx);
    this.trailRenderer = new TrailRenderer(this);
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
    const res = this.activeCoordinator.adjustAim(this.currentAngleDeg, this.currentPowerPercent, angle - this.currentAngleDeg, 0);
    if (res) {
      this.currentAngleDeg = res.angle;
      this.drawCannon();
      this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
    }
  }

  private setPower(power: number): void {
    if (this.activeMode === 'none' || this.sessionCoordinator?.isPaused || this.menuOverlay.isVisible() || !this.activeCoordinator) return;
    const res = this.activeCoordinator.adjustAim(this.currentAngleDeg, this.currentPowerPercent, 0, power - this.currentPowerPercent);
    if (res) {
      this.currentPowerPercent = res.power;
      this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
    }
  }

  private fire(): void {
    if (this.activeMode === 'none' || this.sessionCoordinator?.isPaused || this.menuOverlay.isVisible() || !this.activeCoordinator || !this.activeCoordinator.canFire()) return;

    this.canvasAim.cancel();
    this.autoAdvance.cancel();
    this.resetEffects();
    this.outOfCanvasSoundPlayed = false;
    this.audioManager.unlock();
    this.audioManager.playCannonFire();

    this.classifier.reset();
    this.inputCoordinator.setCanFire(false);
    this.htmlControls.setCanFire(false);
    
    this.activeCoordinator.fire(this.currentAngleDeg, this.currentPowerPercent);
    const muzzle = this.cannonRenderer.getMuzzlePosition(this.currentAngleDeg, PROJECTILE.radiusMetres);
    this.effects.launch(muzzle.x, muzzle.y, this.jonhRenderer.isReducedMotionActive());

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
    this.autoAdvance.cancel();
    this.resetEffects();
    this.activeCoordinator.reset(this.currentAngleDeg, this.currentPowerPercent);

    if (this.activeMode === 'solo' && this.soloMachine.state === 'solo_result') return;
    if (this.activeMode === 'multi' && (this.multiMachine.state === 'round_result' || this.multiMachine.state === 'match_result')) return;

    this.audioManager.unlock();
    this.physicsAdapter.clear();
    this.physicsAdapter.setupLevel(this.currentLevel);
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
      this.htmlControls.setMatchStatus(this.currentLevel.name, []);
      this.htmlControls.setFeedback(`Map: ${this.currentLevel.name}. ${this.soloMachine.attemptsLeft} attempt${this.soloMachine.attemptsLeft === 1 ? '' : 's'} left.`, 'info');
    }
  }

  override update(_time: number, deltaMs: number): void {
    if (this.sessionCoordinator?.isPaused || this.activeMode === 'none' || !this.currentLevel || !this.attemptMachine) return;
    if (this.skipPresentationFrame) { this.skipPresentationFrame = false; return; }
    const dtSeconds = Math.max(0, Math.min(FLOW.maxFrameSeconds, deltaMs / MS_PER_SECOND));
    const reduced = this.jonhRenderer.isReducedMotionActive();
    const reactionSeconds = this.impactTimeline.advance(dtSeconds, false, reduced);
    const recoil = this.effects.update(dtSeconds, reduced);
    this.cannonRenderer.setRecoil(recoil, this.currentAngleDeg);
    this.drawCannon();

    const advance = this.autoAdvance.advance(dtSeconds);
    if (advance === 'shot') { this.reset(); return; }
    if (advance === 'handover') { this.beginMultiplayerTurn(); return; }
    if (advance === 'round') { this.nextMultiplayerRound(); return; }

    this.jonhRenderer.update(reactionSeconds);
    const steps = this.stepper.advance(reactionSeconds);
    const stepMs = PHYSICS.fixedStepSeconds * MS_PER_SECOND;

    for (let i = 0; i < steps; i++) {
      this.matter.world.step(stepMs);

      if (this.attemptMachine.state === 'simulating') {
        const state = this.physicsAdapter.stepProjectile(this.currentLevel, PROJECTILE.radiusMetres);
        if (state) {
          // Sound follows the visible canvas; top exits still keep their valid flight path.
          if (!this.outOfCanvasSoundPlayed && (state.xPx < 0 || state.xPx > WORLD.designWidthPx ||
            state.yPx < 0 || state.yPx > WORLD.designHeightPx)) {
            this.outOfCanvasSoundPlayed = true;
            this.audioManager.playOutOfBounds();
          }
          this.lastProjectileState = state;
          this.trailRenderer.addPoint(state.xPx, state.yPx);
          if (state.firstGroundContact && !this.groundFeedbackShown) {
            this.groundFeedbackShown = true;
            const landing = state.firstGroundContact;
            this.trailRenderer.setLandingMarker(landing.xPx, landing.yPx, 'Landed');
            this.audioManager.playImpact('ground');
          }

          if (state.hitHat && !state.hitJonh && !this.hatReactionTriggered) {
            this.hatReactionTriggered = true;
            this.activeReactionQuote = this.reactionSelector.selectReaction('hat');
            this.jonhRenderer.triggerHatHit(this.activeReactionQuote);
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

    if (this.lastProjectileState && this.attemptMachine.state !== 'aiming') {
      this.ballRenderer.draw(this.lastProjectileState.xPx, this.lastProjectileState.yPx,
        !reduced && this.impactTimeline.age !== null ? this.jonhRenderer.impactSquash : 0);
    }

    if (this.isDebugEnabled) {
      const speed = powerToLaunchSpeed(this.currentPowerPercent, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg);
      const impulse = AIM.minImpulseNs + (this.currentPowerPercent / 100) * (AIM.maxImpulseNs - AIM.minImpulseNs);
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

    if (isBodyHit && this.impactTimeline.bodyImpact(this.jonhRenderer.isReducedMotionActive())) {
      this.stepper.reset();
      this.effects.bodyImpact(state.xPx, state.yPx);
      this.audioManager.playImpact('body');
      this.audioManager.playJonhReaction();
    }

    if (this.activeMode === 'solo') {
      this.soloCoordinator.resolveShot(isBodyHit, classification.outcome === 'ricochet_body');
    } else if (this.activeMode === 'multi') {
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
      `${feedback.label} · ${this.currentAngleDeg}° / ${this.currentPowerPercent}%`,
    );
    if (this.activeMode === 'multi' && this.shotShooterIndex !== null) {
      this.trailHistory.record(this.shotShooterIndex, this.trailRenderer.exportData());
    }

    if (isBodyHit) {
      this.jonhRenderer.triggerHit(state.impactSpeedMs, quote);
      this.htmlControls.setFeedback(`${feedback.label} (${classification.points} pts) · “${quote}”`, 'hit');
    } else if (classification.outcome === 'hat_only') {
      if (!this.hatReactionTriggered) this.jonhRenderer.triggerHatHit(quote);
      this.htmlControls.setFeedback(`${feedback.label} (${classification.points} pts) · Jonh: “${quote}”`, 'hit');
    } else if (feedback.category === 'overhead') {
      if (!this.overheadReactionTriggered) this.jonhRenderer.triggerOverhead(quote);
      this.htmlControls.setFeedback(`${feedback.label} · Jonh: “${quote}”`, 'miss');
    } else {
      this.htmlControls.setFeedback(`${feedback.label} · Jonh: “${quote}”`, 'miss');
    }

    this.inputCoordinator.setCanFire(false);
    this.htmlControls.setCanFire(false);

    if (this.activeMode === 'solo' && this.soloMachine.state === 'solo_result') {
      const res = this.soloMachine.result!;
      if (res.success) {
        recordSoloResult(this.currentLevel.id, res.shotsUsed, res.hasStyle, this.currentAngleDeg, this.currentPowerPercent);
      }
    }
    
    this.htmlControls.setResetLabel('Next now ↵');
    this.autoAdvance.schedule('shot', FLOW.shotResultSeconds);
  }

  private resetEffects(): void {
    this.impactTimeline.reset();
    this.effects?.reset();
    this.cannonRenderer?.setRecoil(0, this.currentAngleDeg);
    this.jonhRenderer?.settleImpact();
    if (this.lastProjectileState && this.ballRenderer) {
      this.ballRenderer.draw(this.lastProjectileState.xPx, this.lastProjectileState.yPx);
    }
  }

  private cleanup(): void {
    this.autoAdvance.cancel();
    this.resetEffects();
    this.canvasAim.destroy();
    for (const h of this.cleanupHandlers) h();
    this.cleanupHandlers = [];

    this.audioManager.destroy();
    this.effects.destroy();
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
    this.activeMode = 'multi';
    this.multiMachine = new MultiplayerMatchMachine(players, maps);
    this.trailHistory.clear();
    this.loadMultiplayerMap(this.multiMachine.currentMapId);
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
      this.cannonRenderer.draw(this.currentAngleDeg);
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
    this.physicsAdapter.setupLevel(this.currentLevel);

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
        saveMultiplayerSetup(this.multiMachine.setups);
        
        const muzzle = this.cannonRenderer.getMuzzlePosition(angle, PROJECTILE.radiusMetres);
        const speed = powerToLaunchSpeed(power, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg);
        const vWorld = launchVelocityToWorld(speed, angle, WORLD.pixelsPerMetre);
        const radiusPx = metresToPixels(PROJECTILE.radiusMetres, WORLD.pixelsPerMetre);

        this.physicsAdapter.spawnProjectile(muzzle.x, muzzle.y, radiusPx, vWorld);
        this.ballRenderer.draw(muzzle.x, muzzle.y);
      }
    });

    // Renderers
    this.sceneryRenderer = new SceneryRenderer(this, ppm, h, w);
    this.sceneryRenderer.draw(this.currentLevel);

    this.cannonRenderer = new CannonRenderer(this, this.currentLevel.cannonSpawn, ppm, h);
    this.slotsRenderer = new CannonSlotsRenderer(this);
    this.jonhRenderer = new JonhRenderer(this, this.currentLevel.jonhSpawn, ppm, h);
    this.jonhRenderer.draw(false);
    const data = loadSaveData();
    this.jonhRenderer.setReducedMotion(data.settings.reducedMotion);
    if (this.currentLevel.arrivalLine) this.jonhRenderer.triggerArrival(this.currentLevel.arrivalLine);

    const radiusPx = metresToPixels(PROJECTILE.radiusMetres, ppm);
    this.ballRenderer = new BallRenderer(this, radiusPx);
    this.trailRenderer = new TrailRenderer(this);
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
      this.slotsRenderer?.draw(match.players, match.activePlayerIndex);
      // Only this player's own previous trail, in their colour.
      this.trailRenderer.setPlayerColor(player.color);
      const history = this.trailHistory.get(match.activePlayerIndex);
      this.trailRenderer.importData(history ? asPreviousTrail(history) : null);
      this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
      
      this.htmlControls.setControlsInert(true);
      this.menuOverlay.showMPHandover(player, this.currentLevel.name, match.activePlayerShotNumber + 1);
      this.autoAdvance.schedule('handover', FLOW.handoverSeconds);
      this.htmlControls.setCanFire(false);
      this.htmlControls.setFeedback('', 'info');
      this.htmlControls.setResetLabel('Continue ↵');
    } else if (match.state === 'aiming') {
      this.htmlControls.setControlsInert(false);
      this.inputCoordinator.setCanFire(true);
      this.htmlControls.setCanFire(true);
      this.htmlControls.setResetLabel('Aim again ↵');
      const movement = match.activeCycleIndex > 0 ? ' · Jonh has moved—adjust your aim' : '';
      this.htmlControls.setFeedback(`${match.activePlayer.name}'s turn · Cycle ${match.activeCycleIndex + 1}/${MULTIPLAYER.shotsPerRound}${movement}`, 'info');
    } else if (match.state === 'round_result') {
      this.htmlControls.setControlsInert(true);
      this.menuOverlay.showMPRoundResult(match.players, match.roundIndex, match.roundCount);
      this.autoAdvance.schedule('round', FLOW.roundResultSeconds);
      this.htmlControls.setCanFire(false);
      this.htmlControls.setFeedback('', 'info');
      this.htmlControls.setResetLabel('Continue ↵');
    } else if (match.state === 'match_result') {
      this.htmlControls.setControlsInert(true);
      this.menuOverlay.showMPMatchResult(match.getWinners(), match.players);
      this.htmlControls.setCanFire(false);
      this.htmlControls.setFeedback('', 'info');
      this.htmlControls.setResetLabel('Continue ↵');
    }
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
    this.physicsAdapter.setupLevel(this.currentLevel);
    this.stepper.reset();
    this.classifier.reset();
    this.lastProjectileState = null;
    this.ballRenderer.setVisible(false);
    this.sceneryRenderer.draw(this.currentLevel);
    this.jonhRenderer.destroy();
    this.jonhRenderer = new JonhRenderer(this, this.currentLevel.jonhSpawn,
      WORLD.pixelsPerMetre, WORLD.designHeightPx);
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

}




