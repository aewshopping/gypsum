const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithHistory, setupMockDirectoryWithSaveSupport, loadFolder } = require('../helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

async function switchToTxt(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
}

// The unsaved-changes indicator is driven by the 'saved' class on #modal-content:
//   no 'saved' class → indicator visible (unsaved changes)
//   has 'saved' class → no indicator (content is saved / clean)

test.describe('unsaved changes indicator in history select button', () => {

  test('a file with Windows \\r\\n line endings opens clean, and stays clean through an undo', async ({ page }) => {
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
    await loadFolder(page);
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForHistoryOptions(page, 1);

    // \r\n must be normalised on open, or the file looks dirty before a key is pressed
    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);

    await switchToTxt(page);
    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);

    await page.keyboard.press('Control+z');
    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);
  });

  test('the indicator reappears when returning to current after viewing history', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await loadFolder(page);
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForHistoryOptions(page, 1);
    await switchToTxt(page);
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      pre.textContent = 'edited content';
      pre.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await waitForHistoryOptions(page, 3);
    // A historical version is read-only, so it never shows the indicator
    await page.selectOption('#file-content-history-select', { index: 2 });
    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);

    // Return to current version — edits are still unsaved
    await page.selectOption('#file-content-history-select', { value: 'current' });
    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);
  });

  // The two tests below are one bug from both ends. The dirty check trims the note's end
  // before comparing, because innerText's trailing newline is a DOM artefact rather than an
  // edit — so every measurement either side of that comparison has to be trimmed too. Two were
  // not, and on a note left ending in a space the save indicator stuck lit for ever: the file
  // was written correctly on every autosave and every Ctrl+S, while the app went on insisting
  // it was unsaved, warned on close, and offered to discard changes that were already on disk.
  // Anyone taking that offer would think they had lost the lot.

  test('a note left ending in a space is saved, and stops saying otherwise', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await loadFolder(page);
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForHistoryOptions(page, 1);
    await switchToTxt(page);

    // Typed at the end and stopped mid-sentence, on the space. The file now ends in one.
    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' and a bit more ');
    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);

    await page.evaluate(() => document.getElementById('save-btn').click());

    // The write reaches disk with the trailing space intact...
    await expect.poll(() => page.evaluate(() => window.__originalFiles['notes.md']))
      .toBe('# My Notes\nSome content here and a bit more ');
    // ...and the indicator says so.
    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);
  });

  test('undoing back to the saved text clears the indicator, on a note ending in a space', async ({ page }) => {
    // No save support, so nothing can rescue a wrong answer here by writing the file: the
    // indicator has to be right on the strength of the dirty check alone.
    await page.addInitScript(() => {
      const content = '# My Notes\nSome content here ';
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () {
          yield {
            kind: 'file', name: 'notes.md',
            getFile: async () => ({
              name: 'notes.md', size: content.length, lastModified: Date.now(),
              text: async () => content,
            }),
          };
        },
        getFileHandle: async () => { throw new Error('no backup'); },
      });
    });
    await page.goto('/');
    await loadFolder(page);
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForHistoryOptions(page, 1);
    await switchToTxt(page);
    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);

    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('Z');
    await expect(page.locator('#modal-content')).not.toHaveClass(/\bsaved\b/);

    await page.keyboard.press('Backspace');
    await expect(page.locator('#modal-content')).toHaveClass(/\bsaved\b/);
  });

});
