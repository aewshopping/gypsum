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
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
}

test.describe('undo/redo footer buttons', () => {

  test('undo and redo buttons are visible in the modal footer', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await expect(page.locator('[data-action="editor-undo"]')).toBeVisible();
    await expect(page.locator('[data-action="editor-redo"]')).toBeVisible();
  });

  test('undo button reverts typed text in the editor', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // Focus the editor and type a unique string
    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type('XYZTEST');

    const textWithEdit = await page.locator('#modal-content-text pre').textContent();
    expect(textWithEdit).toContain('XYZTEST');

    // Click the undo button and verify the typed text is gone
    await page.locator('[data-action="editor-undo"]').click();

    const textAfterUndo = await page.locator('#modal-content-text pre').textContent();
    expect(textAfterUndo).not.toContain('XYZTEST');
  });

  test('redo button reapplies text after an undo', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // Type something
    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type('XYZTEST');

    // Undo via keyboard so we know undo stack is valid
    await page.keyboard.press('Control+z');
    const textAfterUndo = await page.locator('#modal-content-text pre').textContent();
    expect(textAfterUndo).not.toContain('XYZTEST');

    // Redo via the button
    await page.locator('[data-action="editor-redo"]').click();

    const textAfterRedo = await page.locator('#modal-content-text pre').textContent();
    expect(textAfterRedo).toContain('XYZTEST');
  });

});
