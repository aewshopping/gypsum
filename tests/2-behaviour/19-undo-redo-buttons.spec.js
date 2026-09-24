const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithHistory, loadFolder } = require('../helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

test('the undo and redo buttons drive the editor history', async ({ page }) => {
  await setupMockDirectoryWithHistory(page);
  await page.goto('/');
  await loadFolder(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 1);
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();

  const text = () => page.locator('#modal-content-text pre').textContent();

  await page.locator('#modal-content-text pre').click();
  await page.keyboard.press('End');
  await page.keyboard.type('XYZTEST');
  expect(await text()).toContain('XYZTEST');

  await page.locator('[data-action="editor-undo"]').click();
  expect(await text()).not.toContain('XYZTEST');

  await page.locator('[data-action="editor-redo"]').click();
  expect(await text()).toContain('XYZTEST');
});

// ---------------------------------------------------------------- the table's undo list
// plans/table-delete-column.md §10.3, §10.4 and §17.6: what the list does on screen.

async function openTable(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => {
    window.__files = {
      'alpha.md': '---\nstatus: draft\nnote: one\n---\n# Alpha\n',
      'beta.md': '---\nstatus: live\nnote: two\n---\n# Beta\n',
    };
    const mk = (name) => ({
      kind: 'file', name,
      getFile: async () => ({ name, size: window.__files[name].length, lastModified: Date.now(),
        text: async () => window.__files[name] }),
      createWritable: async () => ({
        write: async (content) => { window.__files[name] = content; }, close: async () => {},
      }),
    });
    const saved = {};
    const gypsumDir = {
      getFileHandle: async (name, options) => {
        if (!(name in saved) && !options?.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
        saved[name] ??= '';
        return {
          getFile: async () => ({ text: async () => saved[name] }),
          createWritable: async () => ({ write: async (c) => { saved[name] = c; }, close: async () => {} }),
        };
      },
      removeEntry: async (name) => { delete saved[name]; },
    };
    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { for (const name of Object.keys(window.__files)) yield mk(name); },
      getDirectoryHandle: async (name) => {
        if (name === '.gypsum') return gypsumDir;
        throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
      },
    });
  });
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

/** Writes a cell through the same path a cell commit takes, and waits for the buttons to follow. */
async function edit(page, internalId, property, text) {
  await page.evaluate(async ([internalId, property, text]) => {
    const { applyCellEdits } = await import('/public/js/editing/save-cell-edit.js');
    const { markUndoState } = await import('/public/js/ui/ui-functions-table/render-table-controls.js');
    await applyCellEdits([{ internalId, property, text }]);
    markUndoState();
  }, [internalId, property, text]);
}

const undoBtn = page => page.locator('#table-undo-btn');
const listBtn = page => page.locator('#table-undo-list-btn');
const list = page => page.locator('#undo-list');

test('undo goes dark after a view change, and the history button stays lit', async ({ page }) => {
  await openTable(page);
  await expect(listBtn(page)).toBeDisabled();

  await edit(page, 'alpha.md', 'status', 'done');
  await expect(undoBtn(page)).toBeEnabled();
  await expect(listBtn(page)).toBeEnabled();

  await page.selectOption('#view-select', 'cards');
  await page.selectOption('#view-select', 'table');
  await expect(undoBtn(page)).toBeDisabled();
  await expect(listBtn(page)).toBeEnabled();

  // Ctrl+Z does nothing either: the key and the button are one action.
  await page.locator('#output-report').click();
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.__files['alpha.md'])).toContain('status: done');

  // The first edit of the new visit lights it again.
  await edit(page, 'beta.md', 'note', 'three');
  await expect(undoBtn(page)).toBeEnabled();
});

test('the list shows newest first, divides this visit from earlier, and a row press closes it', async ({ page }) => {
  await openTable(page);
  await edit(page, 'alpha.md', 'status', 'done');
  await page.selectOption('#view-select', 'cards');
  await page.selectOption('#view-select', 'table');
  await edit(page, 'beta.md', 'note', 'three');

  await listBtn(page).click();
  await expect(list(page)).toBeVisible();
  const rows = list(page).locator('.undo-list-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('.undo-list-name')).toHaveText('note edit in 1 file');
  await expect(rows.nth(0).locator('.undo-list-time')).toHaveText('just now');
  await expect(rows.nth(1).locator('.undo-list-name')).toHaveText('status edit in 1 file');
  await expect(list(page).locator('.undo-list-divider')).toHaveText('earlier');

  // Focus starts on the first row, Tab moves along, Escape closes and hands focus back.
  await expect(rows.nth(0)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(list(page)).toBeHidden();
  await expect(listBtn(page)).toBeFocused();

  // The older entry, undone on its own: the newer edit on another property is left alone.
  await listBtn(page).click();
  await rows.nth(1).click();
  await expect(list(page)).toBeHidden();
  await expect(page.locator('#output-report')).toContainText('undo: status edit in 1 file — 1 values');
  expect(await page.evaluate(() => window.__files['alpha.md'])).toContain('status: draft');
  expect(await page.evaluate(() => window.__files['beta.md'])).toContain('note: three');

  // And redo, straight after, redoes exactly that.
  await page.locator('#table-redo-btn').click();
  await expect(page.locator('#output-report')).toContainText('redo: status edit in 1 file');
});

// ---------------------------------------------------------------- a refusal marks the note, §10.5

const issuesOf = (page, name) => page.evaluate(name =>
  window.appState.myFiles.find(file => file.filename === name).fileIssues, name);

test('a refused undo marks the note at once, the fail count filters to it, and a clean undo clears it', async ({ page }) => {
  await openTable(page);
  await edit(page, 'alpha.md', 'status', 'done');
  await edit(page, 'beta.md', 'status', 'done');
  // alpha moves on behind the app's back, so undoing its edit will be refused
  await page.evaluate(() => {
    window.__files['alpha.md'] = window.__files['alpha.md'].replace('status: done', 'status: elsewhere');
  });

  await undoBtn(page).click();   // beta's edit: applied
  await undoBtn(page).click();   // alpha's: refused
  await expect(page.locator('#output-report')).toContainText('undo: status edit in 1 file — 0 values, 1 fail');
  expect(await issuesOf(page, 'alpha.md')).toBe('undo: 1 refused (status edit)');
  expect(await issuesOf(page, 'beta.md')).toBe(null);

  // The count is a nudge to exactly the refused notes.
  await page.locator('#output-report .load-error-nudge').click();
  await expect(page.locator('.note-table')).toHaveCount(1);
  await expect(page.locator('.note-table')).toContainText('Alpha');
  await page.evaluate(async () => {
    const { handleClearFilters } = await import('/public/js/ui/ui-functions-click/clear-filters.js');
    handleClearFilters();
  });
  await expect(page.locator('.note-table')).toHaveCount(2);

  // The mark survives an edit to another cell of that note, which re-reads it.
  await edit(page, 'alpha.md', 'note', 'again');
  expect(await issuesOf(page, 'alpha.md')).toBe('undo: 1 refused (status edit)');

  // A later undo that refuses nothing clears the mark straight away.
  await undoBtn(page).click();   // the note edit, applied cleanly
  await expect.poll(() => issuesOf(page, 'alpha.md')).toBe(null);
});

test('a refusal mark follows the note through a rename', async ({ page }) => {
  await openTable(page);
  await edit(page, 'alpha.md', 'status', 'done');
  await page.evaluate(() => {
    window.__files['alpha.md'] = window.__files['alpha.md'].replace('status: done', 'status: elsewhere');
  });
  await undoBtn(page).click();
  expect(await issuesOf(page, 'alpha.md')).toBe('undo: 1 refused (status edit)');

  const marks = await page.evaluate(async () => {
    const { renameInUndoStacks } = await import('/public/js/table-undo/undo-rename.js');
    renameInUndoStacks('alpha.md', 'renamed.md');
    return [...window.appState.undoRefusals.keys()];
  });
  expect(marks).toEqual(['renamed.md']);
});
