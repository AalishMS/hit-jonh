import { describe, expect, it } from 'vitest';
import { cacheVersion, precacheList, webManifest } from '../build/pwa';
import { PAL } from '../src/art/palette';

describe('PWA build helpers', () => {
  it('precaches what the game needs offline and nothing else', () => {
    expect(precacheList(['index.html', 'sw.js', 'assets/main-abc.js', 'assets/main-abc.js.map', 'audio/hit.ogg', 'licenses/OFL.txt', 'manifest.webmanifest']))
      .toEqual(['assets/main-abc.js', 'audio/hit.ogg', 'index.html', 'manifest.webmanifest']);
  });

  it('changes the cache name when any file name or content changes, and only then', () => {
    const base = [{ file: 'a.js', bytes: 'one' }, { file: 'b.css', bytes: 'two' }];
    const same = cacheVersion([...base].reverse());
    expect(cacheVersion(base)).toBe(same);
    expect(cacheVersion([{ file: 'a.js', bytes: 'one!' }, base[1]!])).not.toBe(same);
    expect(cacheVersion([{ file: 'c.js', bytes: 'one' }, base[1]!])).not.toBe(same);
    expect(same).toMatch(/^[0-9a-f]{12}$/);
  });

  it('describes an installable standalone app in the game palette', () => {
    const manifest = webManifest() as { name: string; display: string; theme_color: string; start_url: string; icons: Array<{ sizes: string; purpose: string; type: string }> };
    expect(manifest.name).toBe('Hit Jonh');
    expect(['standalone', 'fullscreen']).toContain(manifest.display);
    expect(manifest.theme_color).toBe(PAL.skyTop);
    expect(manifest.start_url).toBe('./');
    expect(manifest.icons.some(i => i.sizes === '192x192' && i.type === 'image/png')).toBe(true);
    expect(manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(manifest.icons.some(i => i.purpose === 'maskable')).toBe(true);
  });
});
