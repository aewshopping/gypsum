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
