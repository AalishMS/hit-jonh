import { describe, expect, it } from 'vitest';
import { ATLAS_LIMITS, isTiledArt, packAtlas, pageSvg, prefixSvgIds, cellSize } from '../src/art/atlasPack';
import type { ArtDef } from '../src/art/svgKit';

const def = (key: string, w: number, h: number, scale = 1, svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}"/></svg>`): ArtDef =>
  ({ key, w, h, ax: 0, ay: 0, scale, svg });

describe('packAtlas', () => {
  it('places every definition once, inside its page, with gutters and no overlap', () => {
    const defs = Array.from({ length: 80 }, (_, i) => def(`a${i}`, 20 + (i * 7) % 90, 15 + (i * 13) % 70, 1 + (i % 3)));
    const { pages, oversize } = packAtlas(defs, { maxSize: 512, gutter: 2 });
    expect(oversize).toEqual([]);
    const placed = pages.flatMap(p => p.cells.map(c => ({ page: p, cell: c })));
    expect(placed.map(p => p.cell.def.key).sort()).toEqual(defs.map(d => d.key).sort());
    for (const { page, cell } of placed) {
      expect(cell.x).toBeGreaterThanOrEqual(2);
      expect(cell.y).toBeGreaterThanOrEqual(2);
      expect(cell.x + cell.w + 2).toBeLessThanOrEqual(page.w);
      expect(cell.y + cell.h + 2).toBeLessThanOrEqual(page.h);
      expect(page.w).toBeLessThanOrEqual(512);
      expect(page.h).toBeLessThanOrEqual(512);
      expect({ w: cell.w, h: cell.h }).toEqual(cellSize(cell.def));
    }
    for (const page of pages) {
      const cells = page.cells;
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i]!;
          const b = cells[j]!;
          // Slots (cell plus gutter on every side) never overlap, so extruded borders never touch a neighbour.
          const apart = a.x + a.w + 2 <= b.x - 2 || b.x + b.w + 2 <= a.x - 2 || a.y + a.h + 2 <= b.y - 2 || b.y + b.h + 2 <= a.y - 2;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it('is deterministic', () => {
    const defs = [def('b', 30, 40), def('a', 30, 40), def('c', 10, 90)];
    expect(JSON.stringify(packAtlas(defs))).toBe(JSON.stringify(packAtlas([...defs].reverse())));
  });

  it('sets oversize art aside and rounds fractional sizes up', () => {
    const { pages, oversize } = packAtlas([def('big', 3000, 10), def('odd', 10.2, 5.5, 2)]);
    expect(oversize.map(d => d.key)).toEqual(['big']);
    expect(pages[0]!.cells[0]).toMatchObject({ w: 21, h: 11 });
    expect(ATLAS_LIMITS.maxSize).toBeLessThanOrEqual(4096);
  });
});

describe('page SVG', () => {
  it('prefixes ids and their references so cells cannot collide', () => {
    const out = prefixSvgIds('<clipPath id="g"/><g clip-path="url(#g)" fill="url(#g2)"/><use href="#g"/>', 'a1_');
    expect(out).toBe('<clipPath id="a1_g"/><g clip-path="url(#a1_g)" fill="url(#a1_g2)"/><use href="#a1_g"/>');
  });

  it('draws two art pieces that both use the id "g" in one document without clashing', () => {
    const one = def('one', 10, 10, 1, '<svg xmlns="http://www.w3.org/2000/svg"><clipPath id="g"><rect/></clipPath><g clip-path="url(#g)"/></svg>');
    const two = def('two', 10, 10, 1, '<svg xmlns="http://www.w3.org/2000/svg"><clipPath id="g"><circle/></clipPath><g clip-path="url(#g)"/></svg>');
    const svg = pageSvg(packAtlas([one, two]).pages[0]!);
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(svg).toContain('viewBox="0 0 10 10"');
  });

  it('keeps tiled textures out of atlases', () => {
    for (const key of ['far-backyard', 'mid-moon', 'stars-moon', 'ground-top', 'ground-top-valley', 'earth', 'earth-moon', 'fence-back']) expect(isTiledArt(key)).toBe(true);
    for (const key of ['sky-backyard', 'jonh-head', 'cannon-wheel', 'obs-fence-wall', 'farm-sign']) expect(isTiledArt(key)).toBe(false);
  });
});
