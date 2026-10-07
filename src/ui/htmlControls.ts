import { AIM, PROJECTILE } from '../config/tuning';
import { cssColor, playerDisplayColor } from '../art/palette';
import { powerToLaunchSpeed } from '../sim/units';
import type { MPPlayerView } from '../rules/multiplayerMatch';

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
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="9" cy="7" r="2.8" fill="currentColor"/><circle cx="15" cy="17" r="2.8" fill="currentColor"/></svg>',
};

const PRECISE_KEY = 'hitJonh.v1.preciseOpen';

/**
 * The in-game HUD, laid over the canvas: score chips, icon buttons, the result caption, a big
 * Fire button where a thumb rests and a collapsible "Precise aim" panel that keeps the native,
 * accessible sliders as a fallback to in-world dragging.
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
  private preciseToggle!: HTMLButtonElement;
  private debugToggle!: HTMLInputElement;
  private feedbackBanner!: HTMLElement;
  private homeButton: HTMLButtonElement;
  private matchStatus!: HTMLElement;
  private attemptsEl!: HTMLElement;

  private cleanupListeners: Array<() => void> = [];

  constructor(
    parentElement: HTMLElement,
    private readonly callbacks: HTMLControlsCallbacks,
    initialAngleDeg = 45,
    initialPowerPercent = 50,
    initialDebug = false,
    initialMuted = false,
  ) {
    this.container = document.createElement('section');
    this.container.className = 'controls-panel hud';
    this.container.setAttribute('aria-label', 'Cannon Controls');

    this.render(initialAngleDeg, initialPowerPercent, initialDebug, initialMuted);
    parentElement.appendChild(this.container);
    this.homeButton = document.createElement('button');
    this.homeButton.type = 'button';
    this.homeButton.className = 'icon-btn game-home-button';
    this.homeButton.setAttribute('aria-label', 'Home');
    this.homeButton.innerHTML = `${ICON.home}<span class="visually-hidden">Home</span>`;
    const onHome = () => this.callbacks.onHome?.();
    this.homeButton.addEventListener('click', onHome);
    this.cleanupListeners.push(() => this.homeButton.removeEventListener('click', onHome));
    document.body.appendChild(this.homeButton);
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
        <div class="precise">
            <button type="button" class="pill-btn precise-toggle" id="precise-toggle" aria-expanded="false" aria-controls="precise-panel">${ICON.sliders}<span>Precise aim</span></button>
            <div class="precise-panel" id="precise-panel">
              <div class="control-group">
                <div class="control-label-row"><label for="angle-slider">Angle</label><span class="value-badge" id="angle-value">${angle}°</span></div>
                <input type="range" id="angle-slider" min="${AIM.minAngleDeg}" max="${AIM.maxAngleDeg}" step="${AIM.angleStepDeg}" value="${angle}" />
              </div>
              <div class="control-group">
                <div class="control-label-row"><label for="power-slider">Power</label><span class="value-badge" id="power-value">${power}%</span></div>
                <input type="range" id="power-slider" min="0" max="100" step="${AIM.powerStepPercent}" value="${power}" />
                <div class="sub-label" id="speed-indicator" hidden>Launch Speed: ${this.calcSpeed(power)} m/s</div>
              </div>
              <p class="control-help">Drag the cannon, or drag the field: ↕ angle, ↔ power. Keys: ← → angle, ↑ ↓ power, Space fires.</p>
            </div>
          </div>
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

    const q = <T extends HTMLElement>(sel: string) => this.container.querySelector(sel) as T;
    this.angleSlider = q('#angle-slider');
    this.angleValueLabel = q('#angle-value');
    this.powerSlider = q('#power-slider');
    this.powerValueLabel = q('#power-value');
    this.speedLabel = q('#speed-indicator');
    this.fireButton = q('#fire-btn');
    this.resetButton = q('#reset-btn');
    this.muteButton = q('#mute-btn');
    this.pauseButton = q('#pause-btn');
    this.preciseToggle = q('#precise-toggle');
    this.debugToggle = q('#debug-toggle');
    this.feedbackBanner = q('#shot-feedback');
    this.matchStatus = q('.match-status');
    this.attemptsEl = q('.attempts');
    this.setMuted(muted);
    this.setPreciseOpen(this.readPreciseOpen());

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
    this.on(this.preciseToggle, 'click', () => this.setPreciseOpen(this.preciseToggle.getAttribute('aria-expanded') !== 'true', true));
    this.on(this.debugToggle, 'change', () => this.callbacks.onToggleDebug(this.debugToggle.checked));
  }

  private readPreciseOpen(): boolean {
    try { return localStorage.getItem(PRECISE_KEY) === '1'; } catch { return false; }
  }

  private setPreciseOpen(open: boolean, persist = false): void {
    this.preciseToggle.setAttribute('aria-expanded', String(open));
    this.container.classList.toggle('precise-open', open);
    if (persist) { try { localStorage.setItem(PRECISE_KEY, open ? '1' : '0'); } catch { /* per-viewer convenience only */ } }
  }

  private calcSpeed(power: number): string {
    return powerToLaunchSpeed(power, AIM.minImpulseNs, AIM.maxImpulseNs, PROJECTILE.massKg).toFixed(1);
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

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? '' : 'none';
    this.homeButton.hidden = !visible;
    document.body.classList.toggle('in-game', visible);
  }

  setMatchStatus(mapName: string, players: readonly MPPlayerView[], activeIndex: number | null = null): void {
    this.matchStatus.replaceChildren();
    const label = document.createElement('strong');
    label.className = 'map-chip';
    label.textContent = mapName;
    this.matchStatus.appendChild(label);
    for (const player of players) {
      const score = document.createElement('span');
      score.className = `player-score${player.id === activeIndex ? ' active' : ''}`;
      score.style.setProperty('--player-color', cssColor(playerDisplayColor(player.color)));
      const name = document.createElement('span');
      name.className = 'player-name';
      name.textContent = player.name;
      const pts = document.createElement('b');
      pts.textContent = String(player.totalScore);
      score.append(name, pts);
      this.matchStatus.appendChild(score);
    }
    if (players.length) this.setAttempts(null);
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
    this.homeButton.remove();
    for (const cleanup of this.cleanupListeners) cleanup();
    this.cleanupListeners = [];
    this.container.remove();
  }
}
