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

async function editContent(page) {
  await page.evaluate(() => {
    const pre = document.querySelector('#modal-content-text pre');
    pre.textContent = 'edited content';
    pre.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Returns the current textContent of the .opt-filename span in the select button. */
async function getFilenameSpanText(page) {
  return page.evaluate(() => {
    const span = document.querySelector('#file-content-history-select button .opt-filename');
    return span ? span.textContent : null;
  });
}

test.describe('unsaved changes indicator in history select button', () => {

  test('no indicator shown on initial open with no edits', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);

    const text = await getFilenameSpanText(page);
    expect(text).toContain('notes.md');
    expect(text).not.toContain('●');
  });

  test('indicator appears after editing content in txt mode', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);

    const text = await getFilenameSpanText(page);
    expect(text).toContain('notes.md');
    expect(text).toContain('●');
  });

  test('indicator is removed when switching to a historical version', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);

    // Confirm indicator is present before switching
    expect(await getFilenameSpanText(page)).toContain('●');

    // Wait for full history to load (on-open snapshot v-1 + pre-existing v-2 = 3 total)
    await waitForHistoryOptions(page, 3);
    await page.selectOption('#file-content-history-select', { index: 2 });

    const text = await getFilenameSpanText(page);
    expect(text).toContain('notes.md');
    expect(text).not.toContain('●');
  });

  test('indicator reappears when returning to current version after viewing history', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);

    await waitForHistoryOptions(page, 3);
    // Switch to historical entry
    await page.selectOption('#file-content-history-select', { index: 2 });
    expect(await getFilenameSpanText(page)).not.toContain('●');

    // Return to current version — edits are still unsaved
    await page.selectOption('#file-content-history-select', { value: 'current' });

    const text = await getFilenameSpanText(page);
    expect(text).toContain('notes.md');
    expect(text).toContain('●');
  });

  test('indicator disappears after typing then deleting the typed character', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // Type a character directly into the contentEditable pre
    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    expect(await getFilenameSpanText(page)).toContain('●');

    // Delete the typed character — content is now identical to the original
    await page.keyboard.press('Backspace');
    expect(await getFilenameSpanText(page)).not.toContain('●');
  });

  test('indicator disappears after Ctrl+Z undo back to original content', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    expect(await getFilenameSpanText(page)).toContain('●');

    await page.keyboard.press('Control+z');
    expect(await getFilenameSpanText(page)).not.toContain('●');
  });

  test('no indicator when switching history → current without any edits', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);

    await waitForHistoryOptions(page, 3);
    // View historical version (no edits made)
    await page.selectOption('#file-content-history-select', { index: 2 });
    expect(await getFilenameSpanText(page)).not.toContain('●');

    // Return to current — still no edits
    await page.selectOption('#file-content-history-select', { value: 'current' });

    const text = await getFilenameSpanText(page);
    expect(text).toContain('notes.md');
    expect(text).not.toContain('●');
  });

});
