import Phaser from 'phaser';
import { AudioManager } from '../audio/audioManager';
import { AIM, PHYSICS, PROJECTILE, SHOT, WORLD } from '../config/tuning';
import { InputCoordinator } from '../input/controls';
import { BACKYARD_LEVEL } from '../levels/backyard';
import { MatterAdapter, type ProjectileState } from '../physics/matterAdapter';
import { BallRenderer } from '../render/ballRenderer';
import { CannonRenderer } from '../render/cannonRenderer';
import { DebugRenderer } from '../render/debugRenderer';
import { JonhRenderer } from '../render/jonhRenderer';
import { SceneryRenderer } from '../render/sceneryRenderer';
import { TrailRenderer } from '../render/trailRenderer';
import { classifyShotOutcome, JonhReactionSelector } from '../rules/reactions';
import { ShotAttemptMachine } from '../rules/shotAttempt';
import { ShotClassifier } from '../sim/classification';
import { FixedStepper } from '../sim/fixedStep';
import {
  launchVelocityToWorld,
  metresToPixels,
  MS_PER_SECOND,
  powerToLaunchSpeed,
} from '../sim/units';
import { HTMLControls } from '../ui/htmlControls';

export class PrototypeScene extends Phaser.Scene {
  private readonly stepper = new FixedStepper(
    PHYSICS.fixedStepSeconds,
    PHYSICS.maxStepsPerFrame,
  );

  private attemptMachine!: ShotAttemptMachine;
  private physicsAdapter!: MatterAdapter;
  private inputCoordinator!: InputCoordinator;
  private htmlControls!: HTMLControls;
  private audioManager!: AudioManager;
  private reactionSelector = new JonhReactionSelector();
  private classifier = new ShotClassifier();

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
    const { designWidthPx: w, designHeightPx: h, pixelsPerMetre: ppm } = WORLD;

    // 1. Initialise Audio Manager
    this.audioManager = new AudioManager();

    // 2. Initialise State Machine
    this.attemptMachine = new ShotAttemptMachine(
      BACKYARD_LEVEL.bounds.maxX,
      SHOT.settledSpeedMs,
      SHOT.settledSeconds,
      SHOT.timeoutSeconds,
      SHOT.boundsMarginMetres,
    );
    this.attemptMachine.setAim(this.currentAngleDeg, this.currentPowerPercent);

    // 3. Initialise Physics Adapter with Phaser's Matter engine
    const matterEngine = this.matter.world.engine;
    this.physicsAdapter = new MatterAdapter(matterEngine.world, ppm, h);
    this.physicsAdapter.setupLevel(BACKYARD_LEVEL);

    // 4. Initialise Renderers
    this.sceneryRenderer = new SceneryRenderer(this, ppm, h, w);
    this.sceneryRenderer.draw(BACKYARD_LEVEL);

    this.cannonRenderer = new CannonRenderer(this, BACKYARD_LEVEL.cannonSpawn, ppm, h);
    this.cannonRenderer.draw(this.currentAngleDeg);

    this.jonhRenderer = new JonhRenderer(this, BACKYARD_LEVEL.jonhSpawn, ppm, h);
    this.jonhRenderer.draw(false);

    const radiusPx = metresToPixels(PROJECTILE.radiusMetres, ppm);
    this.ballRenderer = new BallRenderer(this, radiusPx);
    this.trailRenderer = new TrailRenderer(this);
    this.debugRenderer = new DebugRenderer(this, ppm, h);

    // Check URL param ?debug
    if (new URLSearchParams(window.location.search).has('debug')) {
      this.isDebugEnabled = true;
      this.debugRenderer.setVisible(true);
    }

    // 5. Initialise HTML Controls
    const gameContainer = document.getElementById('game')?.parentElement ?? document.body;
    this.htmlControls = new HTMLControls(
      gameContainer,
      {
        onAngleChange: (angle) => this.setAngle(angle),
        onPowerChange: (power) => this.setPower(power),
        onFire: () => this.fire(),
        onReset: () => this.reset(),
        onToggleDebug: (enabled) => {
          this.isDebugEnabled = enabled;
          this.debugRenderer.setVisible(enabled);
        },
        onToggleMute: () => {
          return this.audioManager.toggleMute();
        },
      },
      this.currentAngleDeg,
      this.currentPowerPercent,
      this.isDebugEnabled,
      this.audioManager.isMuted,
    );

    // 6. Initialise Input Coordinator
    this.inputCoordinator = new InputCoordinator({
      onFire: () => this.fire(),
      onReset: () => this.reset(),
      onContinue: () => {
        if (this.attemptMachine.state === 'resolved') {
          this.reset();
        }
      },
      onToggleMute: () => {
        const isMuted = this.audioManager.toggleMute();
        this.htmlControls.setMuted(isMuted);
      },
      onAimChange: (deltaAngle, deltaPower) => {
        if (this.attemptMachine.state === 'resolved') {
          this.reset();
        }
        if (deltaAngle !== 0) {
          const nextAngle = Math.max(
            AIM.minAngleDeg,
            Math.min(AIM.maxAngleDeg, this.currentAngleDeg + deltaAngle),
          );
          this.setAngle(nextAngle);
        }
        if (deltaPower !== 0) {
          const nextPower = Math.max(0, Math.min(100, this.currentPowerPercent + deltaPower));
          this.setPower(nextPower);
        }
      },
    });
    this.inputCoordinator.setCanFire(true);

    // 7. User gesture unlock for Web Audio
    const unlockAudio = () => this.audioManager.unlock();
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
    this.cleanupHandlers.push(() => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    });

    // 8. Keyboard Listeners
    const onKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement;

      if (e.code === 'KeyD' && !isInput) {
        this.isDebugEnabled = this.debugRenderer.toggle();
        return;
      }

      this.inputCoordinator.handleKeyDown(e.code, e.repeat, isInput);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.inputCoordinator.handleKeyUp(e.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.cleanupHandlers.push(() => window.removeEventListener('keydown', onKeyDown));
    this.cleanupHandlers.push(() => window.removeEventListener('keyup', onKeyUp));

    // Handle tab visibility (reset accumulator)
    const onHidden = () => this.stepper.reset();
    const onVisible = () => this.stepper.reset();
    this.game.events.on(Phaser.Core.Events.HIDDEN, onHidden);
    this.game.events.on(Phaser.Core.Events.VISIBLE, onVisible);
    this.cleanupHandlers.push(() => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, onHidden);
      this.game.events.off(Phaser.Core.Events.VISIBLE, onVisible);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  private setAngle(angle: number): void {
    if (this.attemptMachine.state === 'simulating') return;
    if (this.attemptMachine.state === 'resolved') {
      this.reset();
    }
    this.currentAngleDeg = angle;
    this.attemptMachine.setAim(this.currentAngleDeg, this.currentPowerPercent);
    this.cannonRenderer.draw(this.currentAngleDeg);
    this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
  }

  private setPower(power: number): void {
    if (this.attemptMachine.state === 'simulating') return;
    if (this.attemptMachine.state === 'resolved') {
      this.reset();
    }
    this.currentPowerPercent = power;
    this.attemptMachine.setAim(this.currentAngleDeg, this.currentPowerPercent);
    this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
  }

  private fire(): void {
    if (!this.attemptMachine.canFire) return;

    this.audioManager.unlock();
    this.audioManager.playCannonFire();

    this.attemptMachine.fire(this.currentAngleDeg, this.currentPowerPercent);
    this.classifier.reset();
    this.inputCoordinator.setCanFire(false);
    this.htmlControls.setCanFire(false);
    this.htmlControls.setFeedback('Cannonball in flight! Tracking...', 'simulating');

    this.trailRenderer.startNewShot();
    this.groundFeedbackShown = false;
    this.hatReactionTriggered = false;
    this.overheadReactionTriggered = false;
    this.activeReactionQuote = null;
    this.jonhRenderer.resetToIdle();

    // Calculate spawn outside barrel
    const muzzle = this.cannonRenderer.getMuzzlePosition(
      this.currentAngleDeg,
      PROJECTILE.radiusMetres,
    );
    const speed = powerToLaunchSpeed(
      this.currentPowerPercent,
      AIM.minImpulseNs,
      AIM.maxImpulseNs,
      PROJECTILE.massKg,
    );
    const vWorld = launchVelocityToWorld(speed, this.currentAngleDeg, WORLD.pixelsPerMetre);
    const radiusPx = metresToPixels(PROJECTILE.radiusMetres, WORLD.pixelsPerMetre);

    this.physicsAdapter.spawnProjectile(muzzle.x, muzzle.y, radiusPx, vWorld);
    this.ballRenderer.draw(muzzle.x, muzzle.y);
  }

  reset(): void {
    this.audioManager.unlock();

    // 1. Remove projectile body and reset state
    this.physicsAdapter.removeProjectile();
    this.classifier.reset();
    this.lastProjectileState = null;
    this.groundFeedbackShown = false;
    this.hatReactionTriggered = false;
    this.overheadReactionTriggered = false;
    this.activeReactionQuote = null;

    // 2. Reset attempt state machine (preserves angle & power)
    this.attemptMachine.reset();
    this.attemptMachine.setAim(this.currentAngleDeg, this.currentPowerPercent);

    // 3. Reset visual presentations
    this.ballRenderer.setVisible(false);
    this.jonhRenderer.resetToIdle();
    this.cannonRenderer.draw(this.currentAngleDeg);
    this.trailRenderer.onAttemptReset();

    // 4. Update UI
    this.inputCoordinator.setCanFire(true);
    this.htmlControls.setCanFire(true);
    this.htmlControls.setResetLabel('Aim again');
    this.htmlControls.setValues(this.currentAngleDeg, this.currentPowerPercent);
    this.htmlControls.setFeedback('Last shot kept below. Adjust your angle or power, then fire.', 'info');
  }

  override update(_time: number, deltaMs: number): void {
    const dtSeconds = deltaMs / MS_PER_SECOND;

    // Update cosmetic idle/hit animations (does not affect stationary colliders)
    this.jonhRenderer.update(dtSeconds);

    const steps = this.stepper.advance(dtSeconds);
    const stepMs = PHYSICS.fixedStepSeconds * MS_PER_SECOND;

    for (let i = 0; i < steps; i++) {
      // Step Matter physics
      this.matter.world.step(stepMs);

      // Step simulation rules if active
      if (this.attemptMachine.state === 'simulating') {
        const state = this.physicsAdapter.stepProjectile(
          BACKYARD_LEVEL,
          PROJECTILE.radiusMetres,
        );

        if (state) {
          this.lastProjectileState = state;
          this.trailRenderer.addPoint(state.xPx, state.yPx);
          if (state.firstGroundContact && !this.groundFeedbackShown) {
            this.groundFeedbackShown = true;
            const landing = state.firstGroundContact;
            this.trailRenderer.setLandingMarker(landing.xPx, landing.yPx, 'Landed');
            this.audioManager.playImpact('ground');
          }

          // Trigger mid-flight cosmetic reactions once at actual contact/pass
          if (state.hitHat && !state.hitJonh && !this.hatReactionTriggered) {
            this.hatReactionTriggered = true;
            const quote = this.reactionSelector.selectReaction('hat');
            this.activeReactionQuote = quote;
            this.jonhRenderer.triggerHatHit(quote);
          } else if (
            state.passedOverhead &&
            !state.hitJonh &&
            !state.hitHat &&
            !this.overheadReactionTriggered &&
            !this.hatReactionTriggered
          ) {
            this.overheadReactionTriggered = true;
            const quote = this.reactionSelector.selectReaction('overhead');
            this.activeReactionQuote = quote;
            this.jonhRenderer.triggerOverhead(quote);
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

    // Update continuous visual rendering
    if (this.lastProjectileState && this.attemptMachine.state !== 'aiming') {
      this.ballRenderer.draw(
        this.lastProjectileState.xPx,
        this.lastProjectileState.yPx,
      );
    }

    // Update debug view
    if (this.isDebugEnabled) {
      const speed = powerToLaunchSpeed(
        this.currentPowerPercent,
        AIM.minImpulseNs,
        AIM.maxImpulseNs,
        PROJECTILE.massKg,
      );
      const impulse =
        AIM.minImpulseNs +
        (this.currentPowerPercent / 100) * (AIM.maxImpulseNs - AIM.minImpulseNs);
      const muzzle = this.cannonRenderer.getMuzzlePosition(
        this.currentAngleDeg,
        PROJECTILE.radiusMetres,
      );

      this.debugRenderer.draw(BACKYARD_LEVEL, {
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

  private handleResolution(
    result: { resolved: true; outcome: 'hit' | 'miss'; reason?: string; hadHatHit?: boolean },
    state: ProjectileState,
  ): void {
    // 1. Record contacts into ShotClassifier for pure classification
    for (const obs of state.obstacleContacts) {
      this.classifier.recordContact({
        role: 'obstacle',
        id: obs.id,
        ricochet: obs.ricochet,
      });
    }
    if (state.hitGround) {
      this.classifier.recordContact({ role: 'ground' });
    }
    if (state.hitHat || result.hadHatHit) {
      this.classifier.recordContact({ role: 'jonhHat' });
    }
    if (state.hitJonh) {
      this.classifier.recordContact({ role: 'jonhBody' });
    }
    if (state.passedOverhead) {
      this.classifier.recordOverhead();
    }

    const classification = this.classifier.classify(true);
    const isBodyHit = classification.isHit; // true for body and ricochet_body

    // 2. Play impact audio
    if (isBodyHit) {
      this.audioManager.playImpact('body');
    }

    // 3. Select feedback and quote
    const feedback = classifyShotOutcome(
      isBodyHit,
      isBodyHit ? state.xSim : state.firstGroundContact?.xSim ?? state.xSim,
      BACKYARD_LEVEL.jonhSpawn.bodyBox.minX,
      BACKYARD_LEVEL.jonhSpawn.bodyBox.maxX,
      {
        classifiedOutcome: classification.outcome,
        passedOverhead: state.passedOverhead,
        obstacleContacts: state.obstacleContacts,
      },
    );
    // For body hits, always select fresh dialogue to react to the impact (overriding any earlier mid-flight reaction).
    // For hat-only or overhead, reuse the mid-flight quote so dialogue does not re-roll or repeat.
    const quote = isBodyHit
      ? this.reactionSelector.selectReaction(feedback.category)
      : (this.activeReactionQuote ?? this.reactionSelector.selectReaction(feedback.category));

    // 4. Terminal landing position feedback
    const landing = !isBodyHit ? state.firstGroundContact : null;
    this.trailRenderer.setLandingMarker(
      landing?.xPx ?? state.xPx,
      landing?.yPx ?? state.yPx,
      `${feedback.label} · ${this.currentAngleDeg}° / ${this.currentPowerPercent}%`,
    );
    this.inputCoordinator.setCanFire(false);

    // 5. Trigger specific Jonh visual reaction and HTML feedback
    if (isBodyHit) {
      this.jonhRenderer.triggerHit(state.impactSpeedMs, quote);
      this.htmlControls.setFeedback(
        `${feedback.label} (${classification.points} pts) · “${quote}”`,
        'hit',
      );
    } else if (classification.outcome === 'hat_only') {
      if (!this.hatReactionTriggered) {
        this.jonhRenderer.triggerHatHit(quote);
      }
      this.htmlControls.setFeedback(
        `${feedback.label} (${classification.points} pts) · ${feedback.detail} Jonh: “${quote}”`,
        'hit',
      );
    } else if (feedback.category === 'overhead') {
      if (!this.overheadReactionTriggered) {
        this.jonhRenderer.triggerOverhead(quote);
      }
      this.htmlControls.setFeedback(
        `${feedback.label} · ${feedback.detail} Jonh: “${quote}”`,
        'miss',
      );
    } else {
      const correction = feedback.category === 'short'
        ? this.currentPowerPercent === 100
          ? 'At full power, try an angle closer to 45°.'
          : 'Try a little more power at this angle.'
        : feedback.category === 'over'
          ? 'Try a little less power at this angle.'
          : feedback.detail;
      this.htmlControls.setFeedback(
        `${feedback.label} · ${correction} Jonh: “${quote}”`,
        'miss',
      );
    }

    this.htmlControls.setResetLabel('Aim again ↵');
    this.htmlControls.setCanFire(false);
  }

  private cleanup(): void {
    for (const h of this.cleanupHandlers) h();
    this.cleanupHandlers = [];

    this.audioManager.destroy();
    this.physicsAdapter.clear();
    this.htmlControls.destroy();
    this.sceneryRenderer.destroy();
    this.cannonRenderer.destroy();
    this.jonhRenderer.destroy();
    this.ballRenderer.destroy();
    this.trailRenderer.destroy();
    this.debugRenderer.destroy();
  }
}
