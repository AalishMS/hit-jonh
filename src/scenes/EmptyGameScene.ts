import Phaser from 'phaser';
import { PHYSICS, WORLD } from '../config/tuning';
import { FixedStepper } from '../sim/fixedStep';
import { MS_PER_SECOND } from '../sim/units';

/**
 * Placeholder scene that proves the toolchain: Phaser renders, Matter is
 * initialised with manual fixed stepping, and the page scales correctly.
 * Gameplay is intentionally absent until Milestone 1.
 */
export class EmptyGameScene extends Phaser.Scene {
  private readonly stepper = new FixedStepper(PHYSICS.fixedStepSeconds, PHYSICS.maxStepsPerFrame);

  constructor() {
    super('EmptyGameScene');
  }

  create(): void {
    const { designWidthPx: w, designHeightPx: h } = WORLD;

    // Placeholder ground strip.
    this.add.rectangle(w / 2, h - 40, w, 80, 0x6fbf4a).setStrokeStyle(4, 0x2b2118);

    this.add
      .text(w / 2, h / 2 - 30, 'Hit Jonh', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '72px',
        fontStyle: 'bold',
        color: '#e8572a',
        stroke: '#2b2118',
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, h / 2 + 40, 'Empty scene — gameplay arrives in Milestone 1.', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        color: '#2b2118',
      })
      .setOrigin(0.5);

    // Drop any backlog when the tab is hidden/restored.
    this.game.events.on(Phaser.Core.Events.HIDDEN, () => this.stepper.reset());
    this.game.events.on(Phaser.Core.Events.VISIBLE, () => this.stepper.reset());
  }

  override update(_time: number, deltaMs: number): void {
    const steps = this.stepper.advance(deltaMs / MS_PER_SECOND);
    const stepMs = PHYSICS.fixedStepSeconds * MS_PER_SECOND;
    for (let i = 0; i < steps; i++) {
      this.matter.world.step(stepMs);
    }
  }
}
