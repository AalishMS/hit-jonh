/* Hit Jonh service worker (production builds only; generated into dist/sw.js by build/pwa.ts).
 *
 * - install: precache every built asset under a cache named for this build.
 * - activate: delete every other Hit Jonh cache and take over open pages.
 * - fetch: same-origin GET only. Pages are network-first (a new deploy shows up on the next load) and fall
 *   back to the cached shell offline; built assets are cache-first. Anything cross-origin (the Convex
 *   backend) or not a GET is never touched, so online rooms always go straight to the network.
 */
const CACHE_PREFIX = '__CACHE_PREFIX__';
const CACHE = CACHE_PREFIX + '__CACHE_VERSION__';
const PRECACHE = __PRECACHE__;
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE.map(path => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(networkFirstPage(request));
  else event.respondWith(cacheFirst(request));
});

function shellRequest() {
  return new URL('./', self.registration.scope).href;
}

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS)),
    ]);
    if (fresh.ok) cache.put(shellRequest(), fresh.clone()).catch(() => undefined);
    return fresh;
  } catch {
    // Offline (or a stalled connection): the cached shell serves every URL of the app, ?room=CODE included.
    return (await cache.match(shellRequest())) || (await cache.match(new URL('index.html', self.registration.scope).href)) || Response.error();
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;
  return fetch(request);
}
