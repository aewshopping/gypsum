const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithSaveSupport, setupMockDirectoryWithHistoryAndSave, loadFolder } = require('./helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

async function openModal(page) {
  await loadFolder(page);
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

async function clickSaveBtn(page) {
  await page.evaluate(() => document.getElementById('save-btn').click());
}

test.describe('save button guard conditions', () => {

  test('handler saves in HTML mode (current version)', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    // Modal opens in HTML mode (render_toggle unchecked).
    await clickSaveBtn(page);
    await page.waitForTimeout(100);

    const deletedFiles = await page.evaluate(() => Object.keys(window.__deletedFiles));
    expect(deletedFiles).toContain('notes.md-save.gypsum');
  });

  test('handler does not save while viewing a historical version', async ({ page }) => {
    await setupMockDirectoryWithHistoryAndSave(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);

    await switchToTxt(page);
    await page.selectOption('#file-content-history-select', { index: 2 });
    await clickSaveBtn(page);
    await page.waitForTimeout(100);

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
    await page.waitForTimeout(100);

    const deletedFiles = await page.evaluate(() => Object.keys(window.__deletedFiles));
    // top-level file: filepath === filename, so no dir prefix
    // gypsum save file is created with the correct name then deleted after original file save
    expect(deletedFiles).toContain('notes.md-save.gypsum');
    expect(deletedFiles).not.toContain('notes.md-notes.md-save.gypsum');
  });

  test('saved file has newlines (\\n) not <br> for line breaks', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await clickSaveBtn(page);
    await page.waitForTimeout(100);

    const savedContent = await page.evaluate(
      () => window.__originalFiles['notes.md']
    );
    expect(savedContent).toContain('\n');
    expect(savedContent).not.toContain('<br>');
  });

  test('HTML entities in file content (&, <, >) are decoded correctly in the saved file', async ({ page }) => {
    await page.addInitScript(() => {
      window.__savedFiles = {};
      window.__backupFileContent = '';
      const fileContent = 'Cats & dogs are <great> and "nice"';
      window.__originalFiles = {};
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => window.__originalFiles[name] ?? content }),
        createWritable: async () => ({ write: async (c) => { window.__originalFiles[name] = c; }, close: async () => {} }),
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
    await page.waitForTimeout(100);

    const savedContent = await page.evaluate(
      () => window.__originalFiles['notes.md']
    );
    // HTML entities must be decoded back to literal characters
    expect(savedContent).toContain('&');
    expect(savedContent).toContain('<great>');
    expect(savedContent).not.toContain('&amp;');
    expect(savedContent).not.toContain('&lt;');
  });

  test('save button shows saved state after a successful save', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await clickSaveBtn(page);
    await page.waitForTimeout(100);

    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);
    await expect(page.locator('#save-btn')).not.toHaveClass(/\bsave-error\b/);
  });

  test('save button does not show saved state when verification fails', async ({ page }) => {
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
      const gypsumDirHandle = {
        getFileHandle: async (_name, _options) => ({
          getFile: async () => ({ text: async () => 'TAMPERED CONTENT' }),
          createWritable: async () => ({ write: async (_c) => {}, close: async () => {} }),
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

    // Edit content so the saved class is removed before we attempt the save
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      pre.textContent = 'edited content';
      pre.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);

    await clickSaveBtn(page);
    await page.waitForTimeout(100);

    // Verification fails so resetUnsavedBaseline is never called — saved class stays absent
    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);
    await expect(page.locator('#save-btn')).toHaveClass(/\bsave-error\b/);
  });

});

test.describe('Ctrl+S keyboard shortcut', () => {

  test('Ctrl+S saves the file in text mode / current version', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.keyboard.press('Control+s');
    await page.waitForTimeout(100);

    // gypsum save file is created then deleted after the original file is saved
    const deletedFiles = await page.evaluate(() => Object.keys(window.__deletedFiles));
    expect(deletedFiles).toContain('notes.md-save.gypsum');
  });

  test('Ctrl+S does not save when viewing a historical version', async ({ page }) => {
    await setupMockDirectoryWithHistoryAndSave(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);

    await switchToTxt(page);
    await page.selectOption('#file-content-history-select', { index: 2 });

    await page.keyboard.press('Control+s');
    await page.waitForTimeout(100);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).toHaveLength(0);
  });

});

// ─── Unsaved-state prominence follows the Autosave setting ───────────────────

/**
 * Reads the computed background and text colour of the save button, plus the background of
 * a neighbouring header button, which is the plain .svg-bg-tint the save button should match
 * when it is not shouting.
 */
async function saveBtnColours(page) {
  return page.evaluate(() => {
    const btn = document.getElementById('save-btn');
    const neighbour = document.querySelector('[data-action="editor-undo"]');
    return {
      background: getComputedStyle(btn).backgroundColor,
      color: getComputedStyle(btn).color,
      neighbourBackground: getComputedStyle(neighbour).backgroundColor,
    };
  });
}

test.describe('unsaved save button prominence', () => {

  // The fake clock is installed but never advanced, so the pause timer never fires and the
  // file stays in the unsaved state for the whole test.
  async function openDirtyFile(page) {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await page.clock.install();
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      pre.textContent = 'unsaved edits';
      pre.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#modal-content')).not.toHaveClass(/saved/);
  }

  test('shouts with an inverted plate when autosave is off', async ({ page }) => {
    await openDirtyFile(page);
    await page.evaluate(() => { document.getElementById('autosave-enabled').checked = false; });

    const { background, neighbourBackground } = await saveBtnColours(page);
    expect(background).not.toBe(neighbourBackground);
  });

  test('sits with its neighbours when autosave is on', async ({ page }) => {
    await openDirtyFile(page);

    const { background, neighbourBackground } = await saveBtnColours(page);
    expect(background).toBe(neighbourBackground);
  });

  test('the glyph colour flips from inverse to positive with the setting', async ({ page }) => {
    await openDirtyFile(page);
    const on = await saveBtnColours(page);

    await page.evaluate(() => { document.getElementById('autosave-enabled').checked = false; });
    const off = await saveBtnColours(page);

    expect(on.color).not.toBe(off.color);
  });

  test('a failed save still shouts even with autosave on', async ({ page }) => {
    await openDirtyFile(page);
    const positive = await saveBtnColours(page);

    await page.evaluate(() => document.getElementById('save-btn').classList.add('save-error'));
    const errored = await saveBtnColours(page);

    // The plate comes back — a write that is not reaching disk has to be noticed
    expect(errored.background).not.toBe(errored.neighbourBackground);
    // and the glyph takes the warning colour rather than the positive one
    expect(errored.color).not.toBe(positive.color);
  });

});
