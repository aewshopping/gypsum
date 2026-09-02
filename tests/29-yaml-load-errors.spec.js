const { test, expect } = require('@playwright/test');
const {
  setupMockFilesBrokenYaml, setupMockFiles, setupMockFilesUnreadable,
  setupMockFilesAllUnreadable, setupMockFilesShadowingYaml, loadFolder, showFilenames,
} = require('./helpers');

test('unreadable yaml gets an errorOnLoad summary, and the nudge filters to those files', async ({ page }) => {
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

  const nudge = page.locator('#fileCountElement .load-error-nudge');
  await expect(nudge).toHaveText('2 yaml errors');

  await expect(page.locator('.note-grid')).toHaveCount(3);
  await nudge.click();

  await expect(page.locator('.note-grid')).toHaveCount(2);
  await showFilenames(page);
  const names = page.locator('.note-grid [data-prop="filename"]');
  await expect(names).toHaveCount(2);
  const shown = await names.allInnerTexts();
  expect(shown.map(text => text.trim()).sort()).toEqual(['broken-yaml.md', 'half-broken.md']);
});

test('no nudge appears when every file reads cleanly', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);

  await expect(page.locator('#fileCountElement')).toContainText('files: 3');
  await expect(page.locator('#fileCountElement .load-error-nudge')).toHaveCount(0);
});

test('front matter cannot overwrite core file properties, and says so', async ({ page }) => {
  await setupMockFilesShadowingYaml(page);
  await page.goto('/');
  await loadFolder(page);

  const shadowed = await page.evaluate(() => {
    const file = window.appState.myFiles.find(f => f.internalId === 'shadow.md');
    return {
      filename: file.filename,
      handleIsString: typeof file.handle === 'string',
      errorOnLoad: file.errorOnLoad,
      title: file.title,
    };
  });

  expect(shadowed.filename).toBe('shadow.md');   // not the 'fake.md' the front matter asked for
  expect(shadowed.handleIsString).toBe(false);   // still a real file handle
  expect(shadowed.errorOnLoad).toBe('yaml: keys "handle", "filename" ignored');
  expect(shadowed.title).toBe('Shadowed');       // title is NOT reserved, so it still applies
});

test('an unreadable file is skipped, and the rest of the folder still loads', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await setupMockFilesUnreadable(page);
  await page.goto('/');
  await loadFolder(page);

  await expect(page.locator('.note-grid')).toHaveCount(2);
  const note = page.locator('#fileCountElement .load-error-note');
  await expect(note).toHaveText('1 unreadable');
  // Unlike the yaml nudge there is nothing to filter to, so it is not clickable
  await expect(note).toHaveAttribute('data-tip', /skipped/);
  expect(await note.getAttribute('data-action')).toBeNull();
  expect(pageErrors).toEqual([]);
});

test('a folder where every file is unreadable loads to empty without crashing', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await setupMockFilesAllUnreadable(page);
  await page.goto('/');
  await loadFolder(page);

  expect(await page.evaluate(() => window.appState.myFiles.length)).toBe(0);
  await expect(page.locator('#fileCountElement')).toContainText('2 unreadable');
  expect(pageErrors).toEqual([]);
});
