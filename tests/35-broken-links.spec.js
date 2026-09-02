const { test, expect } = require('@playwright/test');
const { setupMockFilesWithLinks, setupMockFiles, loadFolder } = require('./helpers');

// setupMockFilesWithLinks holds two files with broken links and no others: hub.md, whose
// [[does-not-exist.md]] resolves to nothing (its fenced and inline-code links are protected,
// so they never reach the internalLink property at all), and both-faults.md, which pairs a
// broken link with unreadable front matter.

test('links naming no file are counted into errorOnLoad, resolvable ones are not', async ({ page }) => {
  await setupMockFilesWithLinks(page);
  await page.goto('/');
  await loadFolder(page);

  const errors = await page.evaluate(() =>
    window.appState.myFiles
      .map(file => [file.filename, file.errorOnLoad])
      .sort((a, b) => a[0].localeCompare(b[0]))
  );

  expect(errors).toEqual([
    ['ambig.md', null],
    ['ambig.txt', null],
    ['both-faults.md', 'yaml: 1 line skipped | links: 1 broken'],
    // plain, path-qualified, aliased and extensionless links all resolve; only the
    // does-not-exist.md one does not, and the fenced/inline ones are never collected
    ['extensionless.md', null],
    ['hub.md', 'links: 1 broken'],
    ['my long note.md', null],
    ['nested.md', null],
    ['shopping.txt', null],
    ['titled-link.md', null],
  ]);
});

test('the load message nudges about broken links, and clicking it filters to those files', async ({ page }) => {
  await setupMockFilesWithLinks(page);
  await page.goto('/');
  await loadFolder(page);

  const nudge = page.locator('#fileCountElement [data-value="links"]');
  await expect(nudge).toHaveText('2 broken links');

  await expect(page.locator('.note-grid')).toHaveCount(9);
  await nudge.click();

  await expect(page.locator('.note-grid')).toHaveCount(2);
  const shown = await page.locator('.note-grid [data-prop="filename"]').allInnerTexts();
  expect(shown.map(text => text.trim()).sort()).toEqual(['both-faults.md', 'hub.md']);
});

test('a file with both faults answers to the yaml search and the links search', async ({ page }) => {
  await setupMockFilesWithLinks(page);
  await page.goto('/');
  await loadFolder(page);

  // The two counts overlap: both-faults.md is the whole yaml count and half the links count.
  await expect(page.locator('#fileCountElement [data-value="yaml"]')).toHaveText('1 yaml error');
  await expect(page.locator('#fileCountElement [data-value="links"]')).toHaveText('2 broken links');

  await page.locator('#fileCountElement [data-value="yaml"]').click();
  await expect(page.locator('.note-grid')).toHaveCount(1);
  await expect(page.locator('.note-grid [data-prop="filename"]')).toHaveText(/both-faults\.md/);
});

test('no broken-link nudge appears when every link resolves', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);

  await expect(page.locator('#fileCountElement')).toContainText('files: 3');
  await expect(page.locator('#fileCountElement [data-value="links"]')).toHaveCount(0);
});
