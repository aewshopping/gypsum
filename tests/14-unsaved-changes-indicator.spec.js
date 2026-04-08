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

// The unsaved-changes indicator is driven by the 'saved' class on #modal-content:
//   no 'saved' class → indicator visible (unsaved changes)
//   has 'saved' class → no indicator (content is saved / clean)

test.describe('unsaved changes indicator in history select button', () => {

  test('no indicator shown on initial open for a file with Windows \\r\\n line endings', async ({ page }) => {
    await page.addInitScript(() => {
      const content = '# My Notes\r\nCurrent content today #work';
      const makeFile = (name, c) => ({
        kind: 'file', name,
        getFile: async () => ({ name, size: c.length, lastModified: Date.now(), text: async () => c }),
      });
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () { yield makeFile('notes.md', content); },
        getFileHandle: async () => { throw new Error('no backup'); },
      });
    });
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForHistoryOptions(page, 1);

    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);
  });

  test('no indicator shown on initial open with no edits', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);

    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);
  });

  test('indicator appears after editing content in txt mode', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);

    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);
  });

  test('indicator is removed when switching to a historical version', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);

    // Confirm indicator is present before switching
    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);

    // Wait for full history to load (on-open snapshot v-1 + pre-existing v-2 = 3 total)
    await waitForHistoryOptions(page, 3);
    await page.selectOption('#file-content-history-select', { index: 2 });

    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);
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
    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);

    // Return to current version — edits are still unsaved
    await page.selectOption('#file-content-history-select', { value: 'current' });

    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);
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
    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);

    // Delete the typed character — content is now identical to the original
    await page.keyboard.press('Backspace');
    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);
  });

  test('indicator disappears after Ctrl+Z undo back to original content', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);

    await page.keyboard.press('Control+z');
    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);
  });

  test('no indicator when switching history → current without any edits', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);

    await waitForHistoryOptions(page, 3);
    // View historical version (no edits made)
    await page.selectOption('#file-content-history-select', { index: 2 });
    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);

    // Return to current — still no edits
    await page.selectOption('#file-content-history-select', { value: 'current' });

    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);
  });

});
