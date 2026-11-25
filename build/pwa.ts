import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { PAL } from '../src/art/palette.ts';

/**
 * Offline install (production builds only): a web app manifest, install icons and a small hand-written
 * service worker that precaches the built assets. See docs/progress.md "Mobile performance and install".
 */

export const CACHE_PREFIX = 'hit-jonh-';

/** Files in dist/ that the service worker precaches: everything the game needs to run offline. */
export function precacheList(files: readonly string[]): string[] {
  return files
    .map(file => file.split(sep).join('/'))
    .filter(file => !file.endsWith('.map') && file !== 'sw.js' && !file.startsWith('licenses/'))
    .sort();
}

/** A new cache name whenever any precached file's name or content changes. */
export function cacheVersion(entries: ReadonlyArray<{ file: string; bytes: Uint8Array | string }>): string {
  const hash = createHash('sha256');
  for (const { file, bytes } of [...entries].sort((a, b) => (a.file < b.file ? -1 : 1))) {
    hash.update(file).update('\0').update(bytes).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

export function webManifest(): Record<string, unknown> {
  return {
    name: 'Hit Jonh',
    short_name: 'Hit Jonh',
    description: 'Set the angle, set the power, hit Jonh.',
    start_url: './',
    scope: './',
    id: './',
    // Fullscreen where the browser allows it (a cannon game wants every pixel), standalone otherwise.
    display: 'standalone',
    display_override: ['fullscreen', 'standalone'],
    // Both orientations work (portrait shows a "turn your phone" hint); landscape is just roomier.
    orientation: 'any',
    theme_color: PAL.skyTop,
    background_color: PAL.paper,
    categories: ['games'],
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function pwaPlugin(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'hit-jonh-pwa',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
      root = config.root;
    },
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icons/apple-touch-icon.png' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Hit Jonh' }, injectTo: 'head' },
      ];
    },
    closeBundle: {
      order: 'post',
      handler() {
        writeFileSync(join(outDir, 'manifest.webmanifest'), `${JSON.stringify(webManifest(), null, 2)}\n`);
        const files = precacheList(walk(outDir).map(path => relative(outDir, path)));
        const version = cacheVersion(files.map(file => ({ file, bytes: readFileSync(join(outDir, file)) })));
        const template = readFileSync(join(root, 'build', 'sw.template.js'), 'utf8');
        writeFileSync(join(outDir, 'sw.js'), template
          .replace('__CACHE_PREFIX__', CACHE_PREFIX)
          .replace('__CACHE_VERSION__', version)
          .replace('__PRECACHE__', JSON.stringify(files)));
      },
    },
  };
}
