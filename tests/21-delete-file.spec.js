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

/**
 * Records whether #offscreen-note-target ever carries the modal transition-name class. The class can be
 * added and removed inside a single tick, so polling the live DOM misses it.
 */
async function watchOffscreenTargetTransitionClass(page) {
  await page.evaluate(() => {
    const btn = document.getElementById('offscreen-note-target');
    window.__offscreenGotTransitionClass = btn.classList.contains('moving-file-content-view');
    new MutationObserver(() => {
      if (btn.classList.contains('moving-file-content-view')) window.__offscreenGotTransitionClass = true;
    }).observe(btn, { attributes: true, attributeFilter: ['class'] });
  });
}

test.describe('delete file', () => {

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

  test('deleted file is removed from the file list', async ({ page }) => {
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await openFileAndRenameModal(page);
    await page.click('[data-action="delete-file"]');
    await page.click('[data-action="warning-proceed"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();
    await expect(page.locator('.note-grid')).toHaveCount(0);
  });

  test('deleting does not animate the note into the off-screen target', async ({ page }) => {
    // delete clears openedFileId on purpose — the file is gone, so the modal fades out.
    // Sweeping it off-screen would imply it went somewhere rather than being removed.
    await setupMockDirectoryWithDeleteSupport(page);
    await page.goto('/');
    await openFileAndRenameModal(page);
    await page.click('[data-action="delete-file"]');
    await watchOffscreenTargetTransitionClass(page);
    await page.click('[data-action="warning-proceed"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();
    expect(await page.evaluate(() => window.__offscreenGotTransitionClass)).toBe(false);
  });

});
