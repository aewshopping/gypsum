const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithHistory, loadFolder } = require('./helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

test('the undo and redo buttons drive the editor history', async ({ page }) => {
  await setupMockDirectoryWithHistory(page);
  await page.goto('/');
  await loadFolder(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 1);
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();

  const text = () => page.locator('#modal-content-text pre').textContent();

  await page.locator('#modal-content-text pre').click();
  await page.keyboard.press('End');
  await page.keyboard.type('XYZTEST');
  expect(await text()).toContain('XYZTEST');

  await page.locator('[data-action="editor-undo"]').click();
  expect(await text()).not.toContain('XYZTEST');

  await page.locator('[data-action="editor-redo"]').click();
  expect(await text()).toContain('XYZTEST');
});
