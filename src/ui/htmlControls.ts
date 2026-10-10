import { AIM, PROJECTILE } from '../config/tuning';
import { powerToLaunchSpeed } from '../sim/units';
import { PlayerPanel, type OnlinePlayerPresence } from './playerPanel';
import type { MPState, MPPlayerView } from '../rules/multiplayerMatch';

export interface HTMLControlsCallbacks {
  onAngleChange: (angleDeg: number) => void;
  onPowerChange: (powerPercent: number) => void;
  onFire: () => void;
  onReset: () => void;
  onToggleDebug: (enabled: boolean) => void;
  onToggleMute: () => boolean;
  onPause?: () => void;
  onHome?: () => void;
}

const ICON = {
  soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5-5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.4" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4" fill="currentColor"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.5 12 4l8.5 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 10v9.5h4.2v-5.2h2.6v5.2h4.2V10" fill="currentColor"/></svg>',
};

/**
 * The in-game HUD, laid over the canvas: score chips, icon buttons, the result caption, a big
 * Fire button where a thumb rests. The native, accessible Angle/Power sliders live in a bar below
 * the canvas (not over it), as a precise alternative to in-world dragging.
 */
export class HTMLControls {
  private container: HTMLElement;
  private angleSlider!: HTMLInputElement;
  private angleValueLabel!: HTMLElement;
  private powerSlider!: HTMLInputElement;
  private powerValueLabel!: HTMLElement;
  private speedLabel!: HTMLElement;
  private fireButton!: HTMLButtonElement;
  private resetButton!: HTMLButtonElement;
  private muteButton!: HTMLButtonElement;
  private pauseButton!: HTMLButtonElement;
  private debugToggle!: HTMLInputElement;
  private feedbackBanner!: HTMLElement;
  private homeButton: HTMLButtonElement;
  private matchStatus!: HTMLElement;
  private attemptsEl!: HTMLElement;
  private streakEl!: HTMLElement;
  private readonly aimBar: HTMLElement;
  private readonly playerPanel: PlayerPanel;

  private cleanupListeners: Array<() => void> = [];

  constructor(
    parentElement: HTMLElement,
    private readonly callbacks: HTMLControlsCallbacks,
    initialAngleDeg = 45,
    initialPowerPercent = 50,
    initialDebug = false,
    initialMuted = false,
  ) {
    this.playerPanel = new PlayerPanel(parentElement.closest('.stage-wrap') ?? parentElement);
    this.container = document.createElement('section');
    this.container.className = 'controls-panel hud';
    this.container.setAttribute('aria-label', 'Cannon Controls');

    this.homeButton = document.createElement('button');
    this.homeButton.type = 'button';
    this.homeButton.className = 'icon-btn game-home-button';
    this.homeButton.setAttribute('aria-label', 'Home');
    this.homeButton.innerHTML = `${ICON.home}<span class="visually-hidden">Home</span>`;
    const onHome = () => this.callbacks.onHome?.();
    this.homeButton.addEventListener('click', onHome);
    this.cleanupListeners.push(() => this.homeButton.removeEventListener('click', onHome));
    document.body.appendChild(this.homeButton);

    // Precise aim lives below the canvas, in normal flow, never over the game.
    this.aimBar = document.createElement('section');
    this.aimBar.className = 'aim-bar';
    this.aimBar.setAttribute('aria-label', 'Precise aim');
    (parentElement.closest('.stage-wrap') ?? parentElement).after(this.aimBar);
    this.render(initialAngleDeg, initialPowerPercent, initialDebug, initialMuted);
    parentElement.appendChild(this.container);
  }

  private on<K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void): void {
    el.addEventListener(type, fn);
    this.cleanupListeners.push(() => el.removeEventListener(type, fn));
  }

  private render(angle: number, power: number, debug: boolean, muted: boolean): void {
    this.container.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <div class="match-status" aria-label="Map and scores"></div>
          <div class="attempts" aria-label="Attempts left"></div>
          <div class="streak" hidden></div>
        </div>
        <div class="hud-icons">
          <button type="button" class="icon-btn btn-mute" id="mute-btn"></button>
          <button type="button" class="icon-btn btn-pause" id="pause-btn" aria-label="Pause">${ICON.pause}<span class="visually-hidden">Pause</span></button>
        </div>
      </div>
      <div class="feedback-banner feedback-info" id="shot-feedback" role="status" aria-live="polite"></div>
      <div class="hud-bottom">
        <div class="fire-cluster">
          <button type="button" class="pill-btn btn-reset" id="reset-btn">Aim again</button>
          <button type="button" class="btn-fire" id="fire-btn"><span class="fire-word">Fire</span><small>Space</small></button>
        </div>
      </div>
      <div class="debug-group" ${debug ? '' : 'hidden'}>
        <label class="toggle-label" for="debug-toggle"><input type="checkbox" id="debug-toggle" ${debug ? 'checked' : ''} /><span>Debug View</span></label>
      </div>
    `;
    this.aimBar.innerHTML = `
      <div class="control-group">
        <label for="angle-slider">Angle</label>
        <input type="range" id="angle-slider" min="${AIM.minAngleDeg}" max="${AIM.maxAngleDeg}" step="${AIM.angleStepDeg}" value="${angle}" />
        <span class="value-badge" id="angle-value">${angle}°</span>
      </div>
      <div class="control-group">
        <label for="power-slider">Power</label>
        <input type="range" id="power-slider" min="0" max="100" step="${AIM.powerStepPercent}" value="${power}" />
        <span class="value-badge" id="power-value">${power}%</span>
      </div>
      <div class="sub-label" id="speed-indicator" hidden>Launch Speed: ${this.calcSpeed(power)} m/s</div>
    `;

    const q = <T extends HTMLElement>(sel: string) =>
      (this.container.querySelector(sel) ?? this.aimBar.querySelector(sel)) as T;
    this.angleSlider = q('#angle-slider');
    this.angleValueLabel = q('#angle-value');
    this.powerSlider = q('#power-slider');
    this.powerValueLabel = q('#power-value');
    this.speedLabel = q('#speed-indicator');
    this.fireButton = q('#fire-btn');
    this.resetButton = q('#reset-btn');
    this.muteButton = q('#mute-btn');
    this.pauseButton = q('#pause-btn');
    this.debugToggle = q('#debug-toggle');
    this.feedbackBanner = q('#shot-feedback');
    this.matchStatus = q('.match-status');
    this.attemptsEl = q('.attempts');
    this.streakEl = q('.streak');
    this.setMuted(muted);

    this.on(this.angleSlider, 'input', () => {
      const val = Number.parseInt(this.angleSlider.value, 10);
      this.angleValueLabel.textContent = `${val}°`;
      this.callbacks.onAngleChange(val);
    });
    this.on(this.powerSlider, 'input', () => {
      const val = Number.parseInt(this.powerSlider.value, 10);
      this.powerValueLabel.textContent = `${val}%`;
      this.speedLabel.textContent = `Launch Speed: ${this.calcSpeed(val)} m/s`;
      this.callbacks.onPowerChange(val);
    });
    this.on(this.fireButton, 'click', () => this.callbacks.onFire());
    this.on(this.resetButton, 'click', () => this.callbacks.onReset());
    this.on(this.muteButton, 'click', () => this.setMuted(this.callbacks.onToggleMute()));
    this.on(this.pauseButton, 'click', () => this.callbacks.onPause?.());
    this.on(this.debugToggle, 'change', () => this.callbacks.onToggleDebug(this.debugToggle.checked));
  }

  private launchSpeed = (power: number): number => powerToLaunchSpeed(power, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg);

  private calcSpeed(power: number): string {
    return this.launchSpeed(power).toFixed(1);
  }

  /** The current map's power → speed mapping (some maps scale the cannon). */
  setLaunchSpeed(fn: (power: number) => number): void {
    this.launchSpeed = fn;
    this.speedLabel.textContent = `Launch Speed: ${this.calcSpeed(Number(this.powerSlider.value))} m/s`;
  }

  private previousCanFire = false;

  setValues(angle: number, power: number): void {
    this.angleSlider.value = String(angle);
    this.angleValueLabel.textContent = `${angle}°`;
    this.powerSlider.value = String(power);
    this.powerValueLabel.textContent = `${power}%`;
    this.speedLabel.textContent = `Launch Speed: ${this.calcSpeed(power)} m/s`;
  }

  setCanFire(allowed: boolean): void {
    this.previousCanFire = allowed;
    this.fireButton.disabled = !allowed;
    this.angleSlider.disabled = !allowed;
    this.powerSlider.disabled = !allowed;
    this.container.classList.toggle('can-fire', allowed);
  }

  setControlsInert(inert: boolean): void {
    (this.container as HTMLElement & { inert?: boolean }).inert = inert;
    if (inert) {
      this.fireButton.disabled = true;
      this.resetButton.disabled = true;
      this.angleSlider.disabled = true;
      this.powerSlider.disabled = true;
      this.pauseButton.disabled = true;
    } else {
      this.resetButton.disabled = false;
      this.pauseButton.disabled = false;
      this.setCanFire(this.previousCanFire);
    }
  }

  /** Online spectators: the panel stays live (Mute/Pause) while Reset is off; Fire and the sliders follow setCanFire. */
  setResetEnabled(enabled: boolean): void {
    this.resetButton.disabled = !enabled;
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? '' : 'none';
    this.homeButton.hidden = !visible;
    this.aimBar.hidden = !visible;
    document.body.classList.toggle('in-game', visible);
    this.playerPanel.setVisible(visible);
  }

  setMatchStatus(mapName: string, players: readonly MPPlayerView[], activeIndex: number | null = null, state: MPState = 'aiming'): void {
    this.matchStatus.replaceChildren();
    const label = document.createElement('strong');
    label.className = 'map-chip';
    label.textContent = mapName;
    this.matchStatus.appendChild(label);
    this.playerPanel.update(players, activeIndex, state);
    if (players.length) { this.setAttempts(null); this.setStreak(0); }
  }

  setOnlinePresence(presence: OnlinePlayerPresence | null): void {
    this.playerPanel.setOnlinePresence(presence);
  }

  /** Solo attempt pips (cannonballs); null hides them. */
  setAttempts(left: number | null, total = 3): void {
    this.attemptsEl.replaceChildren();
    this.attemptsEl.hidden = left === null;
    if (left === null) return;
    this.attemptsEl.setAttribute('aria-label', `${left} of ${total} attempts left`);
    for (let i = 0; i < total; i++) {
      const pip = document.createElement('i');
      pip.className = i < left ? 'pip' : 'pip used';
      this.attemptsEl.appendChild(pip);
    }
  }

  /** Consecutive solo hits; shown from two upward. */
  setStreak(count: number): void {
    this.streakEl.hidden = count < 2;
    this.streakEl.textContent = `Streak ×${count}`;
  }

  setDebugOptIn(optIn: boolean): void {
    const debugGroup = this.container.querySelector('.debug-group') as HTMLElement | null;
    if (debugGroup) debugGroup.hidden = !optIn;
  }

  setResetLabel(label: string): void {
    this.resetButton.textContent = label;
    this.resetButton.classList.toggle('is-next', /next|continue/i.test(label));
  }

  setMuted(muted: boolean): void {
    this.muteButton.innerHTML = `${muted ? ICON.soundOff : ICON.soundOn}<span class="visually-hidden">${muted ? 'Sound off' : 'Sound on'}</span>`;
    this.muteButton.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
    this.muteButton.setAttribute('aria-pressed', String(muted));
  }

  /** Short caption on screen; `spoken` adds detail for screen readers only (e.g. Jonh's quote). */
  setFeedback(message: string, type: 'info' | 'hit' | 'miss' | 'simulating' = 'info', spoken = ''): void {
    this.feedbackBanner.replaceChildren(document.createTextNode(message));
    if (spoken) {
      const sr = document.createElement('span');
      sr.className = 'visually-hidden';
      sr.textContent = ` ${spoken}`;
      this.feedbackBanner.appendChild(sr);
    }
    this.feedbackBanner.className = `feedback-banner feedback-${type}`;
    if (message) {
      void this.feedbackBanner.offsetWidth;
      this.feedbackBanner.classList.add('show');
    }
  }

  destroy(): void {
    this.playerPanel.destroy();
    this.homeButton.remove();
    this.aimBar.remove();
    for (const cleanup of this.cleanupListeners) cleanup();
    this.cleanupListeners = [];
    this.container.remove();
  }
}
