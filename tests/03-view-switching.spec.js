const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder } = require('./helpers');

test('switching to table view shows column headers', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');

  await loadFolder(page);
  await expect(page.locator('.note-grid')).toHaveCount(3);

  await page.selectOption('#view-select', 'table');

  await expect(page.locator('.note-table-header')).toBeVisible();
  await expect(page.locator('.note-grid')).toHaveCount(0);
});
