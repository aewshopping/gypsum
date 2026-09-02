const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder, showFilenames } = require('./helpers');

test('clicking a tag filters files to only those with that tag', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');

  await loadFolder(page);
  await expect(page.locator('.note-grid')).toHaveCount(3);
  await showFilenames(page);

  // Open the controls panel, show the taxonomy, then open 'work' to reveal 'project'
  await page.click('[data-action="toggle-file-controls"]');
  await page.click('[data-action="render-tag-taxonomy"]');
  await page.click('details.taxon summary:has(code:text("work"))');
  await page.click('[data-action="tag-filter"][data-tag="project"]');

  await expect(page.locator('.note-grid')).toHaveCount(1);
  await expect(page.locator('.note-grid').first()).toContainText('meeting-notes');
});
