const { test, expect } = require('@playwright/test');
const { setupMockDirectory } = require('./helpers');

test('loading a folder loads files from all subdirectories', async ({ page }) => {
  await setupMockDirectory(page);
  await page.goto('/');

  await page.click('[data-click-loadfolder]');

  await expect(page.locator('.note-grid')).toHaveCount(4);
  await expect(page.locator('#fileCountElement')).toContainText('4 files loaded');
});
