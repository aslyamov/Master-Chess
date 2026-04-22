/* coi-serviceworker — adds COOP/COEP headers via SW to enable SharedArrayBuffer on static hosts */
if (typeof window === 'undefined') {
  // ── Service Worker context ──────────────────────────────────────────────────
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

  self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
    e.respondWith(
      fetch(req).then((res) => {
        if (res.status === 0) return res;
        const headers = new Headers(res.headers);
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      })
    );
  });
} else {
  // ── Main thread: register SW, reload once it takes control ─────────────────
  if ('serviceWorker' in navigator) {
    const swUrl = new URL('coi-serviceworker.js', location.href).href;
    navigator.serviceWorker.register(swUrl).then((reg) => {
      if (!navigator.serviceWorker.controller) {
        const pending = reg.installing ?? reg.waiting;
        if (pending) {
          pending.addEventListener('statechange', (ev) => {
            if (ev.target.state === 'activated') location.reload();
          });
        }
      }
    });
  }
}
