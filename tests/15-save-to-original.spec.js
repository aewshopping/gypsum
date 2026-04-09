const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithSaveSupport } = require('./helpers');

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

async function clickSaveBtn(page) {
  await page.evaluate(() => document.getElementById('save-btn').click());
}

test.describe('save to original file', () => {

  test('original file is overwritten with editor content after successful save', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    const originalContent = await page.evaluate(() => window.__originalFiles['notes.md']);
    expect(originalContent).toBe('# My Notes\nSome content here');
  });

  test('console logs "Original saved: {filename}" on success', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    const successPromise = page.waitForEvent('console',
      msg => msg.text().includes('Original saved')
    );
    await clickSaveBtn(page);
    const msg = await successPromise;
    expect(msg.text()).toContain('notes.md');
  });

  test('gypsum save file is deleted after successful original-file save', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    const savedFiles = await page.evaluate(() => Object.keys(window.__savedFiles));
    expect(savedFiles).not.toContain('notes.md-save.gypsum');

    const deletedFiles = await page.evaluate(() => Object.keys(window.__deletedFiles));
    expect(deletedFiles).toContain('notes.md-save.gypsum');
  });

  test('if gypsum save fails, original file is not written and console.warn is emitted', async ({ page }) => {
    await page.addInitScript(() => {
      window.__originalFiles = {};
      window.__backupFileContent = '';
      const fileContent = '# My Notes\nSome content here';
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }),
        createWritable: async () => ({ write: async (c) => { window.__originalFiles[name] = c; }, close: async () => {} }),
      });
      const backupHandle = {
        getFile: async () => ({ text: async () => window.__backupFileContent }),
        createWritable: async () => ({ write: async (c) => { window.__backupFileContent = c; }, close: async () => {} }),
      };
      // Tampered: gypsum writes are discarded, reads return wrong content → verification fails
      const gypsumDirHandle = {
        getFileHandle: async (_name, _options) => ({
          getFile: async () => ({ text: async () => 'TAMPERED CONTENT' }),
          createWritable: async () => ({ write: async () => {}, close: async () => {} }),
        }),
      };
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () { yield makeFile('notes.md', fileContent); },
        getDirectoryHandle: async (name, _options) => {
          if (name === '.gypsum') return gypsumDirHandle;
          throw new Error(`Unexpected: ${name}`);
        },
      });
    });

    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    const warnMessages = [];
    page.on('console', msg => { if (msg.type() === 'warning') warnMessages.push(msg.text()); });

    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    const originalFiles = await page.evaluate(() => window.__originalFiles);
    expect(Object.keys(originalFiles)).toHaveLength(0);
    expect(warnMessages.some(m => m.includes('Save file verification failed'))).toBe(true);
  });

  test('if gypsum save succeeds but original write fails, console.warn is emitted and gypsum file is not deleted', async ({ page }) => {
    await page.addInitScript(() => {
      window.__savedFiles = {};
      window.__backupFileContent = '';
      const fileContent = '# My Notes\nSome content here';
      // Normal file handle: getFile returns real content but createWritable discards writes.
      // Verification fails when textToSave (edited) differs from the unchanged file content.
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }),
        createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      });
      const backupHandle = {
        getFile: async () => ({ text: async () => window.__backupFileContent }),
        createWritable: async () => ({ write: async (c) => { window.__backupFileContent = c; }, close: async () => {} }),
      };
      const gypsumDirHandle = {
        getFileHandle: async (name, _options) => {
          if (name === 'history.gypsum') return backupHandle;
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
        getDirectoryHandle: async (name, _options) => {
          if (name === '.gypsum') return gypsumDirHandle;
          throw new Error(`Unexpected: ${name}`);
        },
      });
    });

    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // Edit content so textToSave differs from the original file content.
    // The gypsum save will succeed (it stores the edit), but the original write
    // is discarded, so readback returns the original content — verification fails.
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      pre.textContent = 'edited content';
      pre.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const warnMessages = [];
    page.on('console', msg => { if (msg.type() === 'warning') warnMessages.push(msg.text()); });

    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    await expect(page.locator('#save-popover')).toHaveClass(/\berror\b/);
    expect(warnMessages.some(m => m.includes('Original file verification failed'))).toBe(true);

    // Gypsum save file persists because removeEntry was never reached
    const savedFiles = await page.evaluate(() => Object.keys(window.__savedFiles));
    expect(savedFiles).toContain('notes.md-save.gypsum');
  });

  test('subdir file: original is written to the correct handle', async ({ page }) => {
    await page.addInitScript(() => {
      window.__savedFiles = {};
      window.__originalFiles = {};
      window.__backupFileContent = '';
      const fileContent = 'Nested file content';
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => window.__originalFiles[name] ?? content }),
        createWritable: async () => ({ write: async (c) => { window.__originalFiles[name] = c; }, close: async () => {} }),
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
        removeEntry: async (name) => { delete window.__savedFiles[name]; },
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

    const originalContent = await page.evaluate(() => window.__originalFiles['notes.md']);
    expect(originalContent).toBe('Nested file content');
  });

  test('after successful save, unsaved-changes indicator disappears', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // Edit content — indicator should appear (saved class removed)
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      pre.textContent = 'edited content';
      pre.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);

    // Save — both gypsum and original file writes complete, then indicator resets
    await clickSaveBtn(page);
    await page.waitForTimeout(300);

    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);
  });

});
