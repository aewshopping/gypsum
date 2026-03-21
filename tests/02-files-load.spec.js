const { test, expect } = require('@playwright/test');
const { setupMockFiles } = require('./helpers');

test('loading files renders a card for each file', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');

  await page.click('[data-click-loadfiles]');

  await expect(page.locator('.note-grid')).toHaveCount(3);
  await expect(page.locator('#fileCountElement')).toContainText('3 files loaded');
});
