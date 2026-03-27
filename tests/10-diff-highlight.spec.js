const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithHistoryLinePool } = require('./helpers');

// Helper: wait until the history select has at least N options populated.
async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

test.describe('diff highlighting', () => {

  async function openModal(page) {
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForHistoryOptions(page, 2);
  }

  test('selecting a historical entry applies diff-old highlight', async ({ page }) => {
    await setupMockDirectoryWithHistoryLinePool(page);
    await page.goto('/');
    await openModal(page);

    await page.selectOption('#file-content-history-select', { index: 1 });

    const hasHighlight = await page.evaluate(() => CSS.highlights.has('diff-old'));
    expect(hasHighlight).toBe(true);
  });

  test('switching back to current version removes diff-old highlight', async ({ page }) => {
    await setupMockDirectoryWithHistoryLinePool(page);
    await page.goto('/');
    await openModal(page);

    await page.selectOption('#file-content-history-select', { index: 1 });
    await page.selectOption('#file-content-history-select', { value: 'current' });

    const hasHighlight = await page.evaluate(() => CSS.highlights.has('diff-old'));
    expect(hasHighlight).toBe(false);
  });

});
