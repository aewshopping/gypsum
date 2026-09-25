const { test, expect } = require('@playwright/test');
const { loadFolder, appModule } = require('../helpers');

/**
 * plans/table-undo-stack.md, end to end: edit a cell, put it back, watch the note on disk go with it.
 *
 * What each note is for:
 *   alpha.md — an ordinary block to edit and undo, with keys either side of the one being written
 *              so a splice that took too much is visible. It carries `extra`, which registers that
 *              column for the whole table.
 *   beta.md  — the note that does *not* carry `extra`, so typing in its cell is the case where the
 *              write appends a key the note has never had, and the undo has one to put back.
 */
async function setupFiles(page) {
  await page.addInitScript(() => {
    window.__files = {
      'alpha.md': [
        '---',
        'status: draft',
        'note: plain',
        'extra: alpha only',
        '---',
        '# Alpha',
        '',
        'Body text.',
        '',
      ].join('\n'),
      'beta.md': '---\nstatus: live\nnote: second\n---\n# Beta\n\nBody text.\n',
    };
    window.__saved = {};

    // The folder outlives a page reload, as a real one does: the saved undo history is read back
    // from it on the next load.
    const stored = sessionStorage.getItem('mock-folder');
    if (stored) ({ files: window.__files, saved: window.__saved } = JSON.parse(stored));
    const persist = () => sessionStorage.setItem('mock-folder',
      JSON.stringify({ files: window.__files, saved: window.__saved }));

    const notFound = (name) => Object.assign(new Error(`NotFoundError: ${name}`), { name: 'NotFoundError' });

    const mk = (name) => ({
      kind: 'file', name,
      getFile: async () => {
        if (!(name in window.__files)) throw notFound(name);
        return {
          name, size: window.__files[name].length, lastModified: Date.now(),
          text: async () => window.__files[name],
        };
      },
      createWritable: async () => ({
        write: async (content) => { window.__files[name] = content; persist(); },
        close: async () => {},
      }),
      isSameEntry: async (other) => other.name === name,
    });

    const gypsumDir = {
      getFileHandle: async (name, options) => {
        if (!(name in window.__saved)) {
          if (!options?.create) throw notFound(name);
          window.__saved[name] = '';
        }
        return {
          getFile: async () => ({ text: async () => window.__saved[name] }),
          createWritable: async () => ({
            write: async (content) => { window.__saved[name] = content; persist(); },
            close: async () => {},
          }),
        };
      },
      removeEntry: async (name) => { delete window.__saved[name]; persist(); },
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { for (const name of Object.keys(window.__files)) yield mk(name); },
      getDirectoryHandle: async (name) => {
        if (name === '.gypsum') return gypsumDir;
        throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
      },
      getFileHandle: async (name, options) => {
        if (!(name in window.__files)) {
          if (!options?.create) throw notFound(name);
          window.__files[name] = '';
        }
        return mk(name);
      },
      removeEntry: async (name) => { delete window.__files[name]; persist(); },
    });
  });
}

async function openTable(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setupFiles(page);
  await page.goto('/');
  await showTable(page);
}

/** Loads the mock folder and shows the table — again after a reload, which keeps the folder. */
async function showTable(page) {
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const rowFor = (page, title) => page.locator('.note-table').filter({ hasText: title }).first();
const cellFor = (page, title, prop) => rowFor(page, title).locator(`.note-table-cell[data-prop="${prop}"]`);
const fileText = (page, name) => page.evaluate(name => window.__files[name], name);

/**
 * Opens a cell, replaces everything in it, and leaves in a way that writes.
 *
 * Enter rather than clicking away, because that is what leaves focus on the cell — and the cell is
 * not an editor once it has closed, so Ctrl+Z is the app's again. Committing into the searchbox
 * would leave focus somewhere with its own undo, which the key deliberately does not take.
 */
async function retype(page, cell, text) {
  await cell.click();
  await cell.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** The same, for emptying a cell — typing '' types nothing, so the selection has to be deleted. */
async function clearCell(page, cell) {
  await cell.click();
  await cell.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
}

const undoBtn = (page) => page.locator('#table-undo-btn');
const redoBtn = (page) => page.locator('#table-redo-btn');
const report = (page) => page.locator('#output-report .output-report-undo');
const reportLine = (page) => page.locator('#output-report');

// ---------------------------------------------------------------- the round trip

test('undo puts the value back in the note on disk', async ({ page }) => {
  await openTable(page);
  const original = await fileText(page, 'alpha.md');

  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: published');

  await undoBtn(page).click();

  // byte for byte what it was — the undo splices the same span back, so the keys either side, the
  // body and the trailing newline are all untouched
  await expect.poll(() => fileText(page, 'alpha.md')).toBe(original);
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('draft');
  await expect(cellFor(page, 'Alpha', 'status')).toHaveClass(/undo-flash/);
});

test('redo puts it back again, and the pair can be cycled', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');

  await undoBtn(page).click();
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('draft');
  // the count the line opens with is the render's, not the undo's, and is there either way
  await expect(reportLine(page)).toHaveText('count: 2 | undo: status edit in 1 file — 1 values');
  await expect(report(page)).not.toHaveClass(/has-failures/);

  await redoBtn(page).click();
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('published');
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: published');
  await expect(report(page)).toHaveText('redo: status edit in 1 file — 1 values');

  // and round again, because the record the write hands back is oriented for the next reversal
  await undoBtn(page).click();
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('draft');
});

// ---------------------------------------------------------------- the keys

test('Ctrl+Z undoes and both redo bindings reach the same handler', async ({ page }) => {
  await openTable(page);

  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');
  await page.keyboard.press('Control+z');
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('draft');

  await page.keyboard.press('Control+Shift+z');
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('published');

  await page.keyboard.press('Control+z');
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('draft');

  await page.keyboard.press('Control+y');
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('published');
});

// ---------------------------------------------------------------- the check

test('an entry the file has moved past is refused, and says so', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: published');

  // the note changes under the app, as it would if it were edited in another editor
  await page.evaluate(() => {
    window.__files['alpha.md'] = window.__files['alpha.md'].replace('status: published', 'status: archived');
  });

  await undoBtn(page).click();

  // nothing written, and the hand-typed value still there
  await expect(report(page)).toHaveText('undo: status edit in 1 file — 0 values, 1 fail');
  await expect(report(page)).toHaveClass(/has-failures/);

  // the warning colour is the undo half's alone — the count beside it did not fail
  await expect(reportLine(page)).not.toHaveClass(/has-failures/);
  expect(await fileText(page, 'alpha.md')).toContain('status: archived');

  // marked differently from an undone cell
  await expect(cellFor(page, 'Alpha', 'status')).toHaveClass(/undo-flash-refused/);

  // the entry is gone rather than waiting to be tried again
  await expect(undoBtn(page)).toBeDisabled();
});

// ---------------------------------------------------------------- a key the edit created

test('undoing a created key removes it, and redoing puts it back', async ({ page }) => {
  await openTable(page);
  const original = await fileText(page, 'beta.md');

  // the column exists because alpha.md carries the key; beta.md does not, so typing in its cell
  // is the case where the write appends a key the note has never had
  await retype(page, cellFor(page, 'Beta', 'extra'), 'made up');
  await expect.poll(() => fileText(page, 'beta.md')).toContain('extra: made up');

  await undoBtn(page).click();

  // The record's `before` is '', which is what the writer reads as "take the key out" — so undo
  // leaves the note exactly as it found it rather than with a key holding nothing. The column does
  // not vanish with it: it belongs to the table, not to this note.
  await expect.poll(() => fileText(page, 'beta.md')).toBe(original);
  await expect(page.locator('.note-table-cell-header[data-property="extra"]')).toHaveCount(1);

  await redoBtn(page).click();
  await expect.poll(() => fileText(page, 'beta.md')).toContain('extra: made up');
});

test('undoing a cleared cell puts the key back, and redoing takes it away again', async ({ page }) => {
  await openTable(page);

  await clearCell(page, cellFor(page, 'Alpha', 'status'));
  await expect.poll(() => fileText(page, 'alpha.md')).not.toContain('status:');

  // Re-appended rather than put back on its old line — an undo restores the value, not the layout
  // of the block.
  await undoBtn(page).click();
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: draft');
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('draft');

  await redoBtn(page).click();
  await expect.poll(() => fileText(page, 'alpha.md')).not.toContain('status:');
});

// ---------------------------------------------------------------- names, plans/completed/table-delete-column.md §7

test('describeBatch names every kind of batch, and counts only the edits it holds', async () => {
  const { describeBatch } = await appModule('table-undo/describe-batch.js');
  const edit = (internalId, property = 'status') => ({ internalId, property });
  expect(describeBatch({ kind: 'edit', property: 'title', edits: [edit('a.md', 'title')] }))
    .toBe('title edit in 1 file');
  expect(describeBatch({ kind: 'edit', property: 'status', edits: ['a', 'b', 'c', 'd'].map(n => edit(n)) }))
    .toBe('status edit in 4 files');
  expect(describeBatch({ kind: 'edit', property: null,
    edits: [edit('a', 'x'), edit('a', 'y'), edit('b', 'x'), edit('b', 'y'), edit('c', 'x'), edit('c', 'y')] }))
    .toBe('edit of 6 values in 3 files');
  const people = Array.from({ length: 35 }, (_, i) => edit(`${i}.md`, 'people'));
  expect(describeBatch({ kind: 'delete-property', property: 'people', edits: people }))
    .toBe('people column delete in 35 files');
  // a redo holding only the half of an undo that was applied
  expect(describeBatch({ kind: 'delete-property', property: 'people', edits: people.slice(0, 33) }))
    .toBe('people column delete in 33 files');
});

// ---------------------------------------------------------------- the saved stack, §8

const undoFile = (page) => page.evaluate(() => window.__saved['undo.gypsum']);

test('an unreadable undo.gypsum loads empty, the next edit writes a good one, and it is undone after a reload', async ({ page }) => {
  await setupFiles(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('mock-folder')) window.__saved['undo.gypsum'] = '{ not json';
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await showTable(page);
  expect(await page.evaluate(() => window.appState.undoStack.length)).toBe(0);

  const original = await fileText(page, 'alpha.md');
  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');
  await expect.poll(async () => JSON.parse(await undoFile(page)).undo.length).toBe(1);
  expect(JSON.parse(await undoFile(page)).undoVersion).toBe(1);

  await page.reload();
  await showTable(page);
  // Ctrl+Z reaches only this visit, so the saved entry is reached through the stack itself.
  await page.evaluate(async () => {
    const { reverseBatch } = await import('/public/js/table-undo/undo-stacks.js');
    await reverseBatch('undo');
  });
  expect(await fileText(page, 'alpha.md')).toBe(original);
});

test('quick edits leave the newest stack on disk, a rename keeps its undo, and the 101st batch drops the oldest', async ({ page }) => {
  await openTable(page);
  await page.evaluate(async () => {
    const { applyCellEdits } = await import('/public/js/editing/save-cell-edit.js');
    // Not awaited one by one: ten saves asked for while earlier ones are still writing.
    await Promise.all(Array.from({ length: 10 }, (_, i) =>
      applyCellEdits([{ internalId: 'beta.md', property: 'note', text: `n${i}` }])));
  });
  await expect.poll(async () => JSON.parse(await undoFile(page)).undo.length)
    .toBe(await page.evaluate(() => window.appState.undoStack.length));
  const onDisk = JSON.parse(await undoFile(page));
  const inMemory = await page.evaluate(() => JSON.parse(JSON.stringify(window.appState.undoStack)));
  expect(onDisk.undo).toEqual(inMemory);

  // A renamed note is still found by its undo, and one deleted from disk is refused without throwing.
  const result = await page.evaluate(async () => {
    const { applyCellEdits } = await import('/public/js/editing/save-cell-edit.js');
    const { renameFile } = await import('/public/js/editing/rename-file.js');
    const { reverseBatch } = await import('/public/js/table-undo/undo-stacks.js');
    await applyCellEdits([{ internalId: 'alpha.md', property: 'status', text: 'published' }]);
    await applyCellEdits([{ internalId: 'beta.md', property: 'status', text: 'gone' }]);

    const alpha = window.appState.myFiles.find(file => file.filename === 'alpha.md');
    await renameFile({ file: alpha, newFolder: '', newName: 'renamed.md' });

    // beta.md goes from disk behind the app's back
    delete window.__files['beta.md'];
    const beta = await reverseBatch('undo');
    const renamed = await reverseBatch('undo');
    return { beta: beta.refused.length, renamed: renamed.applied.length };
  });
  expect(result).toEqual({ beta: 1, renamed: 1 });
  expect(await fileText(page, 'renamed.md')).toContain('status: draft');
  await expect.poll(() => undoFile(page)).not.toContain('"alpha.md"');

  const kept = await page.evaluate(async () => {
    const { pushUndoBatch } = await import('/public/js/table-undo/undo-stacks.js');
    for (let i = 0; i < 101; i++) {
      pushUndoBatch([{ internalId: 'alpha.md', property: `p${i}`, before: '', after: ' x', existed: false }],
        { property: `p${i}` });
    }
    const stack = window.appState.undoStack;
    return { length: stack.length, first: stack[0].property, last: stack.at(-1).property };
  });
  expect(kept).toEqual({ length: 100, first: 'p1', last: 'p100' });
});

test('the undo file is validated at the boundary', async () => {
  const { parseUndoFile } = await appModule('table-undo/undo-file.js');
  const batch = { timestamp: 1, kind: 'edit', property: 'a',
    edits: [{ internalId: 'a.md', property: 'a', before: '', after: ' x', existed: false }] };
  const good = JSON.stringify({ undoVersion: 1, undo: [batch], redo: [] });
  expect(parseUndoFile(good)).toEqual({ undo: [batch], redo: [] });
  expect(parseUndoFile(null)).toEqual({ undo: [], redo: [] });
  expect(parseUndoFile('{ nope')).toEqual({ undo: [], redo: [] });
  expect(parseUndoFile(JSON.stringify({ undoVersion: 2, undo: [batch], redo: [] }))).toEqual({ undo: [], redo: [] });
  expect(parseUndoFile(JSON.stringify({ undoVersion: 1, undo: [{ timestamp: 1 }], redo: [] })))
    .toEqual({ undo: [], redo: [] });
});
