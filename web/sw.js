const CACHE = 'mosquito-tone-__VERSION__';
const ASSETS = ['./', './style.css', './app.mjs', './model.mjs', './tone-worklet.mjs', './tone.wasm', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mosquito-tone-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const navigating = event.request.mode === 'navigate';
  const shell = new URL('./', self.location.href);
  const path = new URL(event.request.url).pathname;
  // Leave authentication and other host-owned navigation routes to the server.
  if (navigating && path !== shell.pathname && path !== shell.pathname + 'index.html') return;
  const key = navigating ? shell.href : event.request;
  event.respondWith(caches.match(key).then(hit => {
    if (!hit) return fetch(event.request);
    // Safari rejects cached navigation responses retaining fetch redirect
    // metadata. A fresh response preserves the document, status and headers.
    return navigating ? new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: hit.headers }) : hit;
  }));
});
