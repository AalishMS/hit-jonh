import Phaser from 'phaser';
import { WORLD } from './config/tuning';
import { BootScene } from './scenes/BootScene';
import { PrototypeScene } from './scenes/PrototypeScene';
import { ShowcaseScene } from './scenes/ShowcaseScene';
import { matterWorldConfig } from './config/matterWorld';

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
    // Fixed-step, no sleeping, and the tested contact solver (config/matterWorld.ts).
    matter: matterWorldConfig(import.meta.env.DEV && new URLSearchParams(location.search).has('debug')),
  },
  scene: [BootScene, PrototypeScene, ShowcaseScene],
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

  // Phaser only polls its parent's size every 500 ms of game time, so entering a game (the HUD and
  // aim bar change the stage size) used to show a cropped canvas first. Refit the moment it changes.
  const stage = document.getElementById('game');
  if (stage && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => game.scale.getParentBounds() && game.scale.refresh()).observe(stage);
  }

  // Expose for dev-only inspection in the browser console; `?tune` opens the FX tuning panel.
  if (import.meta.env.DEV) {
    (window as unknown as { __HIT_JONH__: Phaser.Game }).__HIT_JONH__ = game;
    if (new URLSearchParams(location.search).has('tune')) void import('./ui/tuningPanel').then(m => m.mountTuningPanel());
  }
} catch {
  showBootError();
}
