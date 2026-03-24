const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithWrite, setupMockDirectoryWithHistory } = require('./helpers');

// Helper: wait until the history select has at least N options populated.
// Needed because readBackupHistory runs as a fire-and-forget async call.
async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

test.describe('history select in file content modal', () => {

  test('select is visible with only "current" when no prior history exists', async ({ page }) => {
    await setupMockDirectoryWithWrite(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForHistoryOptions(page, 1);

    const select = page.locator('#file-content-history-select');
    await expect(select).toBeVisible();

    const optionCount = await select.evaluate(el => el.options.length);
    expect(optionCount).toBe(1);

    const firstOptionText = await select.evaluate(el => el.options[0].text);
    expect(firstOptionText).toBe('current');
  });

  test('select shows historical timestamps when prior entries exist', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForHistoryOptions(page, 2);

    const optionCount = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options.length
    );
    expect(optionCount).toBe(2);

    const firstOptionText = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options[0].text
    );
    expect(firstOptionText).toBe('current');
  });

  test('timestamps are formatted as yyyy-mm-dd hh:mm:ss', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForHistoryOptions(page, 2);

    // Mock uses '2025-01-15T09:30:00.000Z' → should format as '2025-01-15 09:30:00'
    const secondOptionText = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options[1].text
    );
    expect(secondOptionText).toBe('2025-01-15 09:30:00');
  });

  test('selecting a historical entry renders that content in the modal', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForHistoryOptions(page, 2);
    await page.selectOption('#file-content-history-select', { index: 1 });

    await expect(page.locator('#modal-content-text')).toContainText('Old content from yesterday');
  });

  test('selecting current after a historical entry restores the current file content', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForHistoryOptions(page, 2);

    await page.selectOption('#file-content-history-select', { index: 1 });
    await expect(page.locator('#modal-content-text')).toContainText('Old content from yesterday');

    await page.selectOption('#file-content-history-select', { value: 'current' });
    await expect(page.locator('#modal-content-text')).toContainText('Current content today');
  });

  test('most recent entry is hidden when its content matches the current file', async ({ page }) => {
    await page.addInitScript(() => {
      const sameContent = '# My Notes\nCurrent content today #work';
      const olderContent = '# My Notes\nOlder content from before';

      // Oldest-first order, as saveBackupEntry appends and readBackupHistory reverses.
      window.__backupFileContent = JSON.stringify([
        { filepath: 'notes.md', filename: 'notes.md', content: olderContent,  timestamp: '2025-01-14T08:00:00.000Z', event: 'open' },
        { filepath: 'notes.md', filename: 'notes.md', content: sameContent,   timestamp: '2025-01-15T10:00:00.000Z', event: 'open' },
      ], null, 2);

      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }),
      });
      const backupHandle = {
        getFile: async () => ({ text: async () => window.__backupFileContent }),
        createWritable: async () => ({
          write: async (c) => { window.__backupFileContent = c; },
          close: async () => {},
        }),
      };
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () { yield makeFile('notes.md', sameContent); },
        getFileHandle: async (name, _options) => {
          if (name === 'backup.gypsum') return backupHandle;
          throw new Error(`Unexpected: ${name}`);
        },
      });
    });

    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    // Wait long enough for the async history read to settle, then check options.
    // Two raw entries but the newest matches current, so only "current" + older entry = 2 options.
    await waitForHistoryOptions(page, 2);

    const optionCount = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options.length
    );
    expect(optionCount).toBe(2); // "current" + 1 older entry (newest suppressed)

    const secondOptionText = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options[1].text
    );
    expect(secondOptionText).toBe('2025-01-14 08:00:00');
  });

  test('history entries only show for the correct file, not other files', async ({ page }) => {
    // Pre-populate history for notes.md, then open a second file with no history
    await page.addInitScript(() => {
      const entry = {
        filepath: 'notes.md', filename: 'notes.md',
        content: 'Old notes content', timestamp: '2025-01-15T09:30:00.000Z', event: 'open',
      };
      window.__backupFileContent = JSON.stringify([entry], null, 2);

      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }),
      });
      const backupHandle = {
        getFile: async () => ({ text: async () => window.__backupFileContent }),
        createWritable: async () => ({
          write: async (c) => { window.__backupFileContent = c; },
          close: async () => {},
        }),
      };
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () {
          yield makeFile('notes.md', 'Current notes content');
          yield makeFile('other.md', 'Other file content #personal');
        },
        getFileHandle: async (name, _options) => {
          if (name === 'backup.gypsum') return backupHandle;
          throw new Error(`Unexpected: ${name}`);
        },
      });
    });

    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid')).toHaveCount(2);

    // Open other.md — it has no history entries
    await page.locator('[data-action="open-file-content-modal"][data-filename="other.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForHistoryOptions(page, 1);

    const optionCount = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options.length
    );
    expect(optionCount).toBe(1); // only "current", no history for other.md
  });

});
