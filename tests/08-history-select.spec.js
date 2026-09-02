const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithWrite, setupMockDirectoryWithHistory, loadFolder } = require('./helpers');

// Helper: wait until the history select has at least N options populated.
// Needed because readBackupHistory runs as a fire-and-forget async call.
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
}

test.describe('history select in file content modal', () => {

  test('the on-open snapshot is offered as the first history entry', async ({ page }) => {
    await setupMockDirectoryWithWrite(page);
    await page.goto('/');
    await openModal(page);

    // The on-open snapshot is saved before the select is populated, so it appears as v-1.
    await waitForHistoryOptions(page, 2);

    const select = page.locator('#file-content-history-select');
    await expect(select).toBeVisible();

    expect(await select.evaluate(el => el.options.length)).toBe(2); // "current version" + v-1
    expect(await select.evaluate(el => el.options[0].querySelector('.opt-time').textContent))
      .toBe('current version');
  });

  test('selecting a historical entry swaps the content, and current restores it', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    // on-open snapshot (v-1) + pre-existing historical entry (v-2) = 3 options
    await waitForHistoryOptions(page, 3);

    // The mock timestamp is '2025-01-15T09:30:00.000Z' — options[2] is that entry.
    expect(await page.evaluate(() =>
      document.getElementById('file-content-history-select').options[2].querySelector('.opt-time').textContent
    )).toBe('2025-01-15 09:30:00');

    await page.selectOption('#file-content-history-select', { index: 2 });
    await expect(page.locator('#modal-content-text')).toContainText('Old content from yesterday');

    await page.selectOption('#file-content-history-select', { value: 'current' });
    await expect(page.locator('#modal-content-text')).toContainText('Current content today');
  });

});
