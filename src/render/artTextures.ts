import type Phaser from 'phaser';
import { ATLAS_LIMITS, isTiledArt, packAtlas, pageSvg, type AtlasCell, type AtlasPage } from '../art/atlasPack';
import type { ArtDef } from '../art/svgKit';

const META = new Map<string, ArtDef>();

export function artMeta(key: string): ArtDef {
  const def = META.get(key);
  if (!def) throw new Error(`Unknown art ${key}`);
  return def;
}

/** Decodes an SVG document and draws it on a canvas of the given pixel size. */
async function rasterizeSvg(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const rasterize = (def: ArtDef) => rasterizeSvg(def.svg, Math.ceil(def.w * def.scale), Math.ceil(def.h * def.scale));

/**
 * Copies each cell's border pixels outwards into its gutter (what CLAMP_TO_EDGE does for a lone texture), so
 * bilinear sampling at a cell's edge never blends in a neighbour or transparent black. The strips are copied
 * from a snapshot of the page: no pixel readback, and no page-sized copy per strip.
 */
function extrudeCells(canvas: HTMLCanvasElement, cells: readonly AtlasCell[], gutter: number): void {
  const snapshot = document.createElement('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  snapshot.getContext('2d')!.drawImage(canvas, 0, 0);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (const { x, y, w, h } of cells) {
    for (let g = 1; g <= gutter; g++) {
      ctx.drawImage(snapshot, x, y, w, 1, x, y - g, w, 1);
      ctx.drawImage(snapshot, x, y + h - 1, w, 1, x, y + h - 1 + g, w, 1);
      ctx.drawImage(snapshot, x, y, 1, h, x - g, y, 1, h);
      ctx.drawImage(snapshot, x + w - 1, y, 1, h, x + w - 1 + g, y, 1, h);
    }
    // Corners: the nearest cell corner pixel.
    for (let gx = 1; gx <= gutter; gx++) {
      for (let gy = 1; gy <= gutter; gy++) {
        ctx.drawImage(snapshot, x, y, 1, 1, x - gx, y - gy, 1, 1);
        ctx.drawImage(snapshot, x + w - 1, y, 1, 1, x + w - 1 + gx, y - gy, 1, 1);
        ctx.drawImage(snapshot, x, y + h - 1, 1, 1, x - gx, y + h - 1 + gy, 1, 1);
        ctx.drawImage(snapshot, x + w - 1, y + h - 1, 1, 1, x + w - 1 + gx, y + h - 1 + gy, 1, 1);
      }
    }
  }
}

let atlasPages = 0;

/** Rasterizes one atlas page once, then gives every art key a texture that shares the page's GPU texture. */
async function addAtlasPage(scene: Phaser.Scene, page: AtlasPage): Promise<void> {
  const [canvas, { default: PhaserRuntime }] = await Promise.all([rasterizeSvg(pageSvg(page), page.w, page.h), import('phaser')]);
  extrudeCells(canvas, page.cells, ATLAS_LIMITS.gutter);
  const pageTexture = scene.textures.addCanvas(`atlas-page-${atlasPages++}`, canvas);
  if (!pageTexture) throw new Error('Could not create an atlas page texture');
  const source = pageTexture.source[0]!;
  const manager = scene.textures;
  for (const cell of page.cells) {
    if (manager.exists(cell.def.key)) continue;
    const view = new PhaserRuntime.Textures.Texture(manager, cell.def.key, [], cell.w, cell.h);
    view.source.push(source);
    view.add('__BASE', 0, cell.x, cell.y, cell.w, cell.h);
    (manager.list as Record<string, Phaser.Textures.Texture>)[cell.def.key] = view;
  }
}

/** Registers sizes/pivots without textures (tests, or art loaded elsewhere). */
export function registerArtMeta(defs: readonly ArtDef[]): void {
  for (const def of defs) META.set(def.key, def);
}

/**
 * Rasterizes the given definitions (skipping ones that exist). Small art is packed into atlas pages that are
 * decoded once; tiled art and anything too big for a page gets a texture of its own.
 */
export async function loadArt(scene: Phaser.Scene, defs: readonly ArtDef[]): Promise<void> {
  const todo = defs.filter(def => !scene.textures.exists(def.key));
  const packable = todo.filter(def => !isTiledArt(def.key));
  const { pages, oversize } = packAtlas(packable);
  const alone = [...todo.filter(def => isTiledArt(def.key)), ...oversize];
  await Promise.all([
    ...pages.map(page => addAtlasPage(scene, page)),
    ...alone.map(async def => {
      const canvas = await rasterize(def);
      if (!scene.textures.exists(def.key)) scene.textures.addCanvas(def.key, canvas);
    }),
  ]);
  for (const def of defs) META.set(def.key, def);
}

/* ---------- Lazy groups ----------
 * Sizes and pivots of every piece of art are known from the start (registerArtGroups); the pixels of a
 * group are rasterized the first time ensureArt asks for it. */
const GROUP_DEFS = new Map<string, readonly ArtDef[]>();
const KEY_GROUP = new Map<string, string>();
const loadedGroups = new Set<string>();
const pendingGroups = new Map<string, Promise<void>>();

export function registerArtGroups(groups: ReadonlyMap<string, readonly ArtDef[]>): void {
  for (const [group, defs] of groups) {
    GROUP_DEFS.set(group, defs);
    for (const def of defs) { META.set(def.key, def); KEY_GROUP.set(def.key, group); }
  }
}

/** True when every group has been rasterized (so a scene can be built from it synchronously). */
export function artReady(groups: readonly string[]): boolean {
  return groups.every(group => loadedGroups.has(group));
}

/**
 * Rasterizes the groups that are not yet loaded, all in one batch (so their small art shares atlas pages).
 * Rejects if the batch fails to decode.
 */
export function ensureArt(scene: Phaser.Scene, groups: readonly string[]): Promise<void> {
  const waits: Promise<void>[] = [];
  const fresh: string[] = [];
  for (const group of new Set(groups)) {
    if (loadedGroups.has(group)) continue;
    const pending = pendingGroups.get(group);
    if (pending) { waits.push(pending); continue; }
    if (!GROUP_DEFS.has(group)) { console.error(`Unknown art group ${group}`); continue; }
    fresh.push(group);
  }
  if (fresh.length > 0) {
    const batch = loadArt(scene, fresh.flatMap(group => GROUP_DEFS.get(group)!))
      .then(() => { for (const group of fresh) loadedGroups.add(group); })
      .finally(() => { for (const group of fresh) pendingGroups.delete(group); });
    for (const group of fresh) pendingGroups.set(group, batch);
    waits.push(batch);
  }
  return waits.length === 0 ? Promise.resolve() : Promise.all(waits).then(() => undefined);
}

/**
 * Runs `run` once the groups are on the GPU: immediately when they already are, otherwise after loading them.
 * A failed decode is logged and `run` still happens (a missing texture is better than a stuck menu).
 */
export function whenArtReady(scene: Phaser.Scene, groups: readonly string[], run: () => void): void {
  if (artReady(groups)) { run(); return; }
  ensureArt(scene, groups).catch((error: unknown) => console.error('Hit Jonh failed to prepare art', error)).then(run);
}

/** Fire-and-forget load of whatever group a texture key belongs to (for draw loops that guard on exists()). */
export function requestArtKey(scene: Phaser.Scene, key: string): void {
  const group = KEY_GROUP.get(key);
  if (group && !loadedGroups.has(group)) ensureArt(scene, [group]).catch((error: unknown) => console.error('Hit Jonh failed to prepare art', error));
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
