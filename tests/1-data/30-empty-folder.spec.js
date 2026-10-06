const { test, expect } = require('@playwright/test');
const { setupMockEmptyDirectoryWithCreate, loadFolder, showFilenames, chooseView, openSortModal } = require('../helpers');

test('an empty folder loads without crashing, and its controls stay usable', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await setupMockEmptyDirectoryWithCreate(page);
  await page.goto('/');
  await loadFolder(page);

  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.appState.myFiles.length)).toBe(0);
  await expect(page.locator('#output .empty-state')).toContainText('No notes in this folder yet');
  await expect(page.locator('#fileCountElement')).toContainText('files: 0');

  await expect(page.locator('#btn-new-note')).toBeEnabled();
  // an empty list is a dead control — the default sort property must survive
  await openSortModal(page);
  expect(await page.locator('#sort-list .sort-row').count()).toBeGreaterThan(0);
  await expect(page.locator('#sort-list .sort-row.is-active')).toHaveAttribute('data-property', 'lastModified');
  await page.keyboard.press('Escape');
});

test('creating and then deleting the first note brings the list to life and back', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await setupMockEmptyDirectoryWithCreate(page);
  await page.goto('/');
  await loadFolder(page);

  await page.click('#btn-new-note');
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#file-content-modal')).toBeHidden();

  await expect(page.locator('#output .empty-state')).toHaveCount(0);
  await expect(page.locator('.note-grid')).toHaveCount(1);
  await showFilenames(page);
  await expect(page.locator('.note-grid').first()).toContainText('note-1.txt');

  // properties are registered from myFiles[0] at load, which never ran for an empty folder;
  // without registering on create, the sort modal and table columns stay empty
  await openSortModal(page);
  await expect(page.locator('#sort-list .sort-row[data-property="filename"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await chooseView(page, 'table');
  await expect(page.locator('#output .note-table-cell-header')).not.toHaveCount(0);
  await expect(page.locator('#output .note-table-header')).toContainText('filename');

  // delete from inside the open note: file options → delete → confirm
  await chooseView(page, 'cards');
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await page.click('#file-options-btn');
  await page.click('[data-action="delete-file"]');
  await page.click('[data-action="warning-proceed"]');
  await expect(page.locator('#file-content-modal')).toBeHidden();

  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.appState.myFiles.length)).toBe(0);
  await expect(page.locator('#output .empty-state')).toContainText('No notes in this folder yet');
});
