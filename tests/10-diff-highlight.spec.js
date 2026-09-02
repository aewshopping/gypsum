const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithHistoryLinePool, loadFolder } = require('./helpers');

// Helper: wait until the history select has at least N options populated.
async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

test('the diff-old highlight follows the selected version', async ({ page }) => {
  await setupMockDirectoryWithHistoryLinePool(page);
  await page.goto('/');
  await loadFolder(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  // on-open snapshot (v-1) + the pre-existing historical entry (v-2) = 3 total
  await waitForHistoryOptions(page, 3);

  const hasHighlight = () => page.evaluate(() => CSS.highlights.has('diff-old'));

  // index 2 = v-2, the pre-existing historical entry ("Old content from yesterday")
  await page.selectOption('#file-content-history-select', { index: 2 });
  expect(await hasHighlight()).toBe(true);

  await page.selectOption('#file-content-history-select', { value: 'current' });
  expect(await hasHighlight()).toBe(false);
});
