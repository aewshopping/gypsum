const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithDeleteSupport, loadFolder } = require('./helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

test('ctrl+shift+s opens the rename modal, but only with a file open', async ({ page }) => {
  await setupMockDirectoryWithDeleteSupport(page);
  await page.goto('/');
  await loadFolder(page);

  await page.keyboard.press('Control+Shift+S');
  await expect(page.locator('#modal-file-options')).not.toBeVisible();

  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 1);

  await page.keyboard.press('Control+Shift+S');
  await expect(page.locator('#modal-file-options')).toBeVisible();
});
