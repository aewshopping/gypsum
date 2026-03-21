const { test, expect } = require('@playwright/test');
const { setupMockFiles } = require('./helpers');

test('clicking a tag filters files to only those with that tag', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');

  await page.click('[data-click-loadfiles]');
  await expect(page.locator('.note-grid')).toHaveCount(3);

  // 'project' tag is nested under 'work' in the taxonomy — open it first
  await page.click('details.taxon summary:has(code:text("work"))');
  await page.click('[data-action="tag-filter"][data-tag="project"]');

  await expect(page.locator('.note-grid')).toHaveCount(1);
  await expect(page.locator('.note-grid').first()).toContainText('meeting-notes');
});
