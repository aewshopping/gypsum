const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithSaveSupport, setupMockDirectoryWithHistoryAndSave } = require('./helpers');

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

async function switchToHtml(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (t.checked) t.click();
  });
}

async function clickSaveBtn(page) {
  await page.evaluate(() => document.getElementById('save-btn').click());
}

// Force the save button visible regardless of state — used in guard tests to
// verify the handler itself rejects calls made under invalid conditions.
async function forceShowSaveBtn(page) {
  await page.evaluate(() => {
    document.getElementById('save-btn-container').hidden = false;
  });
}

test.describe('save button visibility', () => {

  test('save button is hidden when modal first opens (default HTML mode)', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);

    await expect(page.locator('#save-btn-container')).toBeHidden();
  });

  test('save button becomes visible after switching to text mode', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);

    await switchToTxt(page);

    await expect(page.locator('#save-btn-container')).toBeVisible();
  });

  test('save button becomes hidden again after switching back to HTML mode', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);

    await switchToTxt(page);
    await switchToHtml(page);

    await expect(page.locator('#save-btn-container')).toBeHidden();
  });

  test('save button is hidden when navigating to a historical version in text mode', async ({ page }) => {
    await setupMockDirectoryWithHistoryAndSave(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);

    await switchToTxt(page);
    await page.selectOption('#file-content-history-select', { index: 2 });

    await expect(page.locator('#save-btn-container')).toBeHidden();
  });

  test('save button reappears after returning to current version in text mode', async ({ page }) => {
    await setupMockDirectoryWithHistoryAndSave(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);

    await switchToTxt(page);
    await page.selectOption('#file-content-history-select', { index: 2 });
    await page.selectOption('#file-content-history-select', { value: 'current' });

    await expect(page.locator('#save-btn-container')).toBeVisible();
  });

});

test.describe('save button guard conditions', () => {

  test('handler does not save when forced visible in HTML mode', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    // Modal opens in HTML mode (render_toggle unchecked). Force the button visible
    // as if a CSS bug had revealed it, and click it.
    await forceShowSaveBtn(page);
    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).toHaveLength(0);
  });

  test('handler does not save when forced visible while viewing a historical version', async ({ page }) => {
    await setupMockDirectoryWithHistoryAndSave(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);

    await switchToTxt(page);
    await page.selectOption('#file-content-history-select', { index: 2 });
    // Button is now hidden (historical version). Force it visible and click.
    await forceShowSaveBtn(page);
    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).toHaveLength(0);
  });

});

test.describe('save file functionality', () => {

  test('top-level file is saved as {filename}-save.gypsum (no dir prefix)', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    // top-level file: filepath === filename, so no dir prefix
    expect(Object.keys(savedFiles)).toContain('notes.md-save.gypsum');
    expect(Object.keys(savedFiles)).not.toContain('notes.md-notes.md-save.gypsum');
  });

  test('file in a subdirectory is saved as {dir}-{filename}-save.gypsum', async ({ page }) => {
    await page.addInitScript(() => {
      window.__savedFiles = {};
      window.__backupFileContent = '';
      const fileContent = 'Nested file content';
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }),
      });
      const makeDir = (name, entries) => ({
        kind: 'directory', name,
        values: async function* () { yield* entries; },
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
      };
      window.showDirectoryPicker = async () => ({
        ...makeDir('root', [makeDir('subdir', [makeFile('notes.md', fileContent)])]),
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
    await switchToTxt(page);

    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    // filepath='subdir/notes.md', filename='notes.md' → dir part is 'subdir'
    expect(Object.keys(savedFiles)).toContain('subdir-notes.md-save.gypsum');
    expect(Object.keys(savedFiles)).not.toContain('subdir-notes.md-notes.md-save.gypsum');
  });

  test('saved file has newlines (\\n) not <br> for line breaks', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    const savedContent = await page.evaluate(
      () => window.__savedFiles['notes.md-save.gypsum']
    );
    expect(savedContent).toContain('\n');
    expect(savedContent).not.toContain('<br>');
  });

  test('saved file content matches the original file text', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    const savedContent = await page.evaluate(
      () => window.__savedFiles['notes.md-save.gypsum']
    );
    expect(savedContent).toBe('# My Notes\nSome content here');
  });

  test('HTML entities in file content (&, <, >) are decoded correctly in the saved file', async ({ page }) => {
    await page.addInitScript(() => {
      window.__savedFiles = {};
      window.__backupFileContent = '';
      const fileContent = 'Cats & dogs are <great> and "nice"';
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
      };
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () { yield makeFile('notes.md', fileContent); },
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
    await switchToTxt(page);

    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    const savedContent = await page.evaluate(
      () => window.__savedFiles['notes.md-save.gypsum']
    );
    // HTML entities must be decoded back to literal characters
    expect(savedContent).toContain('&');
    expect(savedContent).toContain('<great>');
    expect(savedContent).not.toContain('&amp;');
    expect(savedContent).not.toContain('&lt;');
  });

  test('re-saving overwrites the previous save file', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // First save
    await clickSaveBtn(page);
    await page.waitForTimeout(200);

    // Edit content then save again
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      pre.textContent = 'updated content';
      pre.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    const savedContent = await page.evaluate(
      () => window.__savedFiles['notes.md-save.gypsum']
    );
    expect(savedContent).toBe('updated content');
  });

  test('console logs a success message after a successful save', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    const successPromise = page.waitForEvent('console',
      msg => msg.text().includes('Save verified')
    );
    await clickSaveBtn(page);
    const msg = await successPromise;
    expect(msg.text()).toContain('notes.md-save.gypsum');
  });

});

test.describe('save equivalence check', () => {

  test('no false positive: success is not logged when the saved file has different content', async ({ page }) => {
    // Tampered mock: write is discarded; getFile always returns different content.
    await page.addInitScript(() => {
      window.__backupFileContent = '';
      const fileContent = '# My Notes\nSome content here';
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }),
      });
      const backupHandle = {
        getFile: async () => ({ text: async () => window.__backupFileContent }),
        createWritable: async () => ({ write: async (c) => { window.__backupFileContent = c; }, close: async () => {} }),
      };
      // This gypsumDirHandle ignores writes and returns tampered content on read-back.
      const gypsumDirHandle = {
        getFileHandle: async (_name, _options) => ({
          getFile: async () => ({ text: async () => 'TAMPERED CONTENT — definitely not what was saved' }),
          createWritable: async () => ({
            write: async (_c) => { /* discard — simulate corrupted write */ },
            close: async () => {},
          }),
        }),
      };
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () { yield makeFile('notes.md', fileContent); },
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
    await switchToTxt(page);

    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(msg.text()));

    await clickSaveBtn(page);
    await page.waitForTimeout(400);

    const hasSuccessLog = consoleMessages.some(m => m.includes('Save verified'));
    expect(hasSuccessLog).toBe(false);
  });

  test('no false negative: success is logged when content includes line breaks and special chars', async ({ page }) => {
    // File with newlines and HTML-significant characters to exercise the full conversion path.
    await page.addInitScript(() => {
      window.__savedFiles = {};
      window.__backupFileContent = '';
      const fileContent = 'Title\nLine with & special <chars>\nAnother line';
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
      };
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () { yield makeFile('notes.md', fileContent); },
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
    await switchToTxt(page);

    const successPromise = page.waitForEvent('console',
      msg => msg.text().includes('Save verified')
    );
    await clickSaveBtn(page);
    await successPromise; // resolves only if success was logged — no false negative
  });

});
