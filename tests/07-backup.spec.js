const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithWrite, setupMockFiles } = require('./helpers');

// Helper: wait until window.__backupFileContent parses to at least N entries
async function waitForBackupEntries(page, count) {
  await page.waitForFunction((n) => {
    if (!window.__backupFileContent) return false;
    try { return JSON.parse(window.__backupFileContent).length >= n; } catch { return false; }
  }, count);
}

test.describe('local file backup', () => {

  test('writes open entry to history.gypsum when file modal is opened', async ({ page }) => {
    await setupMockDirectoryWithWrite(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid')).toHaveCount(1);

    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForBackupEntries(page, 1);

    const entries = await page.evaluate(() => JSON.parse(window.__backupFileContent));
    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe('open');
    expect(entries[0].filename).toBe('notes.md');
    expect(entries[0].content).toContain('My Notes');
    expect(typeof entries[0].timestamp).toBe('string');
  });

  test('deduplicates close event when content unchanged, updating timestamp only', async ({ page }) => {
    await setupMockDirectoryWithWrite(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForBackupEntries(page, 1);
    const snapshotAfterOpen = await page.evaluate(() => window.__backupFileContent);
    const timestampAfterOpen = JSON.parse(snapshotAfterOpen)[0].timestamp;

    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    // Wait for the backup to be rewritten (timestamp update triggers a new write)
    await page.waitForFunction((prev) => window.__backupFileContent !== prev, snapshotAfterOpen);

    const entries = await page.evaluate(() => JSON.parse(window.__backupFileContent));
    expect(entries).toHaveLength(1);
    expect(entries[0].filename).toBe('notes.md');
    expect(entries[0].timestamp).not.toBe(timestampAfterOpen);
  });

  test('appends a new entry when a different file is opened', async ({ page }) => {
    await page.addInitScript(() => {
      window.__backupFileContent = '';

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
          yield makeFile('alpha.md', '# Alpha\nFirst file #work');
          yield makeFile('beta.md', '# Beta\nSecond file #personal');
        },
        getFileHandle: async (name) => {
          if (name === 'history.gypsum') return backupHandle;
          throw new Error(`Unexpected: ${name}`);
        },
      });
    });

    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid')).toHaveCount(2);

    // Open first file
    await page.locator('[data-action="open-file-content-modal"][data-filename="alpha.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForBackupEntries(page, 1);

    // Close, then open second file — different filename+content → must append
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();
    await page.locator('[data-action="open-file-content-modal"][data-filename="beta.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForBackupEntries(page, 2);

    const entries = await page.evaluate(() => JSON.parse(window.__backupFileContent));
    expect(entries).toHaveLength(2);
    expect(entries[0].filename).toBe('alpha.md');
    expect(entries[1].filename).toBe('beta.md');
  });

  test('deduplicates same-file content when another file was opened in between', async ({ page }) => {
    await page.addInitScript(() => {
      window.__backupFileContent = '';

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
          yield makeFile('alpha.md', '# Alpha\nFirst file #work');
          yield makeFile('beta.md', '# Beta\nSecond file #personal');
        },
        getFileHandle: async (name) => {
          if (name === 'history.gypsum') return backupHandle;
          throw new Error(`Unexpected: ${name}`);
        },
      });
    });

    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid')).toHaveCount(2);

    // Open alpha, close alpha → 1 entry (close deduplicates against the open)
    await page.locator('[data-action="open-file-content-modal"][data-filename="alpha.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForBackupEntries(page, 1);
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    // Open beta → 2 entries total
    await page.locator('[data-action="open-file-content-modal"][data-filename="beta.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForBackupEntries(page, 2);
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    // Re-open alpha with identical content — must deduplicate against alpha's earlier entry,
    // not beta's (the globally last entry). Entry count must stay at 2.
    const snapshotBefore = await page.evaluate(() => window.__backupFileContent);
    await page.locator('[data-action="open-file-content-modal"][data-filename="alpha.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await page.waitForFunction((prev) => window.__backupFileContent !== prev, snapshotBefore);

    const entries = await page.evaluate(() => JSON.parse(window.__backupFileContent));
    expect(entries).toHaveLength(2);
    expect(entries[0].filename).toBe('alpha.md');
    expect(entries[1].filename).toBe('beta.md');
  });

  test('history.gypsum does not appear in the file list', async ({ page }) => {
    await setupMockDirectoryWithWrite(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');

    await expect(page.locator('.note-grid')).toHaveCount(1);
    await expect(page.locator('#fileCountElement')).toContainText('1 file');
  });

  test('does not write backup when files loaded via file picker', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await page.click('[data-click-loadfiles]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    // saveBackupEntry returns immediately when dirHandle is null — wait long enough
    // for any async work to settle, then confirm nothing was written
    await page.waitForTimeout(300);

    const backupContent = await page.evaluate(() => window.__backupFileContent);
    expect(backupContent).toBeFalsy();
  });

});
