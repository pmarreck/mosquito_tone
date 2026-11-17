const CACHE = 'mosquito-tone-__VERSION__';
const ASSETS = ['./', './index.html', './style.css', './app.mjs', './model.mjs', './tone-worklet.mjs', './tone.wasm', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mosquito-tone-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const key = event.request.mode === 'navigate' ? new URL('./index.html', self.location.href).href : event.request;
  event.respondWith(caches.match(key).then(hit => hit || fetch(event.request)));
});
