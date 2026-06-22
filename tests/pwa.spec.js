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
// First load: SW activates and responses are stored in cache via the network-first fetch handler.
// Second load (offline): network requests fail, SW falls back to cache — app still renders.
test('app falls back to cache when offline', async ({ page, context }) => {
  // First visit — network succeeds, responses are cached
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);

  // Cut the network
  await context.setOffline(true);

  // Reload — SW tries network (fails), serves from cache
  await page.reload();
  await expect(page.locator('body')).toBeVisible();
});
