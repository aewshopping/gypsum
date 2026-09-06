const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { setupMockFiles, loadFolder, showFilenames } = require('./helpers');

// dist/ is a CI artifact, not committed. Build it with the commands in
// .github/workflows/bundle.yaml to exercise the bundled half of this test.
const bundleExists = fs.existsSync(path.join(__dirname, '..', 'dist', 'view-notes.html'));

// The highlight works by rewriting one CSS rule at runtime, so it silently does nothing
// if that rule cannot be found. In development style.css is only @import statements and
// the rule sits in an imported sheet; the bundled build inlines everything into one.
// Both are checked here because they reach the rule by different paths.
for (const [label, url] of [['development', '/'], ['bundled build', '/dist/view-notes.html']]) {

  test(`hovering a header highlights that column — ${label}`, async ({ page }) => {
    test.skip(url.startsWith('/dist') && !bundleExists, 'bundled build not present — run esbuild first');
    await page.setViewportSize({ width: 1000, height: 700 });
    await setupMockFiles(page);
    await page.goto(url);
    await loadFolder(page);
    await showFilenames(page);
    await page.selectOption('#view-select', 'table');
    await expect(page.locator('.note-table-header')).toBeVisible();

    const titleCell = page.locator('.note-table-cell[data-prop="title"]').first();
    const tagsCell = page.locator('.note-table-cell[data-prop="tags"]').first();

    const bg = locator => locator.evaluate(el => getComputedStyle(el).backgroundColor);

    // the view transition leaves computed styles empty for a moment after the switch
    await expect.poll(() => bg(titleCell)).not.toBe('');
    const unhighlighted = await bg(titleCell);

    await page.locator('.note-table-cell-header').filter({ hasText: 'title' }).first().hover();
    await expect.poll(() => bg(titleCell)).not.toBe(unhighlighted);

    // only the hovered column lights up
    expect(await bg(tagsCell)).toBe(unhighlighted);

    // and moving to another header moves the highlight with it
    await page.locator('.note-table-cell-header').filter({ hasText: 'tags' }).first().hover();
    await expect.poll(() => bg(tagsCell)).not.toBe(unhighlighted);
    expect(await bg(titleCell)).toBe(unhighlighted);
  });
}
