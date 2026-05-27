const { test, expect } = require('@playwright/test');
const { setupMockFiles } = require('./helpers');

test('searching filters files to only those that match', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');

  await page.click('[data-click-loadfolder]');
  await expect(page.locator('.note-grid')).toHaveCount(3);

  // 'meeting' only appears in the filename meeting-notes.md
  await page.fill('#searchbox', 'meeting');
  await page.press('#searchbox', 'Enter');

  await expect(page.locator('.note-grid')).toHaveCount(1);
  await expect(page.locator('.note-grid').first()).toContainText('meeting-notes');
});
