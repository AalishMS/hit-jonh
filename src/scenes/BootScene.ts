import Phaser from 'phaser';
import { ART_GROUPS, CORE_GROUP, cosmeticArtGroups, levelArtGroups } from '../art/library';
import { preloadSamples } from '../audio/audioManager';
import { ensureArt, registerArtGroups } from '../render/artTextures';
import { loadComicWords } from '../render/comicWords';
import { loadProgress } from '../storage/storage';
import { pickAttractLevel } from './attractLevel';

/**
 * Rasterizes the art the title screen needs (the core set, what Jonh and the cannon wear, one garden),
 * waits for the two typefaces and prefetches sound, then starts the game. Everything else is rasterized
 * when a map, hat, outfit, cannon or player colour first needs it (src/render/artTextures.ts).
 */
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
    const mark = (name: string) => () => { performance.mark(`hj-${name}`); };
    performance.mark('hj-boot-create');
    registerArtGroups(ART_GROUPS);
    const progress = loadProgress();
    const groups = [
      CORE_GROUP,
      ...cosmeticArtGroups({ hat: progress.selectedHat, outfit: progress.selectedOutfit, cannon: progress.selectedCannon }),
      ...levelArtGroups(pickAttractLevel().id),
    ];
    Promise.all([ensureArt(this, groups).then(mark('art-done')), fonts.then(mark('fonts-done')), sound.then(mark('sound-done'))])
      .then(() => { loadComicWords(this); performance.mark('hj-boot-done'); this.scene.start('PrototypeScene'); })
      .catch((error: unknown) => {
        console.error('Hit Jonh failed to prepare art', error);
        this.game.events.emit('boot-failed');
      });
  }
}
