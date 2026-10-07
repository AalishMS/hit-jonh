import Phaser from 'phaser';
import { ALL_ART } from '../art/library';
import { preloadSamples } from '../audio/audioManager';
import { loadArt } from '../render/artTextures';

/** Rasterizes the SVG art, waits for the two typefaces and prefetches sound, then starts the game. */
export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create(): void {
    const fonts = typeof document !== 'undefined' && document.fonts
      ? Promise.all([
        document.fonts.load('64px "Luckiest Guy"'),
        document.fonts.load('800 17px Nunito'),
      ]).catch(() => undefined)
      : Promise.resolve();
    // Sound is optional: never hold the game for it longer than briefly.
    const sound = Promise.race([preloadSamples(), new Promise(resolve => setTimeout(resolve, 2500))]);
    Promise.all([loadArt(this, ALL_ART), fonts, sound])
      .then(() => this.scene.start('PrototypeScene'))
      .catch((error: unknown) => {
        console.error('Hit Jonh failed to prepare art', error);
        this.game.events.emit('boot-failed');
      });
  }
}
