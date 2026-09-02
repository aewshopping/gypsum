const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder, showFilenames } = require('./helpers');

// Search and view switching share one folder load — both are cheap reads over the same state.
test('searching filters the list, and the table view renders headers', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');

  await loadFolder(page);
  await expect(page.locator('.note-grid')).toHaveCount(3);
  await showFilenames(page);

  // 'meeting' only appears in the filename meeting-notes.md
  await page.fill('#searchbox', 'meeting');
  await page.press('#searchbox', 'Enter');

  await expect(page.locator('.note-grid')).toHaveCount(1);
  await expect(page.locator('.note-grid').first()).toContainText('meeting-notes');

  await page.selectOption('#view-select', 'table');

  await expect(page.locator('.note-table-header')).toBeVisible();
  await expect(page.locator('.note-grid')).toHaveCount(0);
});
