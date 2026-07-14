// NSE Insights — service worker
// Versioned cache; update CACHE_VERSION on each deploy to bust caches.
const CACHE_VERSION = 'nse-insights-v9';
const STATIC_ASSETS = [
  '/landing.html',
  '/dashboard.html',
  '/pricing.html',
  '/login.html',
  '/account.html',
  '/tokens.css',
  '/styles.css',
  '/app.js',
  '/data.js',
  '/sector-detail.js',
  '/feedback.js',
  '/payments.js',
  '/tier-access.js',
  '/supabase-client.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Don't intercept payment / auth / API calls
  if (url.pathname.startsWith('/api/') || url.host.includes('supabase')) return;

  // HTML — network-first with cache fallback (so users get latest)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('/landing.html')))
    );
    return;
  }

  // JSON data (prices.json / market.json) — network-first so intraday
  // price updates reach returning users; cache fallback keeps offline working.
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Static — cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
