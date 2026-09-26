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
// plans/completed/table-delete-column.md §10.3, §10.4 and §17.6: what the list does on screen.

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

test('a refused undo marks the note with the value it would have restored, and the mark stays', async ({ page }) => {
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
  expect(await issuesOf(page, 'alpha.md')).toBe('undo: status was "draft" (status edit)');
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
  expect(await issuesOf(page, 'alpha.md')).toBe('undo: status was "draft" (status edit)');

  // A later undo that refuses nothing leaves it: the value is wanted until someone puts it back.
  await undoBtn(page).click();   // the note edit, applied cleanly
  await expect(page.locator('#output-report')).toContainText('undo: note edit');
  expect(await issuesOf(page, 'alpha.md')).toBe('undo: status was "draft" (status edit)');
});

test('a refusal mark follows the note through a rename', async ({ page }) => {
  await openTable(page);
  await edit(page, 'alpha.md', 'status', 'done');
  await page.evaluate(() => {
    window.__files['alpha.md'] = window.__files['alpha.md'].replace('status: done', 'status: elsewhere');
  });
  await undoBtn(page).click();
  expect(await issuesOf(page, 'alpha.md')).toBe('undo: status was "draft" (status edit)');

  const marks = await page.evaluate(async () => {
    const { renameInUndoStacks } = await import('/public/js/table-undo/undo-rename.js');
    renameInUndoStacks('alpha.md', 'renamed.md');
    return window.appState.undoRefusals.map(refusal => refusal.internalId);
  });
  expect(marks).toEqual(['renamed.md']);
});

test('the buttons name their batch, and a multi-file undo and redo show the bar with the table inert', async ({ page }) => {
  await openTable(page);
  await page.evaluate(async () => {
    const { applyCellEdits } = await import('/public/js/editing/save-cell-edit.js');
    const { markUndoState } = await import('/public/js/ui/ui-functions-table/render-table-controls.js');
    await applyCellEdits(['alpha.md', 'beta.md'].map(internalId => ({ internalId, property: 'status', text: 'done' })));
    markUndoState();
  });
  await expect(undoBtn(page)).toHaveAttribute('data-tip', 'undo status edit in 2 files | Ctrl+Z');

  // Slow the note writes so the running state can be seen.
  await page.evaluate(() => {
    for (const file of window.appState.myFiles) {
      const create = file.handle.createWritable;
      file.handle.createWritable = async () => { await new Promise(r => setTimeout(r, 300)); return create(); };
    }
  });
  const report = page.locator('#output-report');
  await undoBtn(page).click();
  await expect(report).toContainText('undoing status edit in 2 files…');
  await expect(report).toHaveClass(/loading/);
  await expect(page.locator('#output')).toHaveAttribute('inert', '');

  await expect(report).toContainText('undo: status edit in 2 files');
  await expect(report).not.toHaveClass(/loading/);
  await expect(page.locator('#output')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#table-redo-btn')).toHaveAttribute('data-tip', 'redo status edit in 2 files | Ctrl+Y');

  await page.locator('#table-redo-btn').click();
  await expect(report).toContainText('redoing status edit in 2 files…');
  await expect(report).toHaveClass(/loading/);
  await expect(report).toContainText('redo: status edit in 2 files');
});

// ---------------------------------------------------------------- when the key and buttons answer
// From tests/1-data/52-table-undo-stack.spec.js, being about the screen rather than the disk.

const cellFor = (page, title, prop) =>
  page.locator('.note-table').filter({ hasText: title }).first().locator(`.note-table-cell[data-prop="${prop}"]`);

/** Opens a cell, replaces everything in it, and finishes with Enter, which leaves focus on it. */
async function retype(page, cell, text) {
  await cell.click();
  await cell.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('the buttons follow the stacks, and the key is not ours in another view, a dialog or a cell editor', async ({ page }) => {
  await openTable(page);
  const redoBtn = page.locator('#table-redo-btn');
  const fileText = () => page.evaluate(() => window.__files['alpha.md']);
  await expect(undoBtn(page)).toBeDisabled();
  await expect(redoBtn).toBeDisabled();

  // a cell opened and closed without typing pushes nothing
  const status = cellFor(page, 'Alpha', 'status');
  await status.click();
  await status.click();
  await page.keyboard.press('Enter');
  await expect(undoBtn(page)).toBeDisabled();

  await retype(page, status, 'published');
  await expect(undoBtn(page)).toBeEnabled();
  await expect(redoBtn).toBeDisabled();
  await undoBtn(page).click();
  await expect(undoBtn(page)).toBeDisabled();
  await expect(redoBtn).toBeEnabled();

  // a fresh edit empties the redo stack
  await retype(page, status, 'published');
  await expect(undoBtn(page)).toBeEnabled();
  await expect(redoBtn).toBeDisabled();

  // a dialog open
  await page.click('[data-action="open-column-picker"]');
  await expect(page.locator('#modal-columns')).toBeVisible();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  expect(await fileText()).toContain('status: published');
  await page.click('[data-action="close-column-picker"]');

  // a cell editor open — the browser's own undo is the one wanted while typing
  const note = cellFor(page, 'Alpha', 'note');
  await note.click();
  await note.click();
  await expect(note).toHaveClass(/is-expanded/);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  expect(await fileText()).toContain('status: published');
  await page.keyboard.press('Escape');

  // another view
  await page.selectOption('#view-select', 'cards');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  expect(await fileText()).toContain('status: published');
});

