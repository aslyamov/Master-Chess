const CACHE = 'mcg-v2';
const PRECACHE = ['/Master-Chess/', '/Master-Chess/brown.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Don't cache Lichess API calls or stockfish wasm
  const url = new URL(e.request.url);
  if (url.hostname === 'lichess.org' || url.pathname.endsWith('.wasm')) return;

  e.respondWith(
    caches.match(e.request).then((cached) => cached ?? fetch(e.request))
  );
});
