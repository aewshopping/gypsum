import { test, expect } from '@playwright/test';

test('manifest is linked and valid', async ({ page }) => {
  await page.goto('/');
  const href = await page.getAttribute('link[rel="manifest"]', 'href');
  expect(href).toBe('manifest.json');

  const manifest = await (await page.request.get('/manifest.json')).json();
  expect(manifest.name).toBe('Gypsum');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test('service worker registers and activates', async ({ page }) => {
  await page.goto('/');
  const swUrl = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active.scriptURL;
  });
  expect(swUrl).toContain('service-worker.js');
});

// Validates the cache-fallback path of the network-first strategy.
// The SW must control the page (clients.claim) before assets are cached.
// Only after a controlled online visit will the cache be populated enough
// to serve the app offline.
test('app falls back to cache when offline', async ({ page, context }) => {
  // First visit — wait for SW to actually control this page (not just be active)
  await page.goto('/');
  await page.evaluate(() =>
    new Promise((resolve) => {
      if (navigator.serviceWorker.controller) return resolve();
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    })
  );

  // Second visit online — SW now intercepts all fetches and caches them
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Cut the network
  await context.setOffline(true);

  // Third load offline — SW must serve everything from cache
  await page.reload();

  // Assert a real app UI element rendered, not just that <body> exists
  await expect(page.locator('#btn_loadDirectoryHandles')).toBeVisible();
});

// Validates the manifest-version check: an unchanged version must not trigger a
// re-fetch of cached assets. Tampering with a cached asset and confirming it survives
// a reload proves the service worker served it from cache untouched.
test('unchanged manifest version serves assets from cache untouched', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    new Promise((resolve) => {
      if (navigator.serviceWorker.controller) return resolve();
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    })
  );
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys())[0]);
    const original = await cache.match('./public/style.css');
    const text = await original.text();
    await cache.put('./public/style.css', new Response(`${text}\n/* tampered */`, { headers: original.headers }));
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const cachedText = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys())[0]);
    return (await cache.match('./public/style.css')).text();
  });
  expect(cachedText).toContain('/* tampered */');
});

// Validates the other half of the manifest-version check: a bumped version must
// trigger a real refresh, overwriting stale cached assets, and reload the page.
// The check now runs in the background after the page is served from cache, so we
// poll the cache rather than asserting immediately after reload() resolves.
test('bumped manifest version refreshes cached assets and reloads the page', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    new Promise((resolve) => {
      if (navigator.serviceWorker.controller) return resolve();
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    })
  );
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Force a mismatch: lower the cached manifest's version, and tamper with a cached
  // asset so we can detect whether the background refresh overwrites it.
  await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys())[0]);

    const manifestResponse = await cache.match('./manifest.json');
    const manifest = await manifestResponse.json();
    manifest.version = '0.0.0';
    await cache.put('./manifest.json', new Response(JSON.stringify(manifest), { headers: manifestResponse.headers }));

    const cssResponse = await cache.match('./public/style.css');
    const text = await cssResponse.text();
    await cache.put('./public/style.css', new Response(`${text}\n/* stale */`, { headers: cssResponse.headers }));
  });

  // This reload is served instantly from the (tampered) cache; checkForUpdate then runs
  // in the background, refreshes the cache, and messages the page to reload a second time.
  await page.reload();

  await page.waitForFunction(async () => {
    const cache = await caches.open((await caches.keys())[0]);
    const res = await cache.match('./public/style.css');
    const text = await res.text();
    return !text.includes('/* stale */');
  }, { timeout: 10000 });

  await page.waitForLoadState('networkidle');
  await expect(page.locator('#btn_loadDirectoryHandles')).toBeVisible();
});
