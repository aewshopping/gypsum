const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithAutosaveSupport } = require('./helpers');

// Shared helpers (same patterns as 12-save-button.spec.js)

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

async function editContent(page, text) {
  await page.evaluate((content) => {
    const pre = document.querySelector('#modal-content-text pre');
    pre.textContent = content;
    pre.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

// Advance the fake clock past the 3-second debounce, then wait for async file ops.
async function fireDebouncedAutosave(page) {
  await page.clock.runFor(3001);
  await page.waitForTimeout(300);
}

// ─── Temp file creation ───────────────────────────────────────────────────────

test.describe('autosave temp file creation', () => {

  test('creates a -temp.gypsum file after editing and the debounce period', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();
    await editContent(page, 'my new content');
    await fireDebouncedAutosave(page);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).toContain('notes.md-temp.gypsum');
  });

  test('the intermediate save file is deleted after the temp file is verified', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();
    await editContent(page, 'my new content');
    await fireDebouncedAutosave(page);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).not.toContain('notes.md-save.gypsum');
  });

  test('temp file content matches the edited text', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();
    await editContent(page, 'updated text for autosave');
    await fireDebouncedAutosave(page);

    const tempContent = await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum']);
    expect(tempContent).toBe('updated text for autosave');
  });

  test('autosave logs the temp filename to the console on success', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    const logPromise = page.waitForEvent('console',
      msg => msg.text().includes('Autosaved')
    );

    await page.clock.install();
    await editContent(page, 'logging test content');
    await page.clock.runFor(3001);

    const msg = await logPromise;
    expect(msg.text()).toContain('notes.md-temp.gypsum');
  });

});

// ─── Guard conditions ─────────────────────────────────────────────────────────

test.describe('autosave guard conditions', () => {

  test('does not autosave when no editing has occurred (no input events dispatched)', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();
    // Advance well past both the debounce (3 s) and min interval (60 s)
    await page.clock.runFor(65000);
    await page.waitForTimeout(200);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).not.toContain('notes.md-temp.gypsum');
  });

  test('does not autosave when the render toggle is switched back to HTML before the debounce fires', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();
    await editContent(page, 'edited in text mode');

    // Switch to HTML mode — autosave guard must reject this
    await page.evaluate(() => {
      const t = document.getElementById('render_toggle');
      if (t.checked) t.click();
    });

    await fireDebouncedAutosave(page);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).not.toContain('notes.md-temp.gypsum');
  });

  test('does not autosave when viewing a historical version', async ({ page }) => {
    // Custom mock: history + autosave (removeEntry) support combined
    await page.addInitScript(() => {
      window.__savedFiles = {};
      const historicalEntry = {
        filepath: 'notes.md', filename: 'notes.md',
        content: '# My Notes\nOld content from yesterday',
        timestamp: '2025-01-15T09:30:00.000Z', event: 'open',
      };
      window.__backupFileContent = JSON.stringify([historicalEntry], null, 2);

      const currentContent = '# My Notes\nCurrent content today';
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }),
      });
      const backupHandle = {
        getFile: async () => ({ text: async () => window.__backupFileContent }),
        createWritable: async () => ({ write: async (c) => { window.__backupFileContent = c; }, close: async () => {} }),
      };
      const gypsumDirHandle = {
        getFileHandle: async (name, _options) => {
          if (!(name in window.__savedFiles)) window.__savedFiles[name] = '';
          return {
            getFile: async () => ({ text: async () => window.__savedFiles[name] }),
            createWritable: async () => ({ write: async (c) => { window.__savedFiles[name] = c; }, close: async () => {} }),
          };
        },
        removeEntry: async (name) => { delete window.__savedFiles[name]; },
      };
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () { yield makeFile('notes.md', currentContent); },
        getFileHandle: async (name) => {
          if (name === 'history.gypsum') return backupHandle;
          throw new Error(`Unexpected: ${name}`);
        },
        getDirectoryHandle: async (name) => {
          if (name === '.gypsum') return gypsumDirHandle;
          throw new Error(`Unexpected: ${name}`);
        },
      });
    });

    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);
    await switchToTxt(page);

    await page.clock.install();
    // Schedule an autosave while viewing the current version
    await editContent(page, 'edited while viewing current');

    // Navigate to a historical version before the debounce fires
    await page.selectOption('#file-content-history-select', { index: 2 });

    await fireDebouncedAutosave(page);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).not.toContain('notes.md-temp.gypsum');
  });

  test('does not autosave when the content is identical to when the file was opened', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();
    // Set content back to exactly the original file content
    await editContent(page, '# My Notes\nSome content here');
    await fireDebouncedAutosave(page);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).not.toContain('notes.md-temp.gypsum');
  });

});

// ─── Timing ───────────────────────────────────────────────────────────────────

test.describe('autosave timing', () => {

  test('does not autosave before the 3-second debounce period has elapsed', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();
    await editContent(page, 'quick edit');

    // Advance only 1 second — debounce has not fired yet
    await page.clock.runFor(1000);
    await page.waitForTimeout(100);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).not.toContain('notes.md-temp.gypsum');
  });

  test('does not autosave a second time when within the 1-minute minimum interval', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();

    // First autosave
    await editContent(page, 'first edit');
    await fireDebouncedAutosave(page);
    expect(await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum'])).toBe('first edit');

    // Second edit — but only 3 seconds later (far less than the 60-second minimum interval)
    await editContent(page, 'second edit');
    await fireDebouncedAutosave(page);

    // Temp file must still hold the first autosave's content
    const tempContent = await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum']);
    expect(tempContent).toBe('first edit');
  });

  test('autosaves again once the minimum interval has elapsed', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();

    // First autosave
    await editContent(page, 'first edit');
    await fireDebouncedAutosave(page);
    expect(await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum'])).toBe('first edit');

    // Advance past the minimum interval first, then edit and wait for debounce.
    // (Advancing before the edit ensures the minInterval check passes when the
    // debounce timer fires — not merely 3 s after the first autosave.)
    await page.clock.runFor(60001);
    await editContent(page, 'second edit');
    await fireDebouncedAutosave(page);

    const tempContent = await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum']);
    expect(tempContent).toBe('second edit');
  });

});

// ─── Coexistence with manual save ─────────────────────────────────────────────

test.describe('autosave coexistence with manual save', () => {

  test('manual save (Ctrl+S) still produces a save file after autosave has run', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // Trigger autosave first
    await page.clock.install();
    await editContent(page, 'autosaved content');
    await fireDebouncedAutosave(page);
    expect(await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum'])).toBe('autosaved content');

    // Now manual save with different content
    await editContent(page, 'manually saved content');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).toContain('notes.md-save.gypsum');
    expect(savedFiles['notes.md-save.gypsum']).toBe('manually saved content');
  });

  test('autosave does not affect the manual save popover', async ({ page }) => {
    await setupMockDirectoryWithAutosaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // Autosave runs silently — no popover
    await page.clock.install();
    await editContent(page, 'autosaved content');
    await fireDebouncedAutosave(page);

    await expect(page.locator('#save-popover')).toBeHidden();

    // Manual save shows the popover
    await page.evaluate(() => document.getElementById('save-btn').click());
    await page.waitForTimeout(300);
    await expect(page.locator('#save-popover')).toBeVisible();
    await expect(page.locator('#save-popover')).toHaveText('Saved');
  });

});
