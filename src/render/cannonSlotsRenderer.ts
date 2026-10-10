import type Phaser from 'phaser';
import { barrelKey } from '../art/cannonArt';
import { PAL } from '../art/palette';
import { MULTIPLAYER, WORLD } from '../config/tuning';
import { artImage, artScale } from './artTextures';

export interface SlotPlayer {
  readonly name: string;
  readonly color: number;
  readonly pattern: string;
}

/**
 * Decorative, labelled cannons for the players who are not shooting.
 * Render-only: no physics bodies, no influence on the launch position.
 * They rest in the earth strip below the ground surface, outside the playfield.
 */
export class CannonSlotsRenderer {
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  /** `zoom` is the map's resting camera zoom: slots keep their on-screen size and spacing. */
  draw(players: readonly SlotPlayer[], activeIndex: number, zoom = 1): void {
    this.clear();
    const S = MULTIPLAYER.slots;
    const k = 1 / zoom;
    // The strip below the ground surface, anchored to the canvas bottom (world y = design height).
    const y = WORLD.designHeightPx - (WORLD.designHeightPx - S.yPx) * k;
    let slot = 0;
    players.forEach((player, i) => {
      if (i === activeIndex) return;
      const x = (S.startXPx + slot * S.spacingPx) * k;
      slot++;
      const key = barrelKey(player.color, player.pattern);
      const barrel = artImage(this.scene, x + 14 * k, y, this.scene.textures.exists(key) ? key : 'cannon-barrel').setDepth(5);
      barrel.setScale(artScale('cannon-barrel') * 0.62 * k).setRotation(-0.08);
      this.objects.push(barrel);
      this.objects.push(this.scene.add.text(x + 72 * k, y, `${player.name} · ${player.pattern}`, {
        fontFamily: 'Nunito, system-ui, sans-serif', fontStyle: '900', fontSize: `${S.labelFontPx}px`, color: PAL.ink,
      }).setOrigin(0, 0.5).setScale(k).setResolution(2).setDepth(5));
    });
  }

  private clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }

  destroy(): void { this.clear(); }
}
