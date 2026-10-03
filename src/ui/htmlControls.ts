import { AIM, PROJECTILE } from '../config/tuning';
import { powerToLaunchSpeed } from '../sim/units';

export interface HTMLControlsCallbacks {
  onAngleChange: (angleDeg: number) => void;
  onPowerChange: (powerPercent: number) => void;
  onFire: () => void;
  onReset: () => void;
  onToggleDebug: (enabled: boolean) => void;
}

export class HTMLControls {
  private container: HTMLElement;
  private angleSlider!: HTMLInputElement;
  private angleValueLabel!: HTMLElement;
  private powerSlider!: HTMLInputElement;
  private powerValueLabel!: HTMLElement;
  private speedLabel!: HTMLElement;
  private fireButton!: HTMLButtonElement;
  private resetButton!: HTMLButtonElement;
  private debugToggle!: HTMLInputElement;
  private feedbackBanner!: HTMLElement;

  private cleanupListeners: Array<() => void> = [];

  constructor(
    parentElement: HTMLElement,
    private readonly callbacks: HTMLControlsCallbacks,
    initialAngleDeg = 45,
    initialPowerPercent = 50,
    initialDebug = false,
  ) {
    this.container = document.createElement('section');
    this.container.className = 'controls-panel';
    this.container.setAttribute('aria-label', 'Cannon Controls');

    this.render(initialAngleDeg, initialPowerPercent, initialDebug);
    parentElement.appendChild(this.container);
  }

  private render(angle: number, power: number, debug: boolean): void {
    this.container.innerHTML = `
      <div class="feedback-banner" id="shot-feedback">Ready. Set angle and power, then click Fire!</div>
      <div class="controls-row">
        <div class="control-group">
          <div class="control-label-row">
            <label for="angle-slider">Angle</label>
            <span class="value-badge" id="angle-value">${angle}°</span>
          </div>
          <input
            type="range"
            id="angle-slider"
            min="${AIM.minAngleDeg}"
            max="${AIM.maxAngleDeg}"
            step="${AIM.angleStepDeg}"
            value="${angle}"
          />
        </div>

        <div class="control-group">
          <div class="control-label-row">
            <label for="power-slider">Power</label>
            <span class="value-badge" id="power-value">${power}%</span>
          </div>
          <input
            type="range"
            id="power-slider"
            min="0"
            max="100"
            step="${AIM.powerStepPercent}"
            value="${power}"
          />
          <div class="sub-label" id="speed-indicator">Launch Speed: ${this.calcSpeed(power)} m/s</div>
        </div>

        <div class="actions-group">
          <button type="button" class="btn btn-fire" id="fire-btn">🔥 Fire</button>
          <button type="button" class="btn btn-reset" id="reset-btn">🔄 Reset</button>
        </div>

        <div class="debug-group">
          <label class="toggle-label" for="debug-toggle">
            <input type="checkbox" id="debug-toggle" ${debug ? 'checked' : ''} />
            <span>Debug View</span>
          </label>
        </div>
      </div>
    `;

    this.angleSlider = this.container.querySelector('#angle-slider') as HTMLInputElement;
    this.angleValueLabel = this.container.querySelector('#angle-value') as HTMLElement;
    this.powerSlider = this.container.querySelector('#power-slider') as HTMLInputElement;
    this.powerValueLabel = this.container.querySelector('#power-value') as HTMLElement;
    this.speedLabel = this.container.querySelector('#speed-indicator') as HTMLElement;
    this.fireButton = this.container.querySelector('#fire-btn') as HTMLButtonElement;
    this.resetButton = this.container.querySelector('#reset-btn') as HTMLButtonElement;
    this.debugToggle = this.container.querySelector('#debug-toggle') as HTMLInputElement;
    this.feedbackBanner = this.container.querySelector('#shot-feedback') as HTMLElement;

    // Attach listeners and track cleanup
    const onAngleInput = () => {
      const val = Number.parseInt(this.angleSlider.value, 10);
      this.angleValueLabel.textContent = `${val}°`;
      this.callbacks.onAngleChange(val);
    };
    this.angleSlider.addEventListener('input', onAngleInput);
    this.cleanupListeners.push(() => this.angleSlider.removeEventListener('input', onAngleInput));

    const onPowerInput = () => {
      const val = Number.parseInt(this.powerSlider.value, 10);
      this.powerValueLabel.textContent = `${val}%`;
      this.speedLabel.textContent = `Launch Speed: ${this.calcSpeed(val)} m/s`;
      this.callbacks.onPowerChange(val);
    };
    this.powerSlider.addEventListener('input', onPowerInput);
    this.cleanupListeners.push(() => this.powerSlider.removeEventListener('input', onPowerInput));

    const onFireClick = () => {
      this.callbacks.onFire();
    };
    this.fireButton.addEventListener('click', onFireClick);
    this.cleanupListeners.push(() => this.fireButton.removeEventListener('click', onFireClick));

    const onResetClick = () => {
      this.callbacks.onReset();
    };
    this.resetButton.addEventListener('click', onResetClick);
    this.cleanupListeners.push(() => this.resetButton.removeEventListener('click', onResetClick));

    const onDebugChange = () => {
      this.callbacks.onToggleDebug(this.debugToggle.checked);
    };
    this.debugToggle.addEventListener('change', onDebugChange);
    this.cleanupListeners.push(() => this.debugToggle.removeEventListener('change', onDebugChange));
  }

  private calcSpeed(power: number): string {
    return powerToLaunchSpeed(
      power,
      AIM.minImpulseNs,
      AIM.maxImpulseNs,
      PROJECTILE.massKg,
    ).toFixed(1);
  }

  setValues(angle: number, power: number): void {
    this.angleSlider.value = String(angle);
    this.angleValueLabel.textContent = `${angle}°`;
    this.powerSlider.value = String(power);
    this.powerValueLabel.textContent = `${power}%`;
    this.speedLabel.textContent = `Launch Speed: ${this.calcSpeed(power)} m/s`;
  }

  setCanFire(allowed: boolean): void {
    this.fireButton.disabled = !allowed;
    this.angleSlider.disabled = !allowed;
    this.powerSlider.disabled = !allowed;
  }

  setFeedback(message: string, type: 'info' | 'hit' | 'miss' | 'simulating' = 'info'): void {
    this.feedbackBanner.textContent = message;
    this.feedbackBanner.className = `feedback-banner feedback-${type}`;
  }

  destroy(): void {
    for (const cleanup of this.cleanupListeners) {
      cleanup();
    }
    this.cleanupListeners = [];
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
