import Phaser from 'phaser';
import { PHYSICS, WORLD } from './config/tuning';
import { BootScene } from './scenes/BootScene';
import { PrototypeScene } from './scenes/PrototypeScene';
import { matterGravityY } from './sim/units';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#5EC2EC',
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
  scene: [BootScene, PrototypeScene],
};

const statusEl = document.getElementById('game-status');

function showBootError(message = 'Failed to load Hit Jonh.'): void {
  if (statusEl) {
    statusEl.removeAttribute('hidden');
    statusEl.className = 'boot-status boot-error';
    statusEl.textContent = '';
    const span = document.createElement('span');
    span.textContent = message + ' ';
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn btn-retry';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => location.reload());
    statusEl.append(span, retryBtn);
  }
}

try {
  const game = new Phaser.Game(config);

  game.events.once(Phaser.Core.Events.READY, () => {
    if (statusEl) {
      statusEl.setAttribute('hidden', '');
    }
  });

  // Expose for dev-only inspection in the browser console.
  if (import.meta.env.DEV) {
    (window as unknown as { __HIT_JONH__: Phaser.Game }).__HIT_JONH__ = game;
  }
} catch {
  showBootError();
}
