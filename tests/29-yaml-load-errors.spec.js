const { test, expect } = require('@playwright/test');
const {
  setupMockFilesBrokenYaml, setupMockFiles, setupMockFilesUnreadable,
  setupMockFilesAllUnreadable, setupMockFilesShadowingYaml, loadFolder,
} = require('./helpers');

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

test('one unreadable file is skipped, and the rest of the folder still loads', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await setupMockFilesUnreadable(page);
  await page.goto('/');
  await loadFolder(page);

  await expect(page.locator('.note-grid')).toHaveCount(2);
  await expect(page.locator('#fileCountElement')).toContainText('1 unreadable');
  await expect(page.locator('#fileCountElement .load-error-note')).toHaveText('1 unreadable');
  expect(pageErrors).toEqual([]);
});

test('the settled load line is entirely inside the faded span, separators included', async ({ page }) => {
  await setupMockFilesBrokenYaml(page);
  await page.goto('/');
  await loadFolder(page);

  // the faded message only replaces the duration one ~3s after the bar finishes
  const faded = page.locator('#fileCountElement .load-finished-msg');
  await expect(faded).toContainText('file system', { timeout: 10000 });

  // Nothing may sit outside the faded span — a stray separator there would inherit the
  // element's full-contrast colour and break the line up. Descendant selectors elsewhere in
  // this file match either way, so this is what actually pins the fix.
  const outside = await page.evaluate(() => {
    const el = document.getElementById('fileCountElement');
    return [...el.childNodes]
      .filter(node => !(node.nodeType === 1 && node.classList.contains('load-finished-msg')))
      .map(node => node.textContent);
  });
  expect(outside).toEqual([]);

  await expect(faded.locator('.load-error-nudge')).toHaveText('2 yaml errors');
});

test('the unreadable count is not clickable — there is nothing to filter to', async ({ page }) => {
  await setupMockFilesUnreadable(page);
  await page.goto('/');
  await loadFolder(page);

  const note = page.locator('#fileCountElement .load-error-note');
  await expect(note).toHaveAttribute('data-tip', /skipped/);
  expect(await note.getAttribute('data-action')).toBeNull();
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
