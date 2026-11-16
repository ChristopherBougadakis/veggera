/* Veggera service worker: makes return visits instant and keeps the page (and the
   phone number on it) available when the signal drops.
   - Files under /_astro/ carry a content hash in their name and never change:
     serve them from the cache, fetch once.
   - Pages: try the network first; if it is slow or gone, show the saved copy. */
const VERSION = 'veggera-v1';
const ASSETS = VERSION + '-assets';
const PAGES = VERSION + '-pages';
const PAGE_TIMEOUT = 3500;
// '/' on the real domain, '/veggera/' on the demo copy
const BASE = new URL(self.registration.scope).pathname;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const storable = (res) => res && res.status === 200 && res.type === 'basic';

async function assetFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (storable(res)) cache.put(request, res.clone());
  return res;
}

async function pageFresh(request) {
  const cache = await caches.open(PAGES);
  const key = new URL(request.url).pathname; // ignore ?t= and friends
  const network = fetch(request).then((res) => {
    if (storable(res)) cache.put(key, res.clone());
    return res;
  });
  const saved = await cache.match(key);
  if (!saved) return network;
  const slow = new Promise((resolve) => setTimeout(() => resolve(saved), PAGE_TIMEOUT));
  return Promise.race([network.catch(() => saved), slow]);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(BASE + '_astro/') || url.pathname === BASE + 'favicon.svg') {
    event.respondWith(assetFirst(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(pageFresh(request));
  }
});
