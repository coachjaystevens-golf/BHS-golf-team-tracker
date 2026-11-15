// Service worker: lets the app open on the course with no signal.
//
// - The app itself (index.html + the built JS/CSS/icons) is kept on the
//   phone. index.html is always fetched fresh when there's signal, so a new
//   deploy shows up on the next open; the copy is only used when offline.
// - Supabase data the phone has already loaded (rosters, courses, greens,
//   today's round) is kept too: try the network first, and if it doesn't
//   answer within a few seconds, show the last copy instead.
// - Nothing that changes data (saves, sign-in) is ever cached. Score saves
//   made offline are still handled by the app's offline queue.
//
// Bump VERSION to force every phone to drop its saved copies.

const VERSION = 'v1';
const APP = `app-${VERSION}`;
const DATA = `data-${VERSION}`;
const NET_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP).then((c) => c.addAll(['/', '/manifest.webmanifest', '/apple-touch-icon.png']).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// network first; fall back to the saved copy; save good answers
async function networkFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);
  try {
    const res = await withTimeout(fetch(request), NET_TIMEOUT_MS);
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw err;
  }
}

// built files have a unique name per deploy, so a saved copy is always right
async function cacheFirst(request) {
  const cache = await caches.open(APP);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never touch saves
  const url = new URL(req.url);

  // Supabase table reads (not sign-in, not storage uploads)
  if (url.hostname.endsWith('.supabase.co')) {
    if (url.pathname.startsWith('/rest/v1/')) event.respondWith(networkFirst(req, DATA));
    return;
  }

  if (url.origin !== self.location.origin) return; // maps, course search, etc.

  // page loads (any app route) -> fresh index.html, saved copy when offline
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, APP, '/'));
    return;
  }

  if (url.pathname.startsWith('/assets/') || /\.(png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  }
});
