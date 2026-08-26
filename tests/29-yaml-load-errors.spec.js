const { test, expect } = require('@playwright/test');
const { setupMockFilesBrokenYaml, setupMockFiles, loadFolder } = require('./helpers');

test('files with unreadable yaml get an errorOnLoad summary, clean files get null', async ({ page }) => {
  await setupMockFilesBrokenYaml(page);
  await page.goto('/');
  await loadFolder(page);

  const errors = await page.evaluate(() =>
    window.appState.myFiles
      .map(file => [file.filename, file.errorOnLoad])
      .sort((a, b) => a[0].localeCompare(b[0]))
  );

  expect(errors).toEqual([
    ['broken-yaml.md', 'yaml: 2 lines skipped'],
    ['clean-yaml.md', null],
    ['half-broken.md', 'yaml: 1 line skipped'],
  ]);
});

test('the load message nudges about yaml errors, and clicking it filters to those files', async ({ page }) => {
  await setupMockFilesBrokenYaml(page);
  await page.goto('/');
  await loadFolder(page);

  const nudge = page.locator('#fileCountElement .load-error-nudge');
  await expect(nudge).toHaveText('2 yaml errors');

  await expect(page.locator('.note-grid')).toHaveCount(3);
  await nudge.click();

  await expect(page.locator('.note-grid')).toHaveCount(2);
  const shown = await page.locator('.note-grid [data-prop="filename"]').allInnerTexts();
  expect(shown.map(text => text.trim()).sort()).toEqual(['broken-yaml.md', 'half-broken.md']);
});

test('no nudge appears when every file reads cleanly', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);

  await expect(page.locator('#fileCountElement')).toContainText('files: 3');
  await expect(page.locator('#fileCountElement .load-error-nudge')).toHaveCount(0);
});
