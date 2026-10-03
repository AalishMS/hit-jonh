import Phaser from 'phaser';
import { AudioManager } from '../audio/audioManager';
import { AIM, PHYSICS, PROJECTILE, SHOT, WORLD } from '../config/tuning';
import { InputCoordinator } from '../input/controls';
import { MAPS } from '../levels';
import { MatterAdapter, type ProjectileState } from '../physics/matterAdapter';
import { BallRenderer } from '../render/ballRenderer';
import { CannonRenderer } from '../render/cannonRenderer';
import { DebugRenderer } from '../render/debugRenderer';
import { JonhRenderer } from '../render/jonhRenderer';
import { SceneryRenderer } from '../render/sceneryRenderer';
import { TrailRenderer } from '../render/trailRenderer';
import { classifyShotOutcome, JonhReactionSelector } from '../rules/reactions';
import { ShotAttemptMachine } from '../rules/shotAttempt';
import { SoloChallengeMachine } from '../rules/soloChallenge';
import { SoloCoordinator } from '../rules/soloCoordinator';
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
import { loadSaveData, recordSoloResult, saveSoloAim } from '../storage/storage';
import type { LevelData } from '../levels/types';

export class PrototypeScene extends Phaser.Scene {
  private readonly stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);
  private attemptMachine!: ShotAttemptMachine;
  private soloMachine!: SoloChallengeMachine;
  private coordinator!: SoloCoordinator;
  private physicsAdapter!: MatterAdapter;
  private inputCoordinator!: InputCoordinator;
  private htmlControls!: HTMLControls;
  private menuOverlay!: MenuOverlay;
  private audioManager!: AudioManager;
  private reactionSelector = new JonhReactionSelector();
  private classifier = new ShotClassifier();

  private currentLevel!: LevelData;
  private sceneryRenderer!: SceneryRenderer;
  private cannonRenderer!: CannonRenderer;
  private jonhRenderer!: JonhRenderer;
  private ballRenderer!: BallRenderer;
  private trailRenderer!: TrailRenderer;
  private debugRenderer!: DebugRenderer;

  private currentAngleDeg = 45;
  private currentPowerPercent = 50;
  private lastProjectileState: ProjectileState | null = null;
  private groundFeedbackShown = false;
  private hatReactionTriggered = false;
  private overheadReactionTriggered = false;
  private activeReactionQuote: string | null = null;
  private isDebugEnabled = false;

  private cleanupHandlers: Array<() => void> = [];

  constructor() {
    super('PrototypeScene');
  }

  create(): void {
    const { designHeightPx: h, pixelsPerMetre: ppm } = WORLD;

    this.audioManager = new AudioManager();

    const matterEngine = this.matter.world.engine;
    this.physicsAdapter = new MatterAdapter(matterEngine.world, ppm, h);

    const gameContainer = document.getElementById('game')?.parentElement ?? document.body;
    
    // Check URL param ?debug
    if (new URLSearchParams(window.location.search).has('debug')) {
      this.isDebugEnabled = true;
    }

    this.htmlControls = new HTMLControls(
      gameContainer,
      {
        onAngleChange: (angle) => this.setAngle(angle),
        onPowerChange: (power) => this.setPower(power),
        onFire: () => this.fire(),
        onReset: () => this.reset(),
        onToggleDebug: (enabled) => {
          this.isDebugEnabled = enabled;
          if (this.debugRenderer) this.debugRenderer.setVisible(enabled);
        },
        onToggleMute: () => this.audioManager.toggleMute(),
      },
      this.currentAngleDeg,
      this.currentPowerPercent,
      this.isDebugEnabled,
      this.audioManager.isMuted,
    );

    this.menuOverlay = new MenuOverlay(gameContainer, {
      onMapSelected: (mapId) => this.loadMap(mapId),
      onRetry: () => {
        this.soloMachine.retry();
        this.reset();
      },
      onReturnToMenu: () => {
        this.htmlControls.setCanFire(false);
        this.menuOverlay.showMapSelect();
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
      const activeEl = document.activeElement;
      const isInput = activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLSelectElement;
      if (e.code === 'KeyD' && !isInput) {
        if (this.debugRenderer) this.isDebugEnabled = this.debugRenderer.toggle();
        return;
      }
      if (!this.currentLevel || this.menuOverlay.isVisible()) return;
      this.inputCoordinator.handleKeyDown(e.code, e.repeat, isInput);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!this.currentLevel || this.menuOverlay.isVisible()) return;
      this.inputCoordinator.handleKeyUp(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.cleanupHandlers.push(() => window.removeEventListener('keydown', onKeyDown));
    this.cleanupHandlers.push(() => window.removeEventListener('keyup', onKeyUp));

    const onHidden = () => this.stepper.reset();
    const onVisible = () => this.stepper.reset();
    this.game.events.on(Phaser.Core.Events.HIDDEN, onHidden);
    this.game.events.on(Phaser.Core.Events.VISIBLE, onVisible);
    this.cleanupHandlers.push(() => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, onHidden);
      this.game.events.off(Phaser.Core.Events.VISIBLE, onVisible);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    // Show Main Menu initially
    this.htmlControls.setCanFire(false);
    this.menuOverlay.showMainMenu();
  }

  private loadMap(mapId: string): void {
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

    this.coordinator = new SoloCoordinator(this.attemptMachine, this.soloMachine, {
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
    this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);

    this.reset();
    this.updateUIPerSoloState();
  }

  private setAngle(angle: number): void {
    if (!this.coordinator) return;
    const res = this.coordinator.adjustAim(this.currentAngleDeg, this.currentPowerPercent, angle - this.currentAngleDeg, 0);
    if (res) {
      this.currentAngleDeg = res.angle;
      this.cannonRenderer.draw(this.currentAngleDeg);
      this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
    }
  }

  private setPower(power: number): void {
    if (!this.coordinator) return;
    const res = this.coordinator.adjustAim(this.currentAngleDeg, this.currentPowerPercent, 0, power - this.currentPowerPercent);
    if (res) {
      this.currentPowerPercent = res.power;
      this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
    }
  }

  private fire(): void {
    if (!this.coordinator || !this.coordinator.canFire()) return;

    this.audioManager.unlock();
    this.audioManager.playCannonFire();

    this.classifier.reset();
    this.inputCoordinator.setCanFire(false);
    this.htmlControls.setCanFire(false);
    this.htmlControls.setFeedback(`Attempt ${3 - this.soloMachine.attemptsLeft}/3: Cannonball in flight...`, 'simulating');

    this.trailRenderer.startNewShot();
    this.groundFeedbackShown = false;
    this.hatReactionTriggered = false;
    this.overheadReactionTriggered = false;
    this.activeReactionQuote = null;
    this.jonhRenderer.resetToIdle();

    this.coordinator.fire(this.currentAngleDeg, this.currentPowerPercent);
  }

  reset(): void {
    if (!this.physicsAdapter || !this.coordinator) return;

    if (!this.coordinator.canReset()) return;
    this.coordinator.reset(this.currentAngleDeg, this.currentPowerPercent);

    if (this.soloMachine.state === 'solo_result') return;

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
    this.cannonRenderer.draw(this.currentAngleDeg);
    this.trailRenderer.onAttemptReset();
    
    this.updateUIPerSoloState();
  }

  private updateUIPerSoloState(): void {
    if (this.soloMachine.state === 'aiming') {
      this.inputCoordinator.setCanFire(true);
      this.htmlControls.setCanFire(true);
      this.htmlControls.setResetLabel('Aim again ↵');
      this.htmlControls.setFeedback(`Map: ${this.currentLevel.name}. ${this.soloMachine.attemptsLeft} attempts left.`, 'info');
    }
  }

  override update(_time: number, deltaMs: number): void {
    if (!this.currentLevel || !this.attemptMachine) return;
    const dtSeconds = deltaMs / MS_PER_SECOND;

    this.jonhRenderer.update(dtSeconds);
    const steps = this.stepper.advance(dtSeconds);
    const stepMs = PHYSICS.fixedStepSeconds * MS_PER_SECOND;

    for (let i = 0; i < steps; i++) {
      this.matter.world.step(stepMs);

      if (this.attemptMachine.state === 'simulating') {
        const state = this.physicsAdapter.stepProjectile(this.currentLevel, PROJECTILE.radiusMetres);
        if (state) {
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
      this.ballRenderer.draw(this.lastProjectileState.xPx, this.lastProjectileState.yPx);
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

    if (isBodyHit) this.audioManager.playImpact('body');
    
    this.coordinator.resolveShot(isBodyHit, classification.outcome === 'ricochet_body');

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

    if (this.soloMachine.state === 'solo_result') {
      const res = this.soloMachine.result!;
      if (res.success) {
        recordSoloResult(this.currentLevel.id, res.shotsUsed, res.hasStyle, this.currentAngleDeg, this.currentPowerPercent);
      }
    }
    
    this.htmlControls.setResetLabel('Continue ↵');
  }

  private cleanup(): void {
    for (const h of this.cleanupHandlers) h();
    this.cleanupHandlers = [];

    this.audioManager.destroy();
    this.physicsAdapter.clear();
    this.htmlControls.destroy();
    this.menuOverlay.destroy();
    if (this.sceneryRenderer) this.sceneryRenderer.destroy();
    if (this.cannonRenderer) this.cannonRenderer.destroy();
    if (this.jonhRenderer) this.jonhRenderer.destroy();
    if (this.ballRenderer) this.ballRenderer.destroy();
    if (this.trailRenderer) this.trailRenderer.destroy();
    if (this.debugRenderer) this.debugRenderer.destroy();
  }
}
