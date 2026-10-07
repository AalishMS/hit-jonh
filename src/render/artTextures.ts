import type Phaser from 'phaser';
import type { ArtDef } from '../art/svgKit';

const META = new Map<string, ArtDef>();

export function artMeta(key: string): ArtDef {
  const def = META.get(key);
  if (!def) throw new Error(`Unknown art ${key}`);
  return def;
}

async function rasterize(def: ArtDef): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(def.svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(def.w * def.scale));
  canvas.height = Math.max(1, Math.ceil(def.h * def.scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Registers sizes/pivots without textures (tests, or art loaded elsewhere). */
export function registerArtMeta(defs: readonly ArtDef[]): void {
  for (const def of defs) META.set(def.key, def);
}

/** Rasterizes every SVG art definition once into a Phaser canvas texture. */
export async function loadArt(scene: Phaser.Scene, defs: readonly ArtDef[]): Promise<void> {
  const todo = defs.filter(def => !scene.textures.exists(def.key));
  const canvases = await Promise.all(todo.map(rasterize));
  todo.forEach((def, i) => {
    META.set(def.key, def);
    scene.textures.addCanvas(def.key, canvases[i]!);
  });
  for (const def of defs) META.set(def.key, def);
}

/** Adds an art texture as an Image whose pivot and size are in logical pixels. */
export function artImage(scene: Phaser.Scene, x: number, y: number, key: string): Phaser.GameObjects.Image {
  const def = artMeta(key);
  return scene.add.image(x, y, key).setOrigin(def.ax / def.w, def.ay / def.h).setScale(1 / def.scale);
}

/** Same as artImage but not yet on the display list (for containers). */
export function makeArtImage(scene: Phaser.Scene, x: number, y: number, key: string): Phaser.GameObjects.Image {
  const def = artMeta(key);
  return scene.make.image({ x, y, key } as Phaser.Types.GameObjects.Sprite.SpriteConfig, false).setOrigin(def.ax / def.w, def.ay / def.h).setScale(1 / def.scale);
}

/** Changes texture while keeping logical size and pivot. */
export function setArt(image: Phaser.GameObjects.Image, key: string, sx = 1, sy = 1): void {
  const def = artMeta(key);
  if (image.texture.key !== key) image.setTexture(key).setOrigin(def.ax / def.w, def.ay / def.h);
  image.setScale(sx / def.scale, sy / def.scale);
}

export function artScale(key: string): number {
  return 1 / artMeta(key).scale;
}
