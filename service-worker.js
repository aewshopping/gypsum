const CACHE_NAME = 'gypsum-v1'; // stable bucket name — invalidation is now driven by
                                // manifest.json's version field, not this constant.
const PRECACHE_URLS = ['./', './public/style.css', './public/main.js', './manifest.json'];

// DEV-MODE-BYPASS · removal manifest at the top of
// public/js/ui/ui-functions-click/toggle-developer-mode.js. Grep DEV_MODE for every site here.
// Developer mode registers this worker as service-worker.js?dev=1. Reading the flag off the
// worker's own URL is what makes it reliable: the browser terminates an idle worker within
// about 30 seconds and respawns it on the next event, which would wipe any variable set by
// postMessage, but the script URL is fixed for the life of the registration.
const DEV_MODE = new URL(self.location.href).searchParams.has('dev');

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// True if the cached manifest.json has a different version than the one just fetched
// from the network — or if nothing is cached yet (first install).
async function versionHasChanged(cache, freshManifest) {
  const cached = await cache.match('./manifest.json');
  if (!cached) return true;
  const cachedManifest = await cached.json();
  return cachedManifest.version !== freshManifest.version;
}

// Re-fetches the precache set fresh (bypassing HTTP cache) and only then wipes the old
// cache — if any fetch fails, the existing (working, offline-safe) cache is left untouched
// and the update is simply retried on the next navigation. Stale JS modules under
// public/js/** (never listed in PRECACHE_URLS) get evicted by the wipe too; they're
// repopulated on demand by handleAsset() as the page re-imports them.
async function refreshPrecache(cache, manifestResponse) {
  const otherUrls = PRECACHE_URLS.filter((url) => url !== './manifest.json');
  const otherResponses = await Promise.all(otherUrls.map((url) => fetch(url, { cache: 'no-store' })));

  await Promise.all((await cache.keys()).map((req) => cache.delete(req)));
  await cache.put('./manifest.json', manifestResponse);
  await Promise.all(otherUrls.map((url, i) => cache.put(url, otherResponses[i])));
}

// Runs in the background, after a navigation has already been served from cache. Checks
// manifest.json on the network; on a version bump, refreshes the cache and tells open tabs
// to reload. The app's existing beforeunload/unsaved-changes guard protects in-progress
// edits when that reload actually happens.
async function checkForUpdate() {
  const cache = await caches.open(CACHE_NAME);

  try {
    const manifestResponse = await fetch('./manifest.json', { cache: 'no-store' });
    const freshManifest = await manifestResponse.clone().json();
    if (await versionHasChanged(cache, freshManifest)) {
      await refreshPrecache(cache, manifestResponse);
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.postMessage({ type: 'gypsum-update-ready' }));
    }
  } catch {
    // Offline, or the check/refresh failed — the next navigation just retries.
  }
}

// DEV-MODE-BYPASS · delete with the feature; nothing outside developer mode calls this.
// Developer mode's only fetch path. Two separate caches have to be defeated: `no-store` on the
// request skips the browser's HTTP cache on the way out, and the `no-store` response header
// stops the browser keeping the result. Without that header a static dev server (which sends
// no Cache-Control) lets the browser invent a freshness window from the file's age and serve
// its own copy on the next reload without ever consulting this worker.
async function fetchFresh(request) {
  const response = await fetch(request, { cache: 'no-store' });
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Serves immediately from cache when available; only touches the network on a cache miss
// (e.g. the very first visit, before anything is precached).
async function handleNavigate(request) {
  if (DEV_MODE) return fetchFresh(request);

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  return fetch(request);
}

// Cache-first for everything else.
async function handleAsset(request) {
  if (DEV_MODE) return fetchFresh(request);

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    // Dev mode already serves everything fresh, and its cached manifest goes stale, so the
    // version check would fire a pointless reload on every navigation.
    if (!DEV_MODE) event.waitUntil(checkForUpdate());
    return;
  }

  event.respondWith(handleAsset(request));
});
