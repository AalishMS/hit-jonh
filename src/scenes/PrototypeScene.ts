import Phaser from 'phaser';
import { AudioManager } from '../audio/audioManager';
import { AIM, COACH, FLOW, FX, LOOK, MULTIPLAYER, PHYSICS, PROJECTILE, SHOT, WORLD } from '../config/tuning';
import { CameraRig } from '../render/cameraRig';
import { ReplayBuffer, ReplayDirector, type ReplayFrame } from '../fx/replay';
import { ReplayOverlay } from '../ui/replayOverlay';
import { aimFrame, flightFrame, impactFrame, levelView, replayFrame, type Frame, type Viewport } from '../fx/cameraDirector';
import { clamp01 } from '../fx/easing';
import { recordShot as recordDemoShot, type RecordedShot } from '../physics/shotRecorder';
import { DemoStage } from '../render/demoStage';
import { buildWardrobe, type WardrobeSection } from '../ui/wardrobe';
import {
  CANNON_SKIN_ORDER, CANNON_SKIN_RULES, cosmeticContext, newlyUnlockedCannonSkins, newlyUnlockedOutfits, OUTFIT_ORDER, OUTFIT_RULES,
  unlockedCannonSkins, unlockedOutfits, type CannonSkinId, type OutfitId,
} from '../rules/cosmetics';
import { outfitFigureSvg } from '../art/outfitArt';
import { cannonSkinFigureSvg } from '../art/cannonArt';
import { cannonSkinGroup, cosmeticArtGroups, hatGroup, levelArtGroups, outfitGroup, playerBarrelGroups } from '../art/library';
import { artMeta, artReady, whenArtReady } from '../render/artTextures';
import { pickAttractLevel } from './attractLevel';
import { readabilityBoost } from '../fx/readability';
import { playTitleCard, TITLE_CARD_SECONDS } from '../ui/transition';
import { campaignOrder } from '../rules/campaign';
import { hitQuality, impactProfile, type HitQuality } from '../fx/impactProfile';
import { distanceToBox, fastForwardTarget, SettleClock } from '../fx/settleClock';
import type { SurfaceSound } from '../audio/audioManager';
import { CanvasAim } from '../input/canvasAim';
import { AutoAdvance } from '../rules/autoAdvance';
import { InputCoordinator, isTextInputElement } from '../input/controls';
import { MAP_IDS, MAPS } from '../levels';
import { campaignStatus, campaignTotals, nextCampaignMap } from '../rules/campaign';
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
import { classifyShotOutcome, JonhReactionSelector, type ReactionContext } from '../rules/reactions';
import { HeckleTimer } from '../rules/heckleTimer';
import { SessionCoordinator } from '../rules/sessionCoordinator';
import { ShotAttemptMachine } from '../rules/shotAttempt';
import { SoloChallengeMachine } from '../rules/soloChallenge';
import { SoloCoordinator } from '../rules/soloCoordinator';
import { MultiplayerMatchMachine, OUTCOME_POINTS, type MPPlayerSetup } from '../rules/multiplayerMatch';
import { MultiCoordinator } from '../rules/multiCoordinator';
import { matchStakes, shotsLeftPerPlayer, suddenDeathStakes, tauntFor, type Stakes } from '../rules/matchStakes';
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
import { DAILY_LINK_PARAM, dailyLink, dailyShareText, shotCode } from '../rules/dailyShare';
import { HAT_ORDER, HAT_RULES, dailyChallenge, dailyStreak, dateKey, freshProgress, newlyUnlocked, recordDaily, recordShot, recordSoloFinish, unlockedHats, type HatName, type Progress } from '../rules/progression';
import { shareBlock } from '../ui/share';
import { DEFAULT_KEYS, keyLabel, type KeyBindings } from '../input/keyBindings';
import { coachActive, missHint, showGhostHand } from '../rules/coach';
import { FEATS, FEAT_GROUPS, featStatuses, featsDone, newlyCompletedFeats, type FeatInput } from '../rules/feats';
import { buildFeats } from '../ui/feats';
import { CoachRenderer } from '../render/coachRenderer';
import { mapPreview } from '../ui/mapPreview';
import type { LevelData } from '../levels/types';
import { isOnlineConfigured } from '../net/convexClient';
import { OnlineController, type OnlineSceneHooks } from './onlineController';

/** Result labels when the official online outcome differs from what this device simulated. */
const OFFICIAL_LABELS: Record<ClassifiedOutcome, string> = {
  ricochet_body: 'Ricochet hit', body: 'Direct hit', hat_only: 'Hat hit', miss: 'Miss',
};

/** An earned cosmetic: a hat, an outfit or a cannon skin. */
type Unlock = { kind: 'hat'; id: HatName } | { kind: 'outfit'; id: OutfitId } | { kind: 'cannon'; id: CannonSkinId };

/** Keys that adjust the aim; pressing one during a solo miss's result goes straight back to aiming. */
/** The bound aim keys (angle and power), for "touching the aim skips a miss's result". */
const aimKeys = (k: KeyBindings): string[] => [k.angleDown, k.angleUp, k.powerDown, k.powerUp];

/** Impact sound per obstacle material; anything hard and unlisted clunks like concrete. */
const SURFACE_SOUNDS: Partial<Record<string, SurfaceSound>> = { wood: 'wood', rubber: 'rubber', trampoline: 'rubber', leaves: 'ground', glass: 'glass', velvet: 'ground' };

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
  /**
   * The title screen's live garden. A demo shot (one of the garden's physics-proven reference
   * solutions, recorded on a private engine) bonks Jonh every so often, or whenever the player taps.
   */
  private attract: {
    stage: DemoStage;
    /** Seconds until the next demo shot (counts only on the home view). */
    timer: number;
    /** Seconds until Jonh's opening quip, if not said yet. */
    quipIn: number | null;
  } | null = null;
  private readonly recordedShots = new Map<string, RecordedShot>();
  private soloResultExtras: SoloResultExtras = {};
  private progress: Progress = freshProgress();
  /** Cosmetics unlocked since the last solo result screen (shown as one card there). */
  private pendingUnlocks: Unlock[] = [];
  /** Feats completed during the current solo run, announced on its result card. */
  private pendingFeats: string[] = [];
  /** Set while playing today's Daily Bonk (never overwrites solo bests). */
  private daily: { key: string; positionId: string } | null = null;
  /** This daily run's shots so far (rules/dailyShare.ts codes), saved with the day's first result. */
  private dailyRun = '';
  /** Practice on a cleared garden: unlimited shots, nothing saved (SPEC §4.2). */
  private practice = false;
  /** Gameplay key bindings (Settings → Keys). */
  private keys: KeyBindings = DEFAULT_KEYS;
  /**
   * Bumped by every map load and by leaving play: a map whose art finishes rasterizing after the
   * player has gone Home (or picked another garden) must not build itself behind the menu.
   */
  private loadToken = 0;
  /** The coach's ghost hand on the first garden while it plays (rules/coach.ts). */
  private coachHand: CoachRenderer | null = null;
  /** One fix for the last solo miss, shown while re-aiming until the player's first hit ever. */
  private coachHint: string | null = null;
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
  /** Fast-forwards a missed ball that is only rolling to a stop (presentation time only). */
  private readonly settleClock = new SettleClock();
  /** The HUD pill currently offers "Skip" for a rolling ball. */
  private skipOffered = false;
  /** Solo: Jonh's line about the last miss stays in his bubble while the player re-aims. */
  private lastMissQuote: string | null = null;
  /** Shots in a row (this session) that did not hit Jonh's body: his lines escalate. */
  private missStreak = 0;
  /** Jonh heckles a player who takes ages to aim. */
  private readonly heckles = new HeckleTimer();
  /** Multiplayer party: the last scored shot (for the next handover's taunt) and the current stakes. */
  private lastPartyShot: { shooter: number; outcome: ClassifiedOutcome } | null = null;
  private currentStakes: Stakes | null = null;
  /** Every body hit of the current match, for the winning-shot replay. */
  private matchHighlights: Array<{ player: number; mapId: string; positionId: string; angle: number; power: number; outcome: ClassifiedOutcome }> = [];
  /** In-canvas text grows on small screens (speech bubble, landing label). */
  private textBoost = 1;
  /** A chapter card is covering the start of this round: the first handover waits for it. */
  private titleCardPending = false;
  /** The winning-shot replay before the match result: not started, playing, or done for this match. */
  private showcaseState: 'none' | 'playing' | 'done' = 'none';

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
        this.menuOverlay.showPauseMenu(this.online?.inMatch ? 'Leave match' : this.practice ? 'End practice' : undefined);
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
        // Ending practice goes back to the gardens (still in practice), not all the way Home.
        const fromPractice = this.practice;
        this.performQuit();
        if (fromPractice) this.menuOverlay.showMapSelect(true);
      }
    }, this.stepper);

    this.htmlControls = new HTMLControls(
      gameContainer,
      {
        onAngleChange: (angle) => this.setAngle(angle),
        onPowerChange: (power) => this.setPower(power),
        onFire: () => this.fire(),
        onReset: () => { if (!this.hurryShot()) this.reset(); },
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
      onPracticeSelected: (mapId) => this.loadMap(mapId, null, true),
      onRetry: () => {
        this.lastMissQuote = null;
        this.inputCoordinator.setOverlayVisible(false);
        this.htmlControls.setVisible(true);
        this.htmlControls.setControlsInert(false);
        this.soloMachine.retry();
        this.dailyRun = '';
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
        this.stopShowcase();
        this.lastPartyShot = null;
        this.matchHighlights = [];
        this.trailHistory.clear();
        this.loadMultiplayerMap(this.multiMachine.currentMapId, () => this.updateUIPerMultiState());
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
        this.attract?.stage.jonh.setReducedMotion(settings.reducedMotion);
      },
      onClick: () => this.audioManager.playClick(),
      onKeysChange: (keys) => this.applyKeys(keys),
      onHomeExtras: (row, signal) => this.addHomeExtras(row, signal),
      onOnline: isOnlineConfigured() ? () => this.online?.open() : undefined,
    });
    this.online = isOnlineConfigured() ? new OnlineController(this.menuOverlay, this.onlineHooks()) : null;
    document.documentElement.classList.toggle('reduced-motion', loadSaveData().settings.reducedMotion);

    this.inputCoordinator = new InputCoordinator({
      onFire: () => this.fire(),
      onReset: () => { if (!this.hurryShot()) this.reset(); },
      onContinue: () => {
        if (this.hurryShot()) return;
        if (this.attemptMachine?.state === 'resolved') {
          this.reset();
        }
      },
      // Space while it can't fire: finish a rolling ball, or (solo) skip the result window.
      onSkip: () => { if (!this.hurryShot()) this.skipResult(false); },
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
      canAim: () => {
        // Touching the field during a solo miss's result window skips straight back to aiming.
        this.skipResult(true);
        return this.canAimNow();
      },
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

    // Title screen: tapping the garden fires the demo shot at Jonh right away.
    const onTitleTap = (event: PointerEvent) => {
      if (this.activeMode !== 'none' || !this.attract || !event.isPrimary || this.menuOverlay.getView() !== 'home') return;
      this.audioManager.unlock();
      this.attractFire();
    };
    this.game.canvas.addEventListener('pointerdown', onTitleTap);
    this.cleanupHandlers.push(() => this.game.canvas.removeEventListener('pointerdown', onTitleTap));

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
      if (this.showcaseState === 'playing') return;
      const isInput = isTextInputElement(e.target || document.activeElement);

      if (e.code === 'KeyD' && !isInput && this.isDevOptIn) {
        if (this.debugRenderer) this.isDebugEnabled = this.debugRenderer.toggle();
        return;
      }
      
      const isOverlayOpen = this.menuOverlay.isVisible() && !this.menuOverlay.isPauseMenuVisible();
      this.inputCoordinator.setOverlayVisible(isOverlayOpen);
      if (!isInput && !e.repeat && aimKeys(this.keys).includes(e.code)) this.skipResult(true);

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
    this.applyKeys(loadSaveData().settings.keys);
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

    // Small screens: grow in-canvas text so it stays readable (re-measured whenever the canvas refits).
    const onResize = () => this.updateTextBoost();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.cleanupHandlers.push(() => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));
    this.updateTextBoost();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    // Start at Home with gameplay controls hidden and disabled.
    this.htmlControls.setCanFire(false);
    this.htmlControls.setControlsInert(true);
    this.htmlControls.setVisible(false);
    this.menuOverlay.showHome();
    this.showAttract();

    // A shared room link (?room=CODE) opens online play directly, rejoining this tab's seat after a reload.
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && this.online) void this.online.openFromLink(roomParam);
    else if (params.has(DAILY_LINK_PARAM)) {
      // A shared Daily Bonk result links here: open today's challenge (once; a reload starts at Home).
      const url = new URL(window.location.href);
      url.searchParams.delete(DAILY_LINK_PARAM);
      window.history.replaceState(null, '', url);
      this.showDaily();
    }
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
    if (this.showcaseState === 'playing') return;
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
    this.stopShowcase();
    this.titleCardPending = false;
    this.loadToken++; // a garden still loading its art must not build itself after this
    this.missStreak = 0;
    this.daily = null;
    this.practice = false;
    this.dismissCoachHand();
    this.coachHint = null;
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

  private updateTextBoost(): void {
    const width = this.game.canvas.getBoundingClientRect().width;
    const boost = readabilityBoost(width);
    if (Math.abs(boost - this.textBoost) < 0.01) return;
    this.textBoost = boost;
    this.jonhRenderer?.setUiScale(this.textBoost / (this.view.zoom ?? 1));
    this.trailRenderer?.setTextBoost(this.textBoost);
    this.attract?.stage.jonh.setUiScale(this.textBoost);
    this.coachHand?.setUiScale(this.textBoost / (this.view.zoom ?? 1));
  }

  /** The title screen's live backdrop: Jonh reading in one of your gardens while menus are open. */
  private showAttract(): void {
    this.hideAttract();
    const stage = new DemoStage(this, this.pickAttractLevel(),
      { audio: this.audioManager, effects: this.effects, camera: this.cameraRig, timeline: this.impactTimeline },
      { hatId: this.progress.selectedHat, outfitId: this.progress.selectedOutfit, skin: this.progress.selectedCannon,
        reducedMotion: loadSaveData().settings.reducedMotion, textBoost: this.textBoost });
    this.view = { width: WORLD.designWidthPx, height: WORLD.designHeightPx };
    this.attract = { stage, timer: FLOW.attractFirstShotSeconds, quipIn: 1.2 };
  }

  /** A garden the player has unlocked (ordinary width, so the title framing fits). */
  private pickAttractLevel(): LevelData {
    return pickAttractLevel(id => artReady(levelArtGroups(id)));
  }

  private hideAttract(): void {
    if (!this.attract) return;
    this.attract.stage.destroy();
    this.attract = null;
    this.effects?.reset();
    this.impactTimeline.reset();
    this.cameraRig?.reset();
  }

  /** A recorded reference shot (cached: recording runs real Matter on a private engine). */
  private recordedShot(level: LevelData, angleDeg: number, powerPercent: number): RecordedShot {
    const key = `${level.id}:${level.jonhSpawn.bodyBox.minX}:${angleDeg}:${powerPercent}`;
    let shot = this.recordedShots.get(key);
    if (!shot) {
      shot = recordDemoShot(level, angleDeg, powerPercent);
      this.recordedShots.set(key, shot);
    }
    return shot;
  }

  /** Title screen: aim at Jonh, wind up and fire a recorded reference shot (tap = right now). */
  private attractFire(): void {
    const a = this.attract;
    if (!a || a.stage.busy) return;
    if (a.stage.jonh.isReducedMotionActive()) {
      // No flying ball under reduced motion: he just answers.
      const line = this.reactionSelector.selectTitle(false);
      a.stage.jonh.triggerArrival(line);
      this.audioManager.playMutter(line.length);
      return;
    }
    const aims = a.stage.level.referenceSolutions;
    const aim = aims[Math.floor(Math.random() * aims.length)]!;
    a.stage.fire({
      shot: this.recordedShot(a.stage.level, aim.angleDeg, aim.powerPercent),
      angleDeg: aim.angleDeg,
      powerPercent: aim.powerPercent,
      line: this.reactionSelector.selectTitle(true),
      onDone: () => { if (this.attract === a) a.timer = FLOW.attractShotEverySeconds + Math.random() * 4; },
    });
  }

  private updateAttract(dt: number, reduced: boolean): void {
    const a = this.attract!;
    const onHome = this.menuOverlay.isVisible() && this.menuOverlay.getView() === 'home';
    if (a.quipIn !== null) {
      a.quipIn -= dt;
      if (a.quipIn <= 0) {
        a.quipIn = null;
        if (onHome && !a.stage.busy) {
          const line = this.reactionSelector.selectTitle(false);
          a.stage.jonh.triggerArrival(line);
          this.audioManager.playMutter(line.length);
        }
      }
    }
    if (!a.stage.busy && onHome && !reduced) {
      a.timer -= dt;
      if (a.timer <= 0) { a.timer = Number.POSITIVE_INFINITY; this.attractFire(); }
    }
    a.stage.update(dt, reduced);
  }

  private loadMap(mapId: string, daily: { key: string; positionId: string } | null = null, practice = false): void {
    // Art is rasterized the first time a garden (or hat, outfit, cannon) is needed; wait for it, then build the scene.
    const token = ++this.loadToken;
    whenArtReady(this, [...levelArtGroups(mapId), ...this.cosmeticGroups()], () => {
      if (token === this.loadToken) this.loadMapNow(mapId, daily, practice);
    });
  }

  private loadMapNow(mapId: string, daily: { key: string; positionId: string } | null, practice: boolean): void {
    this.hideAttract();
    this.autoAdvance.cancel();
    this.resetEffects();
    this.activeMode = 'solo';
    const level = MAPS.find(m => m.id === mapId);
    if (!level) return;
    this.daily = daily;
    this.practice = practice && !daily;
    this.dailyRun = '';
    this.coachHint = null;
    this.currentLevel = daily ? levelAtMultiplayerPosition(level, daily.positionId) : level;
    this.lastMissQuote = null;

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
      this.currentLevel.bounds.minY,
    );
    this.soloMachine = new SoloChallengeMachine(mapId, { practice: this.practice });

    this.soloCoordinator = new SoloCoordinator(this.attemptMachine, this.soloMachine, {
      onStateChange: () => this.updateUIPerSoloState(),
      onShotFired: (angle, power) => {
        if (!this.daily && !this.practice) saveSoloAim(this.soloMachine.mapId, angle, power);
        
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

    this.cannonRenderer = new CannonRenderer(this, this.currentLevel.cannonSpawn, ppm, h, this.levelPhys, this.progress.selectedCannon);
    this.cannonRenderer.setUiScale(1 / (this.view.zoom ?? 1));
    this.jonhRenderer = new JonhRenderer(this, this.currentLevel.jonhSpawn, ppm, h, { level: this.currentLevel, hatId: this.progress.selectedHat, outfitId: this.progress.selectedOutfit });
    this.jonhRenderer.setUiScale(this.textBoost / (this.view.zoom ?? 1));
    this.jonhRenderer.draw(false);

    const radiusPx = metresToPixels(PROJECTILE.radiusMetres, ppm);
    this.ballRenderer = new BallRenderer(this, radiusPx);
    this.trailRenderer = new TrailRenderer(this);
    this.trailRenderer.setView(this.view);
    this.trailRenderer.setTextBoost(this.textBoost);
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
    this.jonhSays(this.reactionSelector.selectArrival(level.id, this.currentLevel.arrivalLine));
    this.updateUIPerSoloState();
    const number = campaignOrder(MAP_IDS).indexOf(level.id) + 1;
    playTitleCard(level.name, daily ? 'Daily Bonk' : this.practice ? `Practice · Garden ${number}` : `Garden ${number}`, data.settings.reducedMotion);
    this.startCoachHand();
  }

  /** The ball touched the ground before reaching the nearest obstacle it hit (it rolled into it). */
  private landedBeforeObstacle(state: ProjectileState): boolean {
    const ground = state.firstGroundContact;
    if (!ground || state.obstacleContacts.length === 0) return false;
    const near = Math.min(...state.obstacleContacts.map(c => this.currentLevel.obstacles.find(o => o.id === c.id)?.box.minX ?? Number.POSITIVE_INFINITY));
    return ground.xSim < near;
  }

  /** Remapped keys (Settings → Keys): the keyboard coordinator and the HUD's key labels follow them. */
  private applyKeys(keys: KeyBindings): void {
    this.keys = keys;
    this.inputCoordinator.setKeys(keys);
    this.htmlControls.setKeyLabels(keyLabel(keys.fire), keyLabel(keys.next));
  }

  /** The coach's ghost hand: on the first garden, for a player who has never hit Jonh (rules/coach.ts). */
  private startCoachHand(): void {
    this.dismissCoachHand();
    const show = showGhostHand({ mode: this.activeMode, daily: this.daily !== null, mapId: this.currentLevel.id, firstMapId: campaignOrder(MAP_IDS)[0]!,
      totalHits: this.progress.totalHits, shotsFired: 0, aimTouched: false });
    if (!show) return;
    const { pixelsPerMetre: ppm, designHeightPx: h } = WORLD;
    const spawn = this.currentLevel.cannonSpawn;
    const from = { x: metresToPixels(spawn.x, ppm), y: simYToWorldY(spawn.y, h, ppm) };
    const to = { x: metresToPixels(spawn.x + COACH.dragTo.x, ppm), y: simYToWorldY(spawn.y + COACH.dragTo.y, h, ppm) };
    this.coachHand = new CoachRenderer(this, from, to, this.textBoost / (this.view.zoom ?? 1));
  }

  private dismissCoachHand(): void {
    this.coachHand?.destroy();
    this.coachHand = null;
  }

  private setAngle(angle: number): void {
    if (this.activeMode === 'none' || this.sessionCoordinator?.isPaused || this.menuOverlay.isVisible() || !this.activeCoordinator) return;
    if (!this.canUserAct()) return;
    const res = this.activeCoordinator.adjustAim(this.currentAngleDeg, this.currentPowerPercent, angle - this.currentAngleDeg, 0);
    if (res) {
      if (res.angle !== this.currentAngleDeg) { this.heckles.activity(); this.dismissCoachHand(); }
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
      if (res.power !== this.currentPowerPercent) { this.heckles.activity(); this.dismissCoachHand(); }
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
    this.dismissCoachHand();
    this.coachHint = null;
    this.outOfCanvasSoundPlayed = false;
    this.audioManager.unlock();
    this.lastMissQuote = null;
    this.heckles.reset();

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
      this.htmlControls.setFeedback(this.practice ? `Practice shot ${this.soloMachine.shotsTaken}: Cannonball in flight...`
        : `Attempt ${3 - this.soloMachine.attemptsLeft}/3: Cannonball in flight...`, 'simulating');
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
    this.heckles.reset();
    this.jonhRenderer.resetToIdle();
    this.jonhRenderer.draw(false);
    // Solo: his line about the miss stays up while you re-aim (the result window is short).
    if (this.activeMode === 'solo' && this.lastMissQuote) this.jonhRenderer.triggerArrival(this.lastMissQuote);
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
      if (this.practice) {
        const { hits, shotsTaken: shots } = this.soloMachine;
        this.htmlControls.setMatchStatus(`Practice · ${this.currentLevel.name}`, []);
        this.htmlControls.setStreak(0);
        this.htmlControls.setAttempts(null);
        this.htmlControls.setFeedback(shots === 0 ? 'Practice: as many shots as you like. Nothing is saved.'
          : `Practice: ${hits} hit${hits === 1 ? '' : 's'} in ${shots} shot${shots === 1 ? '' : 's'}`, 'info');
        return;
      }
      this.htmlControls.setMatchStatus(this.daily ? `Daily Bonk · ${this.currentLevel.name}` : this.currentLevel.name, []);
      this.htmlControls.setStreak(this.progress.currentStreak);
      const left = this.soloMachine.attemptsLeft;
      this.htmlControls.setAttempts(left);
      const shotsLeft = `${left} shot${left === 1 ? '' : 's'} left`;
      if (this.coachHint) this.htmlControls.setFeedback(`${this.coachHint} ${shotsLeft}.`, 'coach');
      else this.htmlControls.setFeedback(left === 3 ? 'Drag the cannon (or the field) to aim, then FIRE' : `${shotsLeft}. Adjust and fire again`, 'info');
    }
  }

  override update(_time: number, deltaMs: number): void {
    this.online?.update(Math.max(0, Math.min(FLOW.maxFrameSeconds, deltaMs / MS_PER_SECOND)));
    if (this.activeMode === 'none' && this.attract) {
      const dt = Math.max(0, Math.min(FLOW.maxFrameSeconds, deltaMs / MS_PER_SECOND));
      this.updateAttract(dt, this.attract.stage.jonh.isReducedMotionActive());
      return;
    }
    if (this.sessionCoordinator?.isPaused || this.activeMode === 'none' || !this.currentLevel || !this.attemptMachine) return;
    if (this.skipPresentationFrame) { this.skipPresentationFrame = false; return; }
    const dtSeconds = Math.max(0, Math.min(FLOW.maxFrameSeconds, deltaMs / MS_PER_SECOND));
    const reduced = this.jonhRenderer.isReducedMotionActive();
    this.sceneryRenderer.update(dtSeconds, reduced);
    this.coachHand?.update(dtSeconds, reduced);
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
    if (this.canAimNow() && !this.canvasAim.isDragging && this.heckles.advance(dtSeconds)) {
      this.jonhSays(this.reactionSelector.selectHeckle(this.missStreak));
    }
    this.jonhRenderer.setAlarm(replayFrameNow?.phase === 'pre' ? this.replayAlarm(replayFrameNow) : this.incomingAlarm());
    this.jonhRenderer.update(reactionSeconds);
    // A missed ball that is only rolling to a stop is fast-forwarded: scaled real time is fed to
    // the accumulator (with a matching step cap); the fixed step itself never changes.
    const fastForward = this.settleClock.advance(dtSeconds, this.fastForwardTarget());
    this.offerSkip(this.settleClock.isFastForwarding && this.attemptMachine.state === 'simulating');
    const steps = this.stepper.advance(timelineSeconds * fastForward, Math.ceil(PHYSICS.maxStepsPerFrame * fastForward));
    const stepMs = PHYSICS.fixedStepSeconds * MS_PER_SECOND;

    for (let i = 0; i < steps; i++) {
      this.matter.world.step(stepMs);
      if (this.attemptMachine.state === 'simulating' && this.simulateStep(reduced)) break;
    }

    // Walking Jonh follows the physics' route clock; the replay re-walks it in step with the ball.
    this.jonhRenderer.followRoute(this.physicsAdapter?.jonhRoutePoseAt(
      replayFrameNow?.phase === 'pre' ? replayFrameNow.simT : this.attemptMachine.simulatedTime) ?? null);
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

  /**
   * One fixed step of the live shot after Matter has stepped: contacts, trail, reactions and the
   * shot rules. Returns true when the shot resolved. `quiet` (Skip) drops per-bounce sound and dust.
   */
  private simulateStep(reduced: boolean, quiet = false): boolean {
    const state = this.physicsAdapter.stepProjectile(this.currentLevel, PROJECTILE.radiusMetres);
    if (!state) return false;
    // Sound follows the visible canvas; top exits still keep their valid flight path.
    const v = this.view;
    const bottom = v.bottom ?? v.height;
    if (!this.outOfCanvasSoundPlayed && (state.xPx < 0 || state.xPx > v.width ||
      state.yPx < bottom - v.height || state.yPx > bottom)) {
      this.outOfCanvasSoundPlayed = true;
      if (!quiet) this.audioManager.playOutOfBounds();
    }
    if (!state.hitJonh && Math.abs(state.vxSim) > 0.05) this.flightDir = Math.sign(state.vxSim);
    // [mechanics] A smashed pane or a portal plays its own effects and sound; it is not a bounce.
    // It always runs (even during Skip) so the renderer's broken panes and spent hoops stay right.
    const mechanicsEvent = this.sceneryRenderer.mechanics.onStep(state, reduced, this.audioManager);
    if (quiet || mechanicsEvent) this.prevVelocity = { vx: state.vxSim, vy: state.vySim };
    else this.detectBounce(state, reduced);
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
      this.activeReactionQuote = this.reactionSelector.selectReaction('hat', this.talkContext(state));
      this.jonhRenderer.triggerHatHit(this.activeReactionQuote, this.flightDir);
      this.playImpactMoment('hat', state.xPx, state.yPx, reduced);
    } else if (state.passedOverhead && !state.hitJonh && !state.hitHat && !this.overheadReactionTriggered && !this.hatReactionTriggered) {
      this.overheadReactionTriggered = true;
      this.activeReactionQuote = this.reactionSelector.selectReaction('overhead', { ...this.talkContext(state), missStreak: this.missStreak + 1 });
      this.jonhRenderer.triggerOverhead(this.activeReactionQuote);
    }

    const result = this.attemptMachine.step(PHYSICS.fixedStepSeconds, {
      x: state.xSim,
      y: state.ySim,
      speed: state.speedMs,
      hitBody: state.hitJonh,
      hitHat: state.hitHat,
    });
    if (!result.resolved) return false;
    this.handleResolution(result, state);
    return true;
  }

  /** What Jonh knows about this shot so far (for lines that fit the moment). */
  private talkContext(state: ProjectileState): ReactionContext {
    return {
      mapId: this.currentLevel.id,
      hatId: this.progress.selectedHat,
      obstacles: state.obstacleContacts.map(o => ({ id: o.id, material: o.material })),
    };
  }

  /** Jonh says a line (speech bubble plus a quiet mutter). */
  private jonhSays(line: string): void {
    this.jonhRenderer.triggerArrival(line);
    this.audioManager.playMutter(line.length);
  }

  /** How fast presentation time runs this frame: faster only while a landed miss rolls to a stop. */
  private fastForwardTarget(): number {
    const p = this.lastProjectileState;
    if (!p || this.attemptMachine.state !== 'simulating' || this.pendingLaunch) return 1;
    return fastForwardTarget({
      landed: p.firstGroundContact !== null || p.obstacleContacts.length > 0,
      speedMs: p.speedMs,
      distanceToJonhMetres: distanceToBox(p.xSim, p.ySim, this.physicsAdapter.jonhBodyBox(this.currentLevel)),
      impactActive: this.impactTimeline.isHolding || this.contact !== null || p.hitJonh,
    });
  }

  /** The Next pill turns into "Skip" while a missed ball is rolling to a stop. */
  private offerSkip(on: boolean): void {
    if (on === this.skipOffered) return;
    this.skipOffered = on;
    if (on) this.htmlControls.setResetLabel('Skip »');
    else if (this.attemptMachine?.state === 'simulating') this.htmlControls.setResetLabel('Aim again ↵');
  }

  /**
   * Skip: finishes a shot that is only rolling to a stop within this frame. It runs the very same
   * fixed steps the clock would have, so the outcome is unchanged; only waiting is removed.
   */
  private hurryShot(): boolean {
    if (this.activeMode === 'none' || this.sessionCoordinator?.isPaused || this.menuOverlay.isVisible() ||
      this.attemptMachine?.state !== 'simulating' || !this.settleClock.isFastForwarding) return false;
    const reduced = this.jonhRenderer.isReducedMotionActive();
    const stepMs = PHYSICS.fixedStepSeconds * MS_PER_SECOND;
    const maxSteps = Math.ceil(SHOT.timeoutSeconds / PHYSICS.fixedStepSeconds) + 1;
    for (let i = 0; i < maxSteps && this.attemptMachine.state === 'simulating'; i++) {
      this.matter.world.step(stepMs);
      if (this.simulateStep(reduced, true)) break;
    }
    this.stepper.reset();
    return true;
  }

  /**
   * Solo only: skips a shot's result window. `aimOnly` (aim keys or touching the field) skips just
   * a non-final miss, straight back to aiming; Space also skips a final miss or a hit's replay.
   */
  private skipResult(aimOnly: boolean): void {
    if (this.activeMode !== 'solo' || this.sessionCoordinator?.isPaused || this.menuOverlay.isVisible() ||
      this.attemptMachine?.state !== 'resolved') return;
    if (aimOnly && this.soloMachine?.state !== 'result') return;
    this.reset();
  }

  private handleResolution(result: { resolved: true; outcome: 'hit' | 'miss'; reason?: string; hadHatHit?: boolean }, state: ProjectileState): void {
    for (const obs of state.obstacleContacts) {
      this.classifier.recordContact({ role: 'obstacle', id: obs.id, ricochet: obs.ricochet });
    }
    if (state.hitGround) this.classifier.recordContact({ role: 'ground' });
    if (state.hitHat || result.hadHatHit) this.classifier.recordContact({ role: 'jonhHat' });
    if (state.hitJonh) this.classifier.recordContact({ role: 'jonhBody' });
    if (state.passedOverhead) this.classifier.recordOverhead();

    this.settleClock.reset();
    this.skipOffered = false;
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
      if (this.daily) this.dailyRun += shotCode(classification.outcome);
      this.soloCoordinator.resolveShot(isBodyHit, classification.outcome === 'ricochet_body');
    } else if (this.activeMode === 'multi' && !this.online?.inMatch) {
      this.multiCoordinator.resolveShot(classification.outcome);
      if (this.shotShooterIndex !== null) {
        this.lastPartyShot = { shooter: this.shotShooterIndex, outcome: classification.outcome };
        this.recordHighlight(this.shotShooterIndex, classification.outcome);
      }
    }

    const feedback = classifyShotOutcome(
      isBodyHit,
      isBodyHit ? state.xSim : state.firstGroundContact?.xSim ?? state.xSim,
      this.physicsAdapter.jonhBodyBox(this.currentLevel).minX,
      this.physicsAdapter.jonhBodyBox(this.currentLevel).maxX,
      { classifiedOutcome: classification.outcome, passedOverhead: state.passedOverhead, obstacleContacts: state.obstacleContacts },
    );

    this.missStreak = isBodyHit ? 0 : this.missStreak + 1;
    // Coach (rules/coach.ts): until the first hit ever, a solo miss names one fix for the next shot.
    if (this.activeMode === 'solo') {
      this.coachHint = !isBodyHit && coachActive(this.progress.totalHits)
        ? missHint({ category: feedback.category, angleDeg: this.currentAngleDeg, powerPercent: this.currentPowerPercent, blocked: state.obstacleContacts.length > 0,
          landedBeforeObstacle: this.landedBeforeObstacle(state) })
        : null;
    }
    const talk: ReactionContext = {
      ...this.talkContext(state),
      missStreak: this.missStreak,
      strength: quality === 'trick' ? 'trick' : quality === 'strong' ? 'strong' : 'weak',
      // Solo/daily only: multiplayer turns are shared, so streaks and "first shot" would mislead.
      ...(this.activeMode === 'solo' ? { firstShot: this.soloMachine.attemptsLeft === 2, hitStreak: this.progress.currentStreak + 1 } : {}),
    };
    const quote = isBodyHit
      ? this.reactionSelector.selectReaction(feedback.category, talk)
      : (this.activeReactionQuote ?? this.reactionSelector.selectReaction(feedback.category, talk));
    this.lastMissQuote = isBodyHit ? null : quote;
    if (!isBodyHit) this.audioManager.playMutter(quote.length);

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

    if (this.practice) {
      // Practice records nothing: no hits, streak, bests, stars or unlocks (SPEC §4.2).
      this.htmlControls.setResetLabel('Next now ↵');
      this.autoAdvance.schedule('shot', this.resultWindowSeconds(isBodyHit));
      return;
    }

    // Retention: hits, streak, three-star maps, daily results and cosmetic unlocks.
    const before = this.progress;
    let after = recordShot(before, classification.outcome, this.activeMode === 'solo', this.currentLevel.id);
    const soloFinished = this.activeMode === 'solo' && this.soloMachine.state === 'solo_result';
    if (soloFinished) {
      const res = this.soloMachine.result!;
      if (this.daily) after = recordDaily(after, this.daily.key, res.success ? res.stars : 0, this.dailyRun);
      else if (res.success) after = recordSoloFinish(after, this.currentLevel.id, res.stars);
    }
    // The solo bests before and after this result (the save itself is written after the contact
    // frame), for campaign stars and star-gated cosmetics.
    const soloBefore = { ...loadSaveData().solo };
    const soloAfter = { ...soloBefore };
    if (soloFinished && this.soloMachine.result!.success && !this.daily) {
      const res = this.soloMachine.result!;
      const prior = soloAfter[this.currentLevel.id];
      soloAfter[this.currentLevel.id] = { lastAngle: this.currentAngleDeg, lastPower: this.currentPowerPercent, ...prior,
        bestShots: prior?.bestShots != null ? Math.min(prior.bestShots, res.shotsUsed) : res.shotsUsed,
        hasStyle: Boolean(prior?.hasStyle) || res.hasStyle };
    }
    const unlocks = this.newUnlocks(before, after, soloBefore, soloAfter);
    const feats = newlyCompletedFeats(this.featInput(before, soloBefore), this.featInput(after, soloAfter));
    this.pendingFeats.push(...feats.map(f => f.name));
    this.progress = after;
    // Storage writes wait until after the contact frame so the hit-stop starts on time.
    setTimeout(() => saveProgress(after), 0);
    this.pendingUnlocks.push(...unlocks);
    if (this.activeMode === 'solo') this.htmlControls.setStreak(after.currentStreak);
    if (unlocks.length && this.activeMode === 'multi') {
      this.htmlControls.setFeedback(`New ${unlocks[0]!.kind} for Jonh: ${this.unlockName(unlocks[0]!)}!`, 'hit');
    } else if (feats.length && this.activeMode === 'multi') {
      this.htmlControls.setFeedback(`Feat: ${feats[0]!.name}!`, 'hit');
    }
    if (this.activeMode === 'multi') { this.pendingFeats = []; this.pendingUnlocks = []; }

    if (soloFinished) {
      const res = this.soloMachine.result!;
      const mapId = this.currentLevel.id;
      const previous = soloBefore[mapId]?.bestShots ?? null;
      const hadTrick = soloBefore[mapId]?.hasStyle ?? false;
      const campaignBefore = campaignStatus(MAP_IDS, soloBefore);
      const campaignAfter = campaignStatus(MAP_IDS, soloAfter);
      const nextMapId = !this.daily && res.success ? nextCampaignMap(campaignAfter, mapId) : null;
      const wasLocked = nextMapId !== null && !campaignBefore.find(e => e.mapId === nextMapId)?.unlocked;
      this.soloResultExtras = {
        newBest: !this.daily && res.success && (previous === null || res.shotsUsed < previous),
        quote,
        streak: after.currentStreak,
        unlockHtml: this.unlockHtml(this.pendingUnlocks),
        feats: [...new Set(this.pendingFeats)],
        nextMapId,
        unlockedMapId: wasLocked ? nextMapId : null,
        campaignStars: this.daily ? undefined : (({ stars, maxStars }) => ({ stars, maxStars }))(campaignTotals(campaignAfter)),
        newTrick: !this.daily && res.success && res.hasStyle && !hadTrick,
        practiceMapId: !this.daily && soloAfter[mapId]?.bestShots != null ? mapId : null,
        share: this.dailyResultShare(before, after),
      };
      this.pendingUnlocks = [];
      this.pendingFeats = [];
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

  /** The art groups for what Jonh and the cannon currently wear. */
  private cosmeticGroups(): string[] {
    return cosmeticArtGroups({ hat: this.progress.selectedHat, outfit: this.progress.selectedOutfit, cannon: this.progress.selectedCannon });
  }

  /** A hat as an image URL for HTML menus. */
  private hatImage(id: HatName): string {
    const cached = this.hatImages.get(id);
    if (cached) return cached;
    // Straight from the SVG: the hat texture may not be rasterized yet, and the menu <img> draws it crisply.
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artMeta(`hat-${id}`).svg)}`;
    this.hatImages.set(id, url);
    return url;
  }

  /** Everything earned by going from `before` to `after` (stars come from the solo bests). */
  private newUnlocks(before: Progress, after: Progress, soloBefore: ReturnType<typeof loadSaveData>['solo'], soloAfter: ReturnType<typeof loadSaveData>['solo']): Unlock[] {
    const ctxBefore = cosmeticContext(MAP_IDS, soloBefore);
    const ctxAfter = cosmeticContext(MAP_IDS, soloAfter);
    return [
      ...newlyUnlocked(before, after, MAP_IDS).map(id => ({ kind: 'hat' as const, id })),
      ...newlyUnlockedOutfits(before, after, ctxBefore, ctxAfter).map(id => ({ kind: 'outfit' as const, id })),
      ...newlyUnlockedCannonSkins(before, after, ctxBefore, ctxAfter).map(id => ({ kind: 'cannon' as const, id })),
    ];
  }

  private unlockName(u: Unlock): string {
    return u.kind === 'hat' ? HAT_RULES[u.id].name : u.kind === 'outfit' ? OUTFIT_RULES[u.id].name : CANNON_SKIN_RULES[u.id].name;
  }

  /** Preview art for an unlock (generated by our own code, so safe to embed). */
  private unlockArt(u: Unlock): string {
    if (u.kind === 'outfit') return outfitFigureSvg(u.id, this.progress.selectedHat);
    if (u.kind === 'cannon') return cannonSkinFigureSvg(u.id);
    const img = document.createElement('img');
    img.src = this.hatImage(u.id);
    img.alt = '';
    return img.outerHTML;
  }

  private unlockHtml(list: readonly Unlock[]): string {
    const unique = list.filter((u, i) => list.findIndex(v => v.kind === u.kind && v.id === u.id) === i);
    if (unique.length === 0) return '';
    // One compact card, however many things a single shot unlocks.
    const card = document.createElement('div');
    card.className = `unlock-card${unique.length > 1 ? ' unlock-many' : ''}`;
    const images = document.createElement('div');
    images.className = 'unlock-images';
    images.innerHTML = unique.slice(0, 4).map(u => `<span class="unlock-art unlock-${u.kind}">${this.unlockArt(u)}</span>`).join('');
    const text = document.createElement('div');
    const title = document.createElement('strong');
    const names = unique.map(u => this.unlockName(u));
    title.textContent = unique.length === 1 ? `New ${unique[0]!.kind}: ${names[0]}` : `${unique.length} new things for Jonh!`;
    text.append(title, document.createTextNode(unique.length === 1 ? 'Try it on in the wardrobe.'
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}. See the wardrobe.`));
    card.append(images, text);
    return card.outerHTML;
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
    const ctx = cosmeticContext(MAP_IDS, loadSaveData().solo);
    const owned = unlockedHats(this.progress, MAP_IDS).length + unlockedOutfits(this.progress, ctx).length + unlockedCannonSkins(this.progress, ctx).length;
    hats.textContent = `Wardrobe ${owned}/${HAT_ORDER.length + OUTFIT_ORDER.length + CANNON_SKIN_ORDER.length}`;
    hats.addEventListener('click', () => this.showLocker(), { signal });
    const feats = document.createElement('button');
    feats.type = 'button';
    feats.className = 'btn';
    feats.textContent = `Feats ${featsDone(this.featInput(this.progress, loadSaveData().solo))}/${FEATS.length}`;
    feats.addEventListener('click', () => this.showFeats(), { signal });
    row.append(daily, hats, feats);
  }

  /** Share extras for a finished daily run; a replay shares the day's counted (first) run, as the note says. */
  private dailyResultShare(before: Progress, after: Progress): SoloResultExtras['share'] {
    if (!this.daily) return undefined;
    const text = this.dailyShareFor(after, this.daily.key);
    if (!text) return undefined;
    return { text, note: this.daily.key in before.daily ? 'Replays are just for fun: Share sends your first run of the day.' : undefined };
  }

  /** The day's counted Daily Bonk run as text to share, or null if it hasn't been played. */
  private dailyShareFor(progress: Progress, key: string): string | null {
    const stars = progress.daily[key];
    if (stars === undefined) return null;
    return dailyShareText({ key, shots: progress.dailyShots[key] ?? '', stars, streak: dailyStreak(progress, new Date()),
      url: dailyLink(window.location.origin, window.location.pathname) });
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
      content.append(h, intro, art, status);
      const shareText = this.dailyShareFor(this.progress, key);
      if (shareText) {
        const share = shareBlock(shareText, signal, 'Share result');
        content.appendChild(share.block);
        actions.prepend(share.button);
      }
      content.appendChild(actions);
      play.focus();
    });
  }

  /** Jonh's wardrobe: every earned cosmetic, as tabs (hats today; more kinds plug in as sections). */
  private wardrobeTab = 'hats';

  private showLocker(): void {
    const mapIds = MAPS.map(m => m.id);
    const unlockedHatIds = new Set(unlockedHats(this.progress, mapIds));
    const ctx = cosmeticContext(MAP_IDS, loadSaveData().solo);
    const outfits = new Set(unlockedOutfits(this.progress, ctx));
    const skins = new Set(unlockedCannonSkins(this.progress, ctx));
    const choose = (patch: Partial<Progress>) => {
      this.progress = { ...this.progress, ...patch };
      saveProgress(this.progress);
      // A pick waits for its art; if the player has left the wardrobe meanwhile, don't reopen it.
      if (this.menuOverlay.getView() === 'locker') this.showLocker();
    };
    const sections: WardrobeSection[] = [{
      id: 'hats',
      title: 'Hats',
      items: HAT_ORDER.map(id => ({ id, name: HAT_RULES[id].name, hint: HAT_RULES[id].hint, unlocked: unlockedHatIds.has(id),
        selected: this.progress.selectedHat === id, image: this.hatImage(id) })),
      onSelect: id => whenArtReady(this, [hatGroup(id)], () => { this.attract?.stage.jonh.setHat(id as HatName); choose({ selectedHat: id as HatName }); }),
    }, {
      id: 'outfits',
      title: 'Outfits',
      items: OUTFIT_ORDER.map(id => ({ id, name: OUTFIT_RULES[id].name, hint: OUTFIT_RULES[id].hint, unlocked: outfits.has(id),
        selected: this.progress.selectedOutfit === id, svg: outfitFigureSvg(id, this.progress.selectedHat) })),
      onSelect: id => whenArtReady(this, [outfitGroup(id as OutfitId)], () => { this.attract?.stage.jonh.setOutfit(id as OutfitId); choose({ selectedOutfit: id as OutfitId }); }),
    }, {
      id: 'cannons',
      title: 'Cannons',
      items: CANNON_SKIN_ORDER.map(id => ({ id, name: CANNON_SKIN_RULES[id].name, hint: CANNON_SKIN_RULES[id].hint, unlocked: skins.has(id),
        selected: this.progress.selectedCannon === id, svg: cannonSkinFigureSvg(id) })),
      onSelect: id => whenArtReady(this, [cannonSkinGroup(id as CannonSkinId)], () => { this.attract?.stage.cannon.setSkin(id as CannonSkinId); choose({ selectedCannon: id as CannonSkinId }); }),
    }];
    const campaign = campaignTotals(campaignStatus(MAP_IDS, loadSaveData().solo));
    this.menuOverlay.showCustom('locker', (content, signal) => buildWardrobe(content, signal, {
      intro: 'Earn things by ruining his afternoon in new ways. Pick one; he will wear it everywhere.',
      stats: `Hits: ${this.progress.totalHits} · Best streak: ${this.progress.bestStreak} · Campaign ★ ${campaign.stars} / ${campaign.maxStars}`,
      sections,
      activeSection: this.wardrobeTab,
      onTab: id => { this.wardrobeTab = id; this.showLocker(); },
      onBack: () => this.menuOverlay.showHome(),
    }));
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
    const dvx = state.vxSim - prev.vx - this.levelPhys.windMs2 * PHYSICS.fixedStepSeconds;
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
    const reduced = this.jonhRenderer.isReducedMotionActive();
    // Cosmetic only: how hard it was fired shapes the flash, smoke, recoil, kick and boom.
    const power = clamp01(this.currentPowerPercent / 100);
    this.effects.launch(launch.x, launch.y, launch.angleRad, reduced, power);
    this.audioManager.playCannonFire(power);
    if (!reduced) {
      const k = FX.launchMinStrength + (1 - FX.launchMinStrength) * power;
      this.cameraRig.impact(FX.launchKickPx * k, 0.22, FX.shakeHz, -Math.cos(launch.angleRad), Math.sin(launch.angleRad), FX.launchPunch * power, 0.28);
      if (power >= FX.launchDustFrom) {
        // The surface under the wheels (the Valley cannon stands on a cliff).
        const pivot = this.cannonRenderer.pivot;
        this.effects.dust(pivot.x - 18, this.floorAt(pivot.x - 18, pivot.y), 0.5 + power, false);
      }
    }
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
    this.settleClock.reset();
    this.replay = null;
    this.replayCountdown = null;
    this.replayOverlay?.hide();
    this.cosmeticBall = null;
    this.pendingLaunch = null;
    this.impactQuality = null;
    this.effects?.reset();
    // [mechanics] Every pane whole and every portal ready again (SPEC §7.2).
    this.sceneryRenderer?.mechanics.reset();
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
    // Hot-seat only: a match still level after the tie-break goes to a sudden-death shoot-out.
    this.beginMatch(new MultiplayerMatchMachine(players, maps, Math.random, { suddenDeath: true }));
  }

  /** Shows a match from its machine: a fresh hot-seat match, or an online match fast-forwarded by replayMatch. */
  private beginMatch(machine: MultiplayerMatchMachine): void {
    this.hideAttract();
    this.stopShowcase();
    this.lastPartyShot = null;
    this.matchHighlights = [];
    this.activeMode = 'multi';
    this.multiMachine = machine;
    this.trailHistory.clear();
    this.loadMultiplayerMap(machine.currentMapId, () => this.updateUIPerMultiState());
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

  /** Builds the map's scene (waiting for its art if it has not been rasterized yet), then runs `then`. */
  private loadMultiplayerMap(mapId: string, then?: () => void): void {
    const token = ++this.loadToken;
    whenArtReady(this, [...levelArtGroups(mapId), ...this.cosmeticGroups(), ...playerBarrelGroups(this.multiMachine.players)], () => {
      if (token !== this.loadToken) return; // the player left (or started something else) meanwhile
      this.loadMultiplayerMapNow(mapId);
      // Paused while it loaded: the screen for this state is drawn on resume (onResume) instead.
      if (!this.sessionCoordinator.isPaused) then?.();
    });
  }

  private loadMultiplayerMapNow(mapId: string): void {
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
      this.currentLevel.bounds.minY,
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
    this.jonhRenderer = new JonhRenderer(this, this.currentLevel.jonhSpawn, ppm, h, { level: this.currentLevel, hatId: this.progress.selectedHat, outfitId: this.progress.selectedOutfit });
    this.jonhRenderer.setUiScale(this.textBoost / (this.view.zoom ?? 1));
    this.jonhRenderer.draw(false);
    const data = loadSaveData();
    this.jonhRenderer.setReducedMotion(data.settings.reducedMotion);
    this.jonhSays(this.reactionSelector.selectArrival(level.id, this.currentLevel.arrivalLine));

    const radiusPx = metresToPixels(PROJECTILE.radiusMetres, ppm);
    this.ballRenderer = new BallRenderer(this, radiusPx);
    this.trailRenderer = new TrailRenderer(this);
    this.trailRenderer.setView(this.view);
    this.trailRenderer.setTextBoost(this.textBoost);
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
    const match = this.multiMachine;
    const kicker = match.suddenDeath ? 'Sudden death'
      : match.roundCount > 1 && match.roundIndex === match.roundCount - 1 ? 'Final round' : `Round ${match.roundIndex + 1} of ${match.roundCount}`;
    playTitleCard(level.name, kicker, data.settings.reducedMotion);
    this.titleCardPending = !data.settings.reducedMotion;
  }

  private updateUIPerMultiState(): void {
    const match = this.multiMachine;
    // A round's chapter card pads only the handover that follows it (an online rebuild may land mid-turn).
    if (match.state !== 'handover') this.titleCardPending = false;
    if (match.state === 'handover') this.applyMultiplayerPosition();
    const shootOut = match.suddenDeath;
    this.htmlControls.setMatchStatus(shootOut ? `${this.currentLevel.name} · Sudden death${shootOut.round > 1 ? ` · round ${shootOut.round}` : ''}`
      : `${this.currentLevel.name} · Round ${Math.min(match.roundIndex + 1, match.roundCount)}/${match.roundCount} · Shot ${match.activeCycleIndex + 1}/${MULTIPLAYER.shotsPerRound}`,
      match.players, match.state === 'result' ? match.lastShooterIndex
        : match.state === 'round_result' || match.state === 'match_result' ? null : match.activePlayerIndex, match.state);
    this.htmlControls.setOnlinePresence(this.online?.playerPresence ?? null);
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
      // Party: what this shot means, and a word from whoever just scored.
      const left = shotsLeftPerPlayer(match.players.length, match.roundIndex, match.roundCount, match.shotIndexInRound);
      const stakes = shootOut
        ? suddenDeathStakes(shootOut, match.players.map(p => p.name), match.activePlayerIndex, shootOut.round >= MULTIPLAYER.suddenDeathRounds)
        : matchStakes(match.players.map((p, i) => ({ name: p.name, score: p.totalScore, bodyHits: p.bodyHits, shotsLeft: left[i] ?? 0 })),
          match.activePlayerIndex, { finalRound: match.roundCount > 1 && match.roundIndex === match.roundCount - 1, firstShotOfRound: match.shotIndexInRound === 0 });
      this.currentStakes = stakes;
      const prev = this.lastPartyShot;
      const tauntText = prev && prev.shooter !== match.activePlayerIndex ? tauntFor(prev.outcome) : null;
      const shooter = prev ? match.players[prev.shooter] : undefined;
      const taunt = tauntText && shooter ? { name: shooter.name, color: shooter.color, text: tauntText } : null;
      // The round's chapter card covers the first moment, so the first handover waits it out.
      const handoverSeconds = FLOW.handoverSeconds + (stakes.decisive ? FLOW.decisiveHandoverExtraSeconds : stakes.kicker || taunt ? FLOW.partyHandoverExtraSeconds : 0)
        + (this.titleCardPending ? TITLE_CARD_SECONDS : 0);
      this.titleCardPending = false;
      this.menuOverlay.showMPHandover(player, this.currentLevel.name, shootOut ? 0 : match.activePlayerShotNumber + 1, headline,
        { kicker: stakes.kicker, stakes: stakes.line, decisive: stakes.decisive, taunt, autoSeconds: handoverSeconds });
      if (stakes.decisive) this.audioManager.playDrumroll();
      this.autoAdvance.schedule('handover', handoverSeconds);
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
      const movement = match.moveCount > 0 ? ' · Jonh has moved—adjust your aim' : '';
      const status = this.online?.inMatch && match.activePlayerIndex !== this.online.mySeat
        ? `${match.activePlayer.name} is aiming…`
        : `${match.activePlayer.name}'s turn${this.currentStakes?.line ? ` · ${this.currentStakes.line}` : ''}${movement}`;
      this.htmlControls.setFeedback(status, 'info');
    } else if (match.state === 'round_result') {
      this.htmlControls.setControlsInert(true);
      this.menuOverlay.showMPRoundResult(match.players, match.roundIndex, match.roundCount, match.suddenDeathNext);
      this.autoAdvance.schedule('round', FLOW.roundResultSeconds);
      this.htmlControls.setCanFire(false);
      this.htmlControls.setFeedback('', 'info');
      this.htmlControls.setResetLabel('Continue ↵');
    } else if (match.state === 'match_result') {
      this.htmlControls.setControlsInert(true);
      // The winning shot, replayed, before the scores (once per match; skippable).
      if (this.showcaseState === 'none') this.showcaseState = this.startWinningShowcase() ? 'playing' : 'done';
      if (this.showcaseState === 'playing') return;
      this.menuOverlay.showMPMatchResult(match.getWinners(), match.players, this.online?.inMatch ? this.online.resultExtras() : undefined,
        shootOut ? (match.getWinners().length > 1 ? `Still level after ${shootOut.round} sudden-death rounds. A shared win!` : 'Won in sudden death!') : undefined);
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
      WORLD.pixelsPerMetre, WORLD.designHeightPx, { level: this.currentLevel, hatId: this.progress.selectedHat, outfitId: this.progress.selectedOutfit });
    this.jonhRenderer.setUiScale(this.textBoost / (this.view.zoom ?? 1));
    this.jonhRenderer.setReducedMotion(loadSaveData().settings.reducedMotion);
    this.jonhRenderer.draw(false);
    this.jonhSays(this.reactionSelector.selectReaction('moved'));
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
      this.loadMultiplayerMap(this.multiMachine.currentMapId, () => this.updateUIPerMultiState());
      return;
    }
    this.updateUIPerMultiState();
  }

  /** Remembers a body hit for the winning-shot replay (map, Jonh's spot and the exact aim). */
  private recordHighlight(player: number, outcome: ClassifiedOutcome): void {
    if (outcome !== 'body' && outcome !== 'ricochet_body') return;
    const match = this.multiMachine;
    this.matchHighlights.push({ player, mapId: match.currentMapId, positionId: match.activePositionId,
      angle: this.currentAngleDeg, power: this.currentPowerPercent, outcome });
  }

  /**
   * Plays the winner's best hit again (a trick shot if they had one, else their latest hit) in the
   * ShowcaseScene over the game. Returns false when there is nothing to show.
   */
  private startWinningShowcase(): boolean {
    if (loadSaveData().settings.reducedMotion || this.jonhRenderer?.isReducedMotionActive()) return false;
    const winners = new Set(this.multiMachine.getWinners().map(w => w.id));
    const hits = this.matchHighlights.filter(h => winners.has(h.player));
    // A shoot-out winner's latest hit is the one that decided it; otherwise their best (a trick shot first).
    const decidedBySuddenDeath = this.multiMachine.suddenDeath?.winners?.length === 1;
    const best = decidedBySuddenDeath ? hits[hits.length - 1] : [...hits].reverse().find(h => h.outcome === 'ricochet_body') ?? hits[hits.length - 1];
    const base = best ? MAPS.find(m => m.id === best.mapId) : undefined;
    if (!best || !base) return false;
    const level = levelAtMultiplayerPosition(base, best.positionId);
    const shot = this.recordedShot(level, best.angle, best.power);
    if (shot.contactIndex === null) return false; // a cross-browser difference: nothing honest to show
    const player = this.multiMachine.players[best.player]!;
    document.body.classList.add('showcase-on');
    this.scene.launch('ShowcaseScene', {
      level, shot, angleDeg: best.angle, powerPercent: best.power,
      playerName: player.name, color: player.color, pattern: player.pattern,
      hatId: this.progress.selectedHat, outfitId: this.progress.selectedOutfit, reducedMotion: false,
      line: this.reactionSelector.selectWinningShot(),
      textBoost: this.textBoost,
      audio: this.audioManager,
      onDone: () => {
        document.body.classList.remove('showcase-on');
        if (this.showcaseState !== 'playing') return;
        this.showcaseState = 'done';
        if (this.activeMode === 'multi' && this.multiMachine.state === 'match_result') this.updateUIPerMultiState();
      },
    });
    return true;
  }

  /** Stops a winning-shot replay without showing the result (rematch, Home, a rebuilt online match). */
  private stopShowcase(): void {
    this.showcaseState = 'none';
    document.body.classList.remove('showcase-on');
    if (this.scene.isActive('ShowcaseScene') || this.scene.isPaused('ShowcaseScene')) this.scene.stop('ShowcaseScene');
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
      refreshPlayerPresence: () => this.htmlControls.setOnlinePresence(this.online?.playerPresence ?? null),
      playEmoteSound: () => this.audioManager.playEmote(),
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
    const shooter = this.multiMachine.lastShooterIndex;
    if (shooter !== null) {
      this.lastPartyShot = { shooter, outcome };
      this.recordHighlight(shooter, outcome);
    }
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
    const after = recordShot(before, outcome, false, this.currentLevel?.id);
    const solo = loadSaveData().solo;
    const unlocks = this.newUnlocks(before, after, solo, solo);
    const feats = newlyCompletedFeats(this.featInput(before, solo), this.featInput(after, solo));
    this.progress = after;
    setTimeout(() => saveProgress(after), 0);
    if (unlocks.length) this.htmlControls.setFeedback(`New ${unlocks[0]!.kind} for Jonh: ${this.unlockName(unlocks[0]!)}!`, 'hit');
    else if (feats.length) this.htmlControls.setFeedback(`Feat: ${feats[0]!.name}!`, 'hit');
  }

  /** What the feats look at (rules/feats.ts): progress plus the campaign totals from a set of solo bests. */
  private featInput(progress: Progress, solo: ReturnType<typeof loadSaveData>['solo']): FeatInput {
    return { progress, ctx: cosmeticContext(MAP_IDS, solo), mapIds: MAP_IDS };
  }

  /** Jonh's long-term goal list: every feat with its progress and the cosmetics it earns. */
  private showFeats(): void {
    const input = this.featInput(this.progress, loadSaveData().solo);
    const statuses = featStatuses(input);
    // A reward stays earned even when its feat now asks for more (new gardens raise "every star").
    const earned = (r: Unlock): boolean => r.kind === 'hat' ? unlockedHats(input.progress, MAP_IDS).includes(r.id)
      : r.kind === 'outfit' ? unlockedOutfits(input.progress, input.ctx).includes(r.id) : unlockedCannonSkins(input.progress, input.ctx).includes(r.id);
    this.menuOverlay.showCustom('feats', (content, signal) => buildFeats(content, signal, {
      groups: FEAT_GROUPS.map(group => ({
        title: group.title,
        rows: statuses.filter(s => s.def.group === group.id).map(s => ({
          id: s.def.id, name: s.def.name, hint: s.def.hint, current: s.current, target: s.target, done: s.done,
          rewards: s.def.rewards.map(r => ({ name: this.unlockName(r), art: this.unlockArt(r), kind: r.kind, earned: earned(r) })),
        })),
      })),
      onBack: () => this.menuOverlay.showHome(),
      onWardrobe: () => this.showLocker(),
    }));
  }


}




