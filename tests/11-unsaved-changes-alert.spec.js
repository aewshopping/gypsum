const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithHistory, loadFolder } = require('./helpers');

/**
 * These run with Autosave at its default (on), but setupMockDirectoryWithHistory has no
 * save support — so the flush in handleCloseModal attempts a save, fails, and leaves the
 * dirty flag set. That is deliberate coverage of the fallback: a failed write must still
 * warn rather than silently discard. For the plain autosave-off behaviour, see
 * 13-autosave.spec.js.
 */

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

async function openModal(page) {
  await loadFolder(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 1);
}

async function switchToTxt(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
}

async function editContent(page) {
  await page.evaluate(() => {
    const pre = document.querySelector('#modal-content-text pre');
    pre.textContent = 'edited content';
    pre.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const modal = '#file-content-modal';
const warningDialog = '#modal-unsaved-warning';
const closeBtn = '[data-action="close-file-content-modal"]';
const discardBtn = '[data-action="warning-proceed"]';
const keepBtn = '[data-action="warning-cancel"]';

test.describe('unsaved changes alert', () => {

  test('"Keep editing" leaves the modal open with the edits intact', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);

    await page.click(closeBtn);
    await expect(page.locator(warningDialog)).toBeVisible();
    await expect(page.locator(modal)).toBeVisible();

    await page.click(keepBtn);
    await expect(page.locator(warningDialog)).not.toBeVisible();
    await expect(page.locator(modal)).toBeVisible();
    expect(await page.locator('#modal-content-text pre').textContent()).toBe('edited content');

    // beforeunload must be prevented while the edits are still unsaved
    expect(await page.evaluate(() => {
      const evt = new Event('beforeunload', { cancelable: true, bubbles: true });
      window.dispatchEvent(evt);
      return evt.defaultPrevented;
    })).toBe(true);
  });

  test('"Discard changes" closes the modal, and reopening starts clean', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);

    await page.click(closeBtn);
    await expect(page.locator(warningDialog)).toBeVisible();
    await page.click(discardBtn);
    await expect(page.locator(warningDialog)).not.toBeVisible();
    await expect(page.locator(modal)).not.toBeVisible();

    // Reopen — no warning dialog on a clean open, and closing needs no confirmation
    await page.locator('.note-grid').first().click();
    await expect(page.locator(modal)).toBeVisible();
    await expect(page.locator(warningDialog)).not.toBeVisible();
    await page.click(closeBtn);
    await expect(page.locator(modal)).not.toBeVisible();
    await expect(page.locator(warningDialog)).not.toBeVisible();
  });

});
