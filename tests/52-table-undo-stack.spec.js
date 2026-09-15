const { test, expect } = require('@playwright/test');
const { loadFolder } = require('./helpers');

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

    const mk = (name) => ({
      kind: 'file', name,
      getFile: async () => ({
        name, size: window.__files[name].length, lastModified: Date.now(),
        text: async () => window.__files[name],
      }),
      createWritable: async () => ({
        write: async (content) => { window.__files[name] = content; },
        close: async () => {},
      }),
    });

    const gypsumDir = {
      getFileHandle: async (name, options) => {
        if (!(name in window.__saved)) {
          if (!options?.create) throw new Error(`NotFoundError: ${name}`);
          window.__saved[name] = '';
        }
        return {
          getFile: async () => ({ text: async () => window.__saved[name] }),
          createWritable: async () => ({
            write: async (content) => { window.__saved[name] = content; },
            close: async () => {},
          }),
        };
      },
      removeEntry: async (name) => { delete window.__saved[name]; },
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
}

async function openTable(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setupFiles(page);
  await page.goto('/');
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

const undoBtn = (page) => page.locator('#table-undo-btn');
const redoBtn = (page) => page.locator('#table-redo-btn');
const report = (page) => page.locator('#table-undo-report');

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
});

test('redo puts it back again, and the pair can be cycled', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');

  await undoBtn(page).click();
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('draft');

  await redoBtn(page).click();
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('published');
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: published');

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

test('the key is not ours in another view, with a dialog open, or in a cell editor', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');

  // another view
  await page.selectOption('#view-select', 'cards');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  expect(await fileText(page, 'alpha.md')).toContain('status: published');

  await page.selectOption('#view-select', 'table');

  // a dialog open
  await page.click('[data-action="open-column-picker"]');
  await expect(page.locator('#modal-columns')).toBeVisible();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  expect(await fileText(page, 'alpha.md')).toContain('status: published');
  await page.click('[data-action="close-column-picker"]');

  // a cell editor open — the browser's own undo is the one wanted while typing
  const cell = cellFor(page, 'Alpha', 'note');
  await cell.click();
  await cell.click();
  await expect(cell).toHaveClass(/is-expanded/);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  expect(await fileText(page, 'alpha.md')).toContain('status: published');
});

// ---------------------------------------------------------------- the buttons

test('both buttons start disabled and follow the stacks', async ({ page }) => {
  await openTable(page);
  await expect(undoBtn(page)).toBeDisabled();
  await expect(redoBtn(page)).toBeDisabled();

  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');
  await expect(undoBtn(page)).toBeEnabled();
  await expect(redoBtn(page)).toBeDisabled();

  await undoBtn(page).click();
  await expect(undoBtn(page)).toBeDisabled();
  await expect(redoBtn(page)).toBeEnabled();

  // a fresh edit empties the redo stack
  await retype(page, cellFor(page, 'Alpha', 'note'), 'changed');
  await expect(undoBtn(page)).toBeEnabled();
  await expect(redoBtn(page)).toBeDisabled();
});

test('a cell opened and closed without typing pushes nothing', async ({ page }) => {
  await openTable(page);

  const cell = cellFor(page, 'Alpha', 'status');
  await cell.click();
  await cell.click();
  await page.keyboard.press('Enter');

  await expect(undoBtn(page)).toBeDisabled();
});

// ---------------------------------------------------------------- the report and the mark

test('the report line counts what was undone', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');

  await undoBtn(page).click();
  await expect(report(page)).toHaveText('undo (1 cells)');
  await expect(report(page)).not.toHaveClass(/has-failures/);

  await redoBtn(page).click();
  await expect(report(page)).toHaveText('redo (1 cells)');
});

test('the undone cell is marked', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');

  await undoBtn(page).click();
  await expect(cellFor(page, 'Alpha', 'status')).toHaveClass(/undo-flash/);
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
  await expect(report(page)).toHaveText('undo (0 cells | 1 fail)');
  await expect(report(page)).toHaveClass(/has-failures/);
  expect(await fileText(page, 'alpha.md')).toContain('status: archived');

  // the entry is gone rather than waiting to be tried again
  await expect(undoBtn(page)).toBeDisabled();
});

test('a refused cell is marked differently from an undone one', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: published');

  await page.evaluate(() => {
    window.__files['alpha.md'] = window.__files['alpha.md'].replace('status: published', 'status: archived');
  });
  await undoBtn(page).click();

  await expect(cellFor(page, 'Alpha', 'status')).toHaveClass(/undo-flash-refused/);
});

// ---------------------------------------------------------------- a key the edit created

test('undoing a created key empties it rather than removing it', async ({ page }) => {
  await openTable(page);

  // the column exists because alpha.md carries the key; beta.md does not, so typing in its cell
  // is the case where the write appends a key the note has never had
  await retype(page, cellFor(page, 'Beta', 'extra'), 'made up');
  await expect.poll(() => fileText(page, 'beta.md')).toContain('extra: made up');

  await undoBtn(page).click();

  // the key stays, emptied — v1 removes no keys, so the column does not vanish under the user
  await expect.poll(() => fileText(page, 'beta.md')).toContain('extra:');
  expect(await fileText(page, 'beta.md')).not.toContain('made up');
});
