const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithDeleteSupport } = require('./helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

test.describe('ctrl+shift+s rename shortcut', () => {

  test('opens the rename modal when the file content modal is open', async ({ page }) => {
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForHistoryOptions(page, 1);

    await page.keyboard.press('Control+Shift+S');

    await expect(page.locator('#modal-file-options')).toBeVisible();
  });

  test('does nothing when the file content modal is closed', async ({ page }) => {
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');

    await page.keyboard.press('Control+Shift+S');

    await expect(page.locator('#modal-file-options')).not.toBeVisible();
  });

});
