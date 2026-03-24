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

  test('writes open entry to backup.gypsum when file modal is opened', async ({ page }) => {
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

  test('appends close entry when modal is closed', async ({ page }) => {
    await setupMockDirectoryWithWrite(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForBackupEntries(page, 1);

    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    await waitForBackupEntries(page, 2);

    const entries = await page.evaluate(() => JSON.parse(window.__backupFileContent));
    expect(entries).toHaveLength(2);
    expect(entries[1].event).toBe('close');
    expect(entries[1].filename).toBe('notes.md');
  });

  test('backup.gypsum does not appear in the file list', async ({ page }) => {
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
