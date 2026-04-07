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

test.describe('history select — layout and displayed text', () => {

  // Open the modal and wait for the initial "current" option.
  async function openModal(page) {
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForHistoryOptions(page, 1);
  }

  test('select occupies most of the modal header width (not squashed)', async ({ page }) => {
    await setupMockDirectoryWithWrite(page);
    await page.goto('/');
    await openModal(page);

    const { selectWidth, headerWidth } = await page.evaluate(() => {
      const select = document.getElementById('file-content-history-select');
      const header = document.getElementById('file-content-header');
      return {
        selectWidth: select.getBoundingClientRect().width,
        headerWidth: header.getBoundingClientRect().width,
      };
    });

    // Select should occupy at least 60 % of the header — not squashed to a sliver
    expect(selectWidth).toBeGreaterThan(headerWidth * 0.6);
  });

  test('collapsed picker button shows filename only — no time label appended', async ({ page }) => {
    await setupMockDirectoryWithWrite(page);
    await page.goto('/');
    await openModal(page);

    // The <button> inside the select is what the user sees in the collapsed state.
    // innerText respects display:none — if CSS is working "current" must not appear.
    const { found, innerText } = await page.evaluate(() => {
      const btn = document.querySelector('#file-content-history-select button');
      if (!btn) return { found: false, innerText: '' };
      return { found: true, innerText: btn.innerText.trim() };
    });

    expect(found).toBe(true);
    expect(innerText).toContain('notes.md');
    expect(innerText).not.toContain('current');
  });

  test('history option in dropdown shows version label and timestamp — no filename', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    // With setupMockDirectoryWithHistory: on-open snapshot (v-1) + historical entry (v-2) = 3 total
    await waitForHistoryOptions(page, 3);

    // History options should contain only version + time; the filename lives in the
    // button (collapsed picker) and must not be repeated in the dropdown list.
    // options[2] is the pre-existing historical entry (v-2).
    const { hasFilename, version, time } = await page.evaluate(() => {
      const opt = document.getElementById('file-content-history-select').options[2];
      return {
        hasFilename: !!opt.querySelector('.opt-filename'),
        version:     opt.querySelector('.opt-version')?.textContent  ?? '',
        time:        opt.querySelector('.opt-time')?.textContent     ?? '',
      };
    });

    expect(hasFilename).toBe(false);
    expect(version).toBe(' (v-2)');
    expect(time).toBe('2025-01-15 09:30:00');
  });

});

test.describe('history select in file content modal', () => {

  test('select shows on-open snapshot as first history entry', async ({ page }) => {
    await setupMockDirectoryWithWrite(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    // The on-open snapshot is saved before the select is populated, so it appears as v-1.
    await waitForHistoryOptions(page, 2);

    const select = page.locator('#file-content-history-select');
    await expect(select).toBeVisible();

    const optionCount = await select.evaluate(el => el.options.length);
    expect(optionCount).toBe(2); // "current version" + v-1 (on-open snapshot)

    const firstOptionTime = await select.evaluate(el => el.options[0].querySelector('.opt-time').textContent);
    expect(firstOptionTime).toBe('current version');
  });

  test('select shows historical timestamps when prior entries exist', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    // on-open snapshot (v-1) + pre-existing historical entry (v-2) = 3 total
    await waitForHistoryOptions(page, 3);

    const optionCount = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options.length
    );
    expect(optionCount).toBe(3);

    const firstOptionTime = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options[0].querySelector('.opt-time').textContent
    );
    expect(firstOptionTime).toBe('current version');
  });

  test('timestamps are formatted as yyyy-mm-dd hh:mm:ss', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForHistoryOptions(page, 3);

    // Mock uses '2025-01-15T09:30:00.000Z' → should format as '2025-01-15 09:30:00'.
    // options[2] is the pre-existing historical entry (v-2); options[1] is the on-open snapshot.
    const secondOptionTime = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options[2].querySelector('.opt-time').textContent
    );
    expect(secondOptionTime).toBe('2025-01-15 09:30:00');
  });

  test('selecting a historical entry renders that content in the modal', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForHistoryOptions(page, 3);
    // index 2 is the pre-existing historical entry (v-2)
    await page.selectOption('#file-content-history-select', { index: 2 });

    await expect(page.locator('#modal-content-text')).toContainText('Old content from yesterday');
  });

  test('selecting current after a historical entry restores the current file content', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForHistoryOptions(page, 3);

    await page.selectOption('#file-content-history-select', { index: 2 });
    await expect(page.locator('#modal-content-text')).toContainText('Old content from yesterday');

    await page.selectOption('#file-content-history-select', { value: 'current' });
    await expect(page.locator('#modal-content-text')).toContainText('Current content today');
  });

  test('snapshot from current open is shown in history even when content is unchanged', async ({ page }) => {
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
        getDirectoryHandle: async (name, _options) => {
          if (name === '.gypsum') return {
            getFileHandle: async (n, _opts) => {
              if (n === 'history.gypsum') return backupHandle;
              throw new Error(`Unexpected: ${n}`);
            },
          };
          throw new Error(`Unexpected getDirectoryHandle: ${name}`);
        },
      });
    });

    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    // sameContent entry deduplicates (timestamp refresh only), olderContent stays as v-2.
    // Both are shown: v-1 (sameContent, reference for edits) + v-2 (olderContent) = 3 total.
    await waitForHistoryOptions(page, 3);

    const optionCount = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options.length
    );
    expect(optionCount).toBe(3); // "current" + v-1 (sameContent) + v-2 (olderContent)

    const thirdOptionTime = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options[2].querySelector('.opt-time').textContent
    );
    expect(thirdOptionTime).toBe('2025-01-14 08:00:00');
  });

  test('history entries only show for the correct file, not other files', async ({ page }) => {
    // Pre-populate history for notes.md, then open a second file with no prior history
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
        getDirectoryHandle: async (name, _options) => {
          if (name === '.gypsum') return {
            getFileHandle: async (n, _opts) => {
              if (n === 'history.gypsum') return backupHandle;
              throw new Error(`Unexpected: ${n}`);
            },
          };
          throw new Error(`Unexpected getDirectoryHandle: ${name}`);
        },
      });
    });

    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid')).toHaveCount(2);

    // Open other.md — it has no prior history; the on-open snapshot becomes v-1
    await page.locator('[data-action="open-file-content-modal"][data-filename="other.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    await waitForHistoryOptions(page, 2);

    const optionCount = await page.evaluate(() =>
      document.getElementById('file-content-history-select').options.length
    );
    expect(optionCount).toBe(2); // "current" + v-1 (on-open snapshot for other.md only)
  });

});
