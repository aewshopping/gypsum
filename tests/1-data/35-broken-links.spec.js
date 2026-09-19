const { test, expect } = require('@playwright/test');
const { setupMockFilesWithLinks, setupMockFiles, loadFolder, showFilenames } = require('../helpers');

// setupMockFilesWithLinks holds three files with broken links and no others: hub.md, whose
// [[does-not-exist.md]] resolves to nothing (its fenced and inline-code links are protected,
// so they never reach the internalLink property at all), both-faults.md, which pairs a
// broken link with unreadable front matter, and front-matter-links.md, whose broken link is
// declared in a YAML value rather than in the body — which is the point of it being here.

test('broken links are counted into errorOnLoad, and the nudge filters to those files', async ({ page }) => {
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
    // Collected from the parsed front matter values, then checked like any other link.
    ['front-matter-links.md', 'links: 1 broken'],
    ['hub.md', 'links: 1 broken'],
    ['my long note.md', null],
    ['nested.md', null],
    ['shopping.txt', null],
    ['titled-link.md', null],
  ]);

  // The two counts overlap: both-faults.md is the whole yaml count and a third of the links count.
  await expect(page.locator('#fileCountElement [data-value="yaml"]')).toHaveText('1 yaml error');
  await expect(page.locator('#fileCountElement [data-value="links"]')).toHaveText('3 broken links');

  await expect(page.locator('.note-grid')).toHaveCount(10);
  await page.locator('#fileCountElement [data-value="links"]').click();
  await expect(page.locator('.note-grid')).toHaveCount(3);
  await showFilenames(page);
  const names = page.locator('.note-grid [data-prop="filename"]');
  await expect(names).toHaveCount(3);
  const shown = await names.allInnerTexts();
  expect(shown.map(text => text.trim()).sort())
    .toEqual(['both-faults.md', 'front-matter-links.md', 'hub.md']);

});

test('a file with both faults also answers to the yaml nudge', async ({ page }) => {
  await setupMockFilesWithLinks(page);
  await page.goto('/');
  await loadFolder(page);

  await page.locator('#fileCountElement [data-value="yaml"]').click();
  await expect(page.locator('.note-grid')).toHaveCount(1);
  await showFilenames(page);
  await expect(page.locator('.note-grid [data-prop="filename"]')).toHaveText(/both-faults\.md/);
});

test('no broken-link nudge appears when every link resolves', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);

  await expect(page.locator('#fileCountElement')).toContainText('files loaded: 3');
  await expect(page.locator('#fileCountElement [data-value="links"]')).toHaveCount(0);
});
