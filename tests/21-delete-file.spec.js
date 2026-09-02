const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithDeleteSupport, loadFolder } = require('./helpers');

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
  await loadFolder(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 1);
  // The rename button lives inside the history-select option element
  await page.evaluate(() => document.getElementById('file-options-btn').click());
  await expect(page.locator('#modal-file-options')).toBeVisible();
}

const trashFiles = (page) => page.evaluate(() => Object.keys(window.__trashFiles));

test.describe('delete file', () => {

  test('the warning names the file, and cancelling deletes nothing', async ({ page }) => {
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await openFileAndRenameModal(page);
    await page.click('[data-action="delete-file"]');

    await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
    await expect(page.locator('#modal-unsaved-warning-text')).toContainText('notes.md');
    await expect(page.locator('#modal-unsaved-warning-proceed')).toHaveText('Delete');
    await expect(page.locator('#modal-unsaved-warning-cancel')).toHaveText('Cancel');

    await page.click('[data-action="warning-cancel"]');
    await expect(page.locator('#modal-unsaved-warning')).not.toBeVisible();
    expect(await trashFiles(page)).toHaveLength(0);
    await expect(page.locator('#file-content-modal')).toBeVisible();
  });

  test('confirming moves the file to trash and drops it from the list', async ({ page }) => {
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await openFileAndRenameModal(page);
    await page.click('[data-action="delete-file"]');
    await page.click('[data-action="warning-proceed"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    const trash = await trashFiles(page);
    expect(trash).toHaveLength(1);
    // notes.md is a root file so no folder prefix; name pattern: notes-YYYYMMDD-HHMMSS-trash.gypsum
    expect(trash[0]).toMatch(/^notes-\d{8}-\d{6}-trash\.gypsum$/);
    await expect(page.locator('.note-grid')).toHaveCount(0);
  });

  test('deleting a file with unsaved edits does not write it back', async ({ page }) => {
    // delete-file-click calls doClose() directly, bypassing handleCloseModal and so the
    // closing autosave — a file that was just deleted must not be saved back to disk.
    // The mock throws on any .gypsum handle other than history.gypsum, so an attempted
    // save surfaces as a logged 'Save failed:'.
    const saveErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('Save failed')) saveErrors.push(msg.text());
    });

    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await loadFolder(page);
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForHistoryOptions(page, 1);

    // Dirty the file so a save would have something to write
    await page.evaluate(() => {
      const t = document.getElementById('render_toggle');
      if (!t.checked) t.click();
    });
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      pre.textContent = 'edits that must not survive the delete';
      pre.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.evaluate(() => document.getElementById('file-options-btn').click());
    await expect(page.locator('#modal-file-options')).toBeVisible();
    await page.click('[data-action="delete-file"]');
    await page.click('[data-action="warning-proceed"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    expect(saveErrors).toHaveLength(0);
    await expect(page.locator('.note-grid')).toHaveCount(0);
  });

});
