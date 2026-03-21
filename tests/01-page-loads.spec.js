const { test, expect } = require('@playwright/test');

// No mock needed — this test checks the page before any files are loaded.

test('page loads with correct title and load button', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Text file viewer');
  await expect(page.locator('[data-click-loadfiles]')).toBeVisible();
  await expect(page.locator('#fileCountElement')).toHaveText('No files loaded');
});
