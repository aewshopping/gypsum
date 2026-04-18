const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithHistory } = require('./helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

async function openModal(page) {
  await page.click('[data-click-loadfolder]');
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 1);
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

test.describe('editor DOM persistence and no accumulation', () => {

  test('live editor is preserved (hidden) when switching to html view', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    expect(await page.locator('#modal-content-text .text-editor').count()).toBe(1);

    await switchToHtml(page);

    // .text-editor still in DOM but hidden via display:none
    expect(await page.locator('#modal-content-text .text-editor').count()).toBe(1);
    const isHidden = await page.evaluate(() => {
      const el = document.querySelector('#modal-content-text .text-editor');
      return el && window.getComputedStyle(el).display === 'none';
    });
    expect(isHidden).toBe(true);

    // HTML content is visible
    await expect(page.locator('#modal-content-text')).toContainText('Current content today');
  });

  test('live editor reappears and only one copy exists after toggling back to txt', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await switchToHtml(page);
    await switchToTxt(page);

    expect(await page.locator('#modal-content-text .text-editor').count()).toBe(1);
    const isVisible = await page.evaluate(() => {
      const el = document.querySelector('#modal-content-text .text-editor');
      return el && window.getComputedStyle(el).display !== 'none';
    });
    expect(isVisible).toBe(true);
  });

  test('html content nodes are removed when switching back to txt', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await switchToHtml(page);
    await switchToTxt(page);

    // Only .text-editor should remain as a direct child
    const nonEditorDirectChildren = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#modal-content-text > *'))
        .filter(el => !el.classList.contains('text-editor')).length
    );
    expect(nonEditorDirectChildren).toBe(0);
  });

  test('live editor is preserved (hidden) when browsing a historical snapshot', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);
    await switchToTxt(page);

    await page.selectOption('#file-content-history-select', { index: 2 });

    expect(await page.locator('#modal-content-text .text-editor').count()).toBe(1);
    const isHidden = await page.evaluate(() => {
      const el = document.querySelector('#modal-content-text .text-editor');
      return el && window.getComputedStyle(el).display === 'none';
    });
    expect(isHidden).toBe(true);

    // A separate read-only pre (no .text-editor) holds the historical content
    const historicalPreCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#modal-content-text pre'))
        .filter(p => !p.classList.contains('text-editor')).length
    );
    expect(historicalPreCount).toBe(1);
  });

  test('historical pre is removed and live editor reappears on return to current', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);
    await switchToTxt(page);

    await page.selectOption('#file-content-history-select', { index: 2 });
    await page.selectOption('#file-content-history-select', { value: 'current' });

    expect(await page.locator('#modal-content-text .text-editor').count()).toBe(1);
    const isVisible = await page.evaluate(() => {
      const el = document.querySelector('#modal-content-text .text-editor');
      return el && window.getComputedStyle(el).display !== 'none';
    });
    expect(isVisible).toBe(true);

    const historicalPreCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#modal-content-text pre'))
        .filter(p => !p.classList.contains('text-editor')).length
    );
    expect(historicalPreCount).toBe(0);
  });

  test('multiple view round trips never accumulate .text-editor copies or stale children', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);
    await switchToTxt(page);

    // 3 round trips across different view combinations
    await switchToHtml(page);
    await switchToTxt(page);
    await page.selectOption('#file-content-history-select', { index: 2 });
    await page.selectOption('#file-content-history-select', { value: 'current' });
    await switchToHtml(page);
    await switchToTxt(page);

    expect(await page.locator('#modal-content-text .text-editor').count()).toBe(1);

    const nonEditorDirectChildren = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#modal-content-text > *'))
        .filter(el => !el.classList.contains('text-editor')).length
    );
    expect(nonEditorDirectChildren).toBe(0);
  });

});
