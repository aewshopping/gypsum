const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithHistory, loadFolder } = require('./helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

async function switchToTxt(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text .text-editor')).toBeVisible();
}

async function switchToHtml(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (t.checked) t.click();
  });
}

const editorCount = (page) => page.locator('#modal-content-text .text-editor').count();
const editorDisplay = (page) => page.evaluate(() => {
  const el = document.querySelector('#modal-content-text .text-editor');
  return el && window.getComputedStyle(el).display;
});

test('the live editor is kept across every view switch, and never duplicated', async ({ page }) => {
  await setupMockDirectoryWithHistory(page);
  await page.goto('/');
  await loadFolder(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 3);

  await switchToTxt(page);
  expect(await editorCount(page)).toBe(1);

  // Switching to html keeps the editor in the DOM but hides it
  await switchToHtml(page);
  expect(await editorCount(page)).toBe(1);
  expect(await editorDisplay(page)).toBe('none');
  await expect(page.locator('#modal-content-text')).toContainText('Current content today');

  await switchToTxt(page);
  expect(await editorCount(page)).toBe(1);
  expect(await editorDisplay(page)).not.toBe('none');

  // A historical version swaps in its own pre; returning to current must remove it
  await page.selectOption('#file-content-history-select', { index: 2 });
  await page.selectOption('#file-content-history-select', { value: 'current' });
  expect(await editorCount(page)).toBe(1);
  expect(await editorDisplay(page)).not.toBe('none');

  // Another round trip on top — nothing may accumulate
  await switchToHtml(page);
  await switchToTxt(page);

  expect(await editorCount(page)).toBe(1);
  expect(await page.evaluate(() =>
    Array.from(document.querySelectorAll('#modal-content-text > *'))
      .filter(el => !el.classList.contains('text-editor')).length
  )).toBe(0);
});
