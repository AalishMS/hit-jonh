import Phaser from 'phaser';
import { PHYSICS, WORLD } from './config/tuning';
import { PrototypeScene } from './scenes/PrototypeScene';
import { matterGravityY } from './sim/units';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#bfe6ff',
  width: WORLD.designWidthPx,
  height: WORLD.designHeightPx,
  scale: {
    // Scale the fixed logical world to the container; physics never sees screen size.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      // Simulation is stepped manually from a fixed-step accumulator (SPEC.md §7).
      autoUpdate: false,
      gravity: {
        x: 0,
        y: matterGravityY(PHYSICS.gravity, WORLD.pixelsPerMetre, PHYSICS.matterGravityScale),
      },
      enableSleeping: false,
      debug: import.meta.env.DEV && new URLSearchParams(location.search).has('debug'),
    },
  },
  scene: [PrototypeScene],
};

const game = new Phaser.Game(config);

// Expose for dev-only inspection in the browser console.
if (import.meta.env.DEV) {
  (window as unknown as { __HIT_JONH__: Phaser.Game }).__HIT_JONH__ = game;
}
