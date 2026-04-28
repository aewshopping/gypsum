const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithDeleteSupport } = require('./helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

/**
 * Opens the directory, opens the first file in the file content modal, then
 * opens the rename modal (via the rename button inside the history select).
 */
async function openFileAndRenameModal(page) {
  await page.click('[data-click-loadfolder]');
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 1);
  // The rename button lives inside the history-select option element
  await page.evaluate(() => document.getElementById('file-options-btn').click());
  await expect(page.locator('#modal-file-options')).toBeVisible();
}

test.describe('delete file', () => {

  test('delete file button is visible in the rename modal', async ({ page }) => {
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await openFileAndRenameModal(page);
    await expect(page.locator('[data-action="delete-file"]')).toBeVisible();
  });

  test('clicking delete file shows warning modal with filename and correct button labels', async ({ page }) => {
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await openFileAndRenameModal(page);
    await page.click('[data-action="delete-file"]');
    await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
    await expect(page.locator('#modal-unsaved-warning-text')).toContainText('notes.md');
    await expect(page.locator('#modal-unsaved-warning-proceed')).toHaveText('Delete');
    await expect(page.locator('#modal-unsaved-warning-cancel')).toHaveText('Cancel');
  });

  test('clicking cancel dismisses the warning without creating a trash file', async ({ page }) => {
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await openFileAndRenameModal(page);
    await page.click('[data-action="delete-file"]');
    await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
    await page.click('[data-action="warning-cancel"]');
    await expect(page.locator('#modal-unsaved-warning')).not.toBeVisible();
    const trashFiles = await page.evaluate(() => Object.keys(window.__trashFiles));
    expect(trashFiles).toHaveLength(0);
  });

  test('confirming delete creates a trash file with the correct name pattern', async ({ page }) => {
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await openFileAndRenameModal(page);
    await page.click('[data-action="delete-file"]');
    await page.click('[data-action="warning-proceed"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    const trashFiles = await page.evaluate(() => Object.keys(window.__trashFiles));
    expect(trashFiles).toHaveLength(1);
    // notes.md is a root file so no folder prefix; name pattern: notes-YYYYMMDD-HHMMSS-trash.gypsum
    expect(trashFiles[0]).toMatch(/^notes-\d{8}-\d{6}-trash\.gypsum$/);
  });

  test('trash file contains the original file content', async ({ page }) => {
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await openFileAndRenameModal(page);
    await page.click('[data-action="delete-file"]');
    await page.click('[data-action="warning-proceed"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    const trashContent = await page.evaluate(() => Object.values(window.__trashFiles)[0]);
    expect(trashContent).toContain('My Notes');
  });

  test('deleted file is removed from the file list', async ({ page }) => {
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await openFileAndRenameModal(page);
    await page.click('[data-action="delete-file"]');
    await page.click('[data-action="warning-proceed"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();
    await expect(page.locator('.note-grid')).toHaveCount(0);
  });

});
