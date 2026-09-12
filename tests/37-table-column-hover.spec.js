const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder, showFilenames } = require('./helpers');

// The highlight works by rewriting one CSS rule at runtime, so it silently does nothing if that
// rule cannot be found. In development style.css is only @import statements and the rule sits in
// an imported sheet, which is not reachable from document.styleSheets without recursing — hence
// findColHoverRule in table-col-hover.js.
test('hovering a header highlights that column', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  const titleCell = page.locator('.note-table-cell[data-prop="title"]').first();
  const tagsCell = page.locator('.note-table-cell[data-prop="tags"]').first();

  const bg = locator => locator.evaluate(el => getComputedStyle(el).backgroundColor);

  // The view transition leaves computed styles empty for a moment after the switch. The
  // polled value is what gets kept, rather than being read again once the poll passes:
  // the re-read is its own frame, and under load it lands back on the empty one.
  let unhighlighted = '';
  await expect.poll(async () => (unhighlighted = await bg(titleCell))).not.toBe('');

  await page.locator('.note-table-cell-header').filter({ hasText: 'title' }).first().hover();
  await expect.poll(() => bg(titleCell)).not.toBe(unhighlighted);

  // only the hovered column lights up
  expect(await bg(tagsCell)).toBe(unhighlighted);

  // and moving to another header moves the highlight with it
  await page.locator('.note-table-cell-header').filter({ hasText: 'tags' }).first().hover();
  await expect.poll(() => bg(tagsCell)).not.toBe(unhighlighted);
  expect(await bg(titleCell)).toBe(unhighlighted);
});
