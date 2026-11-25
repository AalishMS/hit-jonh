import type { ArtDef } from './svgKit';

/**
 * Packs many small SVG art definitions into a few atlas pages so each page is decoded and rasterized once
 * (one image decode costs tens of milliseconds on a phone whatever its size). Pure: no DOM, no Phaser.
 */
export interface AtlasCell {
  def: ArtDef;
  /** Pixel rectangle inside the page (the rasterized size of the art: logical size × scale). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasPage {
  w: number;
  h: number;
  cells: AtlasCell[];
}

export interface AtlasLimits {
  /** Widest/tallest page in pixels. */
  maxSize: number;
  /** Transparent-then-extruded border around every cell, so bilinear sampling never sees a neighbour. */
  gutter: number;
}

export const ATLAS_LIMITS: AtlasLimits = { maxSize: 2048, gutter: 2 };

/** Rasterized pixel size of a definition. */
export function cellSize(def: ArtDef): { w: number; h: number } {
  return { w: Math.max(1, Math.ceil(def.w * def.scale)), h: Math.max(1, Math.ceil(def.h * def.scale)) };
}

/** Shelf packing, tallest first. A definition bigger than a page (plus gutters) is returned in `oversize`. */
export function packAtlas(defs: readonly ArtDef[], limits: AtlasLimits = ATLAS_LIMITS): { pages: AtlasPage[]; oversize: ArtDef[] } {
  const { maxSize, gutter } = limits;
  const sized = defs.map(def => ({ def, ...cellSize(def) }));
  const oversize = sized.filter(c => c.w + gutter * 2 > maxSize || c.h + gutter * 2 > maxSize).map(c => c.def);
  const fits = sized.filter(c => c.w + gutter * 2 <= maxSize && c.h + gutter * 2 <= maxSize)
    .sort((a, b) => b.h - a.h || b.w - a.w || (a.def.key < b.def.key ? -1 : 1));
  const pages: AtlasPage[] = [];
  let page: AtlasPage | null = null;
  let cursorX = 0;
  let rowY = 0;
  let rowH = 0;
  for (const c of fits) {
    const slotW = c.w + gutter * 2;
    const slotH = c.h + gutter * 2;
    if (page && cursorX + slotW > maxSize) { rowY += rowH; cursorX = 0; rowH = 0; }
    if (!page || rowY + slotH > maxSize) { page = { w: 0, h: 0, cells: [] }; pages.push(page); cursorX = 0; rowY = 0; rowH = 0; }
    page.cells.push({ def: c.def, x: cursorX + gutter, y: rowY + gutter, w: c.w, h: c.h });
    cursorX += slotW;
    rowH = Math.max(rowH, slotH);
    page.w = Math.max(page.w, cursorX);
    page.h = Math.max(page.h, rowY + slotH);
  }
  return { pages, oversize };
}

/** Gives every id in one cell's markup a cell-specific prefix, so cells can share one SVG document. */
export function prefixSvgIds(markup: string, prefix: string): string {
  return markup
    .replace(/\bid="([^"]*)"/g, (_m, id: string) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]*)\)/g, (_m, id: string) => `url(#${prefix}${id})`)
    .replace(/\bhref="#([^"]*)"/g, (_m, id: string) => `href="#${prefix}${id}"`);
}

/** The body of an art SVG without its outer <svg> element. */
export function svgInner(svg: string): string {
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}

/** One SVG document that draws every cell of a page at its rectangle. */
export function pageSvg(page: AtlasPage): string {
  const cells = page.cells.map((cell, i) => {
    const { def } = cell;
    return `<svg x="${cell.x}" y="${cell.y}" width="${cell.w}" height="${cell.h}" viewBox="0 0 ${def.w} ${def.h}" preserveAspectRatio="none">${prefixSvgIds(svgInner(def.svg), `a${i}_`)}</svg>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.w}" height="${page.h}" viewBox="0 0 ${page.w} ${page.h}">${cells}</svg>`;
}

/** Textures drawn as repeating tile sprites keep a texture of their own: an atlas cell cannot wrap. */
export function isTiledArt(key: string): boolean {
  return /^(far|mid|stars|ground-top|earth)(-|$)/.test(key) || key === 'fence-back';
}
