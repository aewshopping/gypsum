const { test, expect } = require('@playwright/test');
const { setupMockEmptyDirectoryWithCreate, setupMockFiles, loadFolder } = require('./helpers');

test('an empty folder loads without crashing and invites a first note', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await setupMockEmptyDirectoryWithCreate(page);
  await page.goto('/');
  await loadFolder(page);

  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.appState.myFiles.length)).toBe(0);
  await expect(page.locator('#output .empty-state')).toContainText('No notes in this folder yet');
  await expect(page.locator('#fileCountElement')).toContainText('files: 0');
});

test('the new-note button and sort dropdown stay usable in an empty folder', async ({ page }) => {
  await setupMockEmptyDirectoryWithCreate(page);
  await page.goto('/');
  await loadFolder(page);

  await expect(page.locator('#btn-new-note')).toBeEnabled();

  // an empty select is a dead control — the default sort property must survive
  const options = await page.locator('#sort-select option').allInnerTexts();
  expect(options.length).toBeGreaterThan(0);
  expect(await page.locator('#sort-select').inputValue()).toBe('lastModified');
});

test('creating the first note in an empty folder brings the list and controls to life', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await setupMockEmptyDirectoryWithCreate(page);
  await page.goto('/');
  await loadFolder(page);

  await page.click('#btn-new-note');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  expect(pageErrors).toEqual([]);
  await expect(page.locator('#output .empty-state')).toHaveCount(0);
  await expect(page.locator('.note-grid')).toHaveCount(1);
  await expect(page.locator('.note-grid').first()).toContainText('note-1.txt');

  // properties are registered from myFiles[0] at load, which never ran for an empty folder;
  // without registering on create, the sort dropdown and table columns stay empty
  const sortOptions = await page.locator('#sort-select option').allInnerTexts();
  expect(sortOptions).toContain('filename');

  await page.selectOption('#view-select', 'table');
  await expect(page.locator('#output .note-table-cell-header')).not.toHaveCount(0);
  await expect(page.locator('#output .note-table-header')).toContainText('filename');
});

test('deleting the last note returns to the empty-folder message', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await setupMockEmptyDirectoryWithCreate(page);
  await page.goto('/');
  await loadFolder(page);

  await page.click('#btn-new-note');
  await page.waitForTimeout(1000);
  await expect(page.locator('#file-content-modal')).toBeVisible();

  // delete from inside the open note: file options → delete → confirm
  await page.click('#file-options-btn');
  await page.click('[data-action="delete-file"]');
  await page.click('[data-action="warning-proceed"]');
  await page.waitForTimeout(1000);

  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.appState.myFiles.length)).toBe(0);
  await expect(page.locator('#output .empty-state')).toContainText('No notes in this folder yet');
});

test('the empty-folder message does not flash while a real folder is loading', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');

  await page.click('#btn-recent-toggle');
  await page.click('[data-action="load-folder"]');

  // the load holds for ~2s by design; the message must never appear during it
  for (let i = 0; i < 6; i++) {
    expect(await page.locator('#output .empty-state').filter({ hasText: 'No notes in this folder yet' }).count()).toBe(0);
    await page.waitForTimeout(300);
  }

  await page.click('#btn-recent-close');
  await expect(page.locator('.note-grid')).toHaveCount(3);
});

test('the open-OPFS button is enabled from a cold start', async ({ page }) => {
  await page.goto('/');
  await page.click('#btn-recent-toggle');

  // It used to ship disabled and only switch on if OPFS already held files, which made an empty
  // OPFS unreachable.
  await expect(page.locator('#btn-load-opfs')).toBeEnabled();
});

test('opening an empty OPFS lands on the empty-folder prompt, ready for a first note', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto('/');

  // Real OPFS, not a mock — the helpers stub showDirectoryPicker, not navigator.storage. Cleared
  // first so the test cannot inherit state from another run.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names = [];
    for await (const name of root.keys()) names.push(name);
    for (const name of names) await root.removeEntry(name, { recursive: true });
  });

  await page.click('#btn-recent-toggle');
  await page.click('[data-action="load-opfs"]');
  await page.click('#btn-recent-close');

  await expect(page.locator('#output .empty-state')).toContainText('No notes in this folder yet');
  await expect(page.locator('#btn-new-note')).toBeEnabled();
  await expect(page.locator('#fileCountElement')).toContainText('files: 0');
  expect(pageErrors).toEqual([]);
});

test('an unavailable OPFS says so on click, rather than doing nothing', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  // Simulates the app opened from file:// — the API is present but refuses.
  await page.addInitScript(() => {
    navigator.storage.getDirectory = async () => {
      throw new DOMException('not allowed here', 'SecurityError');
    };
  });

  await page.goto('/');
  await page.click('#btn-recent-toggle');
  await page.click('[data-action="load-opfs"]');
  await page.click('#btn-recent-close');

  await expect(page.locator('#fileCountElement')).toContainText('OPFS unavailable');

  // The throw has to be caught, or it becomes an unhandled rejection and leaves isLoading set,
  // which gates the empty-folder message on every later render.
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.appState.isLoading)).toBe(false);
});
