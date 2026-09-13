const { test, expect } = require('@playwright/test');
const { loadFolder } = require('./helpers');

/**
 * plans/table-cell-writing.md, end to end: type in a cell, watch the note on disk change, watch
 * the table redraw from the file rather than from memory.
 *
 * What each note is for:
 *   alpha.md — an ordinary block to write into, with a second key after the one being edited so a
 *              splice that took too much is visible.
 *   beta.md  — front matter that does not read cleanly, so its cells are locked (§7).
 *   gamma.md — no front matter at all.
 */
async function setupFiles(page, extra = {}) {
  await page.addInitScript((extra) => {
    window.__files = {
      'alpha.md': '---\nstatus: draft\n  # a comment the parser skips\nnote: plain\ncount: 3\ndue: 2026-03-01\n---\n# Alpha\n\nBody text.\n',
      'beta.md': '---\nstatus: live\nextra: beta only\nthis line has no colon\n---\n# Beta\n\nBody text.\n',
      'gamma.md': '# Gamma\n\nNo front matter here.\n',
      ...extra,
    };
    window.__saved = {};
    window.__removed = [];

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

    // The real API throws for a file that does not exist unless create is set, which is what makes
    // the verified write's read-back meaningful.
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
      removeEntry: async (name) => { window.__removed.push(name); delete window.__saved[name]; },
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { for (const name of Object.keys(window.__files)) yield mk(name); },
      getDirectoryHandle: async (name) => {
        if (name === '.gypsum') return gypsumDir;
        throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
      },
    });
  }, extra);
}

async function openTable(page, extra) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setupFiles(page, extra);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const rowFor = (page, title) => page.locator('.note-table').filter({ hasText: title }).first();
const cellFor = (page, title, prop) => rowFor(page, title).locator(`.note-table-cell[data-prop="${prop}"]`);

const open = async (cell) => { await cell.click(); await cell.click(); };

/** Sets a column's type through the column picker, the way a user would. */
async function setType(page, property, value) {
  await page.click('[data-action="open-column-picker"]');
  await expect(page.locator('#modal-columns')).toBeVisible();
  await page.locator(`.info-modal-row[data-property="${property}"] .column-picker-type`).click();
  await page.locator(`[data-action="column-type-set"][data-value="${value}"]`).click();
  await page.keyboard.press('Escape');
  await page.click('[data-action="close-column-picker"]');
  await expect(page.locator('#modal-columns')).not.toBeVisible();
}

/** Opens a cell, replaces everything in it, and closes it the way Escape does. */
async function retype(page, cell, text) {
  await open(cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  if (text !== '') await page.keyboard.type(text);
  else await page.keyboard.press('Delete');
  await page.keyboard.press('Escape');
}

const fileText = (page, name) => page.evaluate(name => window.__files[name], name);

// ---------------------------------------------------------------- the round trip

test('typing in a cell writes the value into the note', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: published');

  // the smallest number of bytes that does the job: the comment, the other key and the body are
  // all exactly where they were
  const text = await fileText(page, 'alpha.md');
  expect(text).toBe('---\nstatus: published\n  # a comment the parser skips\nnote: plain\ncount: 3\ndue: 2026-03-01\n---\n# Alpha\n\nBody text.\n');
});

test('the table redraws from the file rather than from memory', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');

  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('published');
  // and the cell closed, because the whole table was redrawn
  await expect(page.locator('.note-table-cell.is-expanded')).toHaveCount(0);
});

test('the copy in .gypsum is verified and then deleted', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');

  await expect.poll(() => page.evaluate(() => window.__removed)).toContain('alpha.md-save.gypsum');
  expect(await page.evaluate(() => Object.keys(window.__saved))).not.toContain('alpha.md-save.gypsum');
});

// ---------------------------------------------------------------- the quoting rule, in place

test('a value that would read back as a number is quoted on the way in', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), '007');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: "007"');
  // and it comes back as the text that was typed, not as seven
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('007');
});

test('clearing a cell writes an empty value and keeps the key', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), '');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: ""');

  // the column is still there, which is what a deleted key would have risked
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('');
  await expect(page.locator('.note-table-cell-header[data-property="status"]')).toHaveCount(1);
});

// ---------------------------------------------------------------- what is not written

test('a cell nobody typed in writes nothing', async ({ page }) => {
  await openTable(page);
  const before = await fileText(page, 'alpha.md');

  const cell = cellFor(page, 'Alpha', 'status');
  await open(cell);
  await page.keyboard.press('Escape');

  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('draft');
  expect(await fileText(page, 'alpha.md')).toBe(before);
  expect(await page.evaluate(() => Object.keys(window.__saved).length)).toBe(0);
});

test('typing the same text back again writes nothing', async ({ page }) => {
  await openTable(page);
  const before = await fileText(page, 'alpha.md');

  await retype(page, cellFor(page, 'Alpha', 'status'), 'draft');

  expect(await fileText(page, 'alpha.md')).toBe(before);
  expect(await page.evaluate(() => Object.keys(window.__saved).length)).toBe(0);
});

test('a note whose front matter did not read cleanly has those cells locked', async ({ page }) => {
  await openTable(page);

  const cell = cellFor(page, 'Beta', 'status');
  await expect(cell).toHaveAttribute('data-yaml-error', '');

  await open(cell);
  await expect(cell).toHaveClass(/is-expanded/);                    // it still opens to be read
  await expect(cell).not.toHaveAttribute('contenteditable', /.*/);  // and takes no caret
  await expect(cell.locator('.cell-mismatch-note')).toHaveText(/fix it in the note/);

  await page.keyboard.press('Escape');
  expect(await fileText(page, 'beta.md')).toContain('status: live');

  // the note that read cleanly is untouched by its neighbour's trouble
  await expect(cellFor(page, 'Alpha', 'status')).not.toHaveAttribute('data-yaml-error', /.*/);
});

// ---------------------------------------------------------------- finishing with a cell

test('Enter finishes with a cell and writes it', async ({ page }) => {
  await openTable(page);

  const cell = cellFor(page, 'Alpha', 'note');
  await open(cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('typed and entered');
  await page.keyboard.press('Enter');

  await expect(page.locator('.note-table-cell.is-expanded')).toHaveCount(0);
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('note: typed and entered');
});

test('clicking another cell writes the one being left', async ({ page }) => {
  await openTable(page);

  const cell = cellFor(page, 'Alpha', 'status');
  await open(cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('moved on');
  await cellFor(page, 'Alpha', 'note').click();

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: moved on');
});

// ---------------------------------------------------------------- the row stays put

test('the edited row does not leap away when its column is the sorted one', async ({ page }) => {
  await openTable(page);

  // sorted by status ascending — a header opens its menu on the second click
  const header = page.locator('.note-table-cell-header[data-property="status"]');
  await header.click();
  await header.click();
  await page.locator('[data-action="column-sort-asc"]').click();

  const titles = () => page.evaluate(() => [...document.querySelectorAll('.note-table[data-vt-id]')]
    .map(row => row.querySelector('[data-prop="title"]').textContent));
  await expect.poll(titles).toEqual(['Alpha', 'Beta', 'Gamma']);

  // 'zzz' sorts after 'live', so a re-sort would put Alpha second
  await retype(page, cellFor(page, 'Alpha', 'status'), 'zzz');
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('zzz');

  expect(await titles()).toEqual(['Alpha', 'Beta', 'Gamma']);
});

// ---------------------------------------------------------------- number and date

test('a number is written plainly, so it comes back a number', async ({ page }) => {
  await openTable(page);
  await setType(page, 'count', 'number');
  await retype(page, cellFor(page, 'Alpha', 'count'), '42');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('count: 42');

  // the round trip is closed: quoted, it would read back as text and then show as not matching
  await expect(cellFor(page, 'Alpha', 'count')).toHaveText('42');
  await expect(cellFor(page, 'Alpha', 'count')).not.toHaveAttribute('data-mismatch', /.*/);
});

test('text in a number column is written as text, and says so afterwards', async ({ page }) => {
  await openTable(page);
  await setType(page, 'count', 'number');
  await retype(page, cellFor(page, 'Alpha', 'count'), 'about five');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('count: about five');
  await expect(cellFor(page, 'Alpha', 'count')).toHaveAttribute('data-mismatch', 'unreadable');
  await expect(cellFor(page, 'Alpha', 'count')).toHaveText('about five');
});

test('a date is written exactly as it was typed', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'date');

  const cell = cellFor(page, 'Alpha', 'due');
  await open(cell);
  const text = cell.locator('.cell-date-text');
  await text.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.type('1 March 2026');
  await page.keyboard.press('Escape');

  // nothing reinterprets it: no ISO of ours, and no locale rendering either
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('due: 1 March 2026');
  await expect(cellFor(page, 'Alpha', 'due')).toHaveText('1 March 2026');
});

test('a picked date is written as the ISO the picker produced', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'date');

  const cell = cellFor(page, 'Alpha', 'due');
  await open(cell);
  await cell.locator('.cell-date-input').evaluate(el => {
    el.value = '2026-12-25';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.keyboard.press('Escape');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('due: 2026-12-25');
});

// ---------------------------------------------------------------- a key, or a block, that is new

test('a key the note does not have is appended to its block', async ({ page }) => {
  await openTable(page);
  // Beta carries status and Alpha carries note, so Beta's note cell is empty for want of the key.
  // Gamma is the one to write into: it has no block at all, so Alpha's keys are the empty ones.
  await retype(page, cellFor(page, 'Alpha', 'extra'), 'filled in');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('extra: filled in');

  // at the end of the block, with everything else where it was
  const text = await fileText(page, 'alpha.md');
  expect(text).toContain('due: 2026-03-01\nextra: filled in\n---\n# Alpha');
  await expect(cellFor(page, 'Alpha', 'extra')).toHaveText('filled in');
});

test('a note with no front matter at all is given a block at byte 0', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Gamma', 'status'), 'new here');

  await expect.poll(() => fileText(page, 'gamma.md'))
    .toBe('---\nstatus: new here\n---\n# Gamma\n\nNo front matter here.\n');

  // the heading is still the title, because a title is matched anywhere in the file
  await expect(cellFor(page, 'Gamma', 'title')).toHaveText('Gamma');
  await expect(cellFor(page, 'Gamma', 'status')).toHaveText('new here');
});

// Byte 0 is the one placement that cannot be re-read as something else. A separator lower down has
// to be told apart from a setext underline above it, so a note written with underlined headings is
// exactly the note a cleverer placement would break.
test('a block written above a setext heading is still read as front matter', async ({ page }) => {
  await openTable(page, { 'delta.md': 'Underlined Title\n----------------\n\nBody text.\n' });

  await retype(page, cellFor(page, 'Underlined Title', 'status'), 'new here');

  await expect.poll(() => fileText(page, 'delta.md'))
    .toBe('---\nstatus: new here\n---\nUnderlined Title\n----------------\n\nBody text.\n');

  const cell = cellFor(page, 'Underlined Title', 'status');
  await expect(cell).toHaveText('new here');
  await expect(cell).not.toHaveAttribute('data-yaml-error', /.*/);   // it read back cleanly
});
