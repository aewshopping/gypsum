const { test, expect } = require('@playwright/test');
const { loadFolder } = require('./helpers');

/**
 * plans/completed/table-cell-writing.md, end to end: type in a cell, watch the note on disk change, watch
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
      'alpha.md': [
        '---',
        'status: draft',
        '  # a comment the parser skips',
        'note: plain',
        'count: 3',
        'due: 2026-03-01',
        'ref: "0042"',        // quoted in the note, so an edit has a style to keep
        'people:',            // flush with its key, so replacing the value has a style to copy
        '- John Smith',
        '  # the one in the middle',
        '- "Doe, Jane"',
        'langs: [en, fr]',
        'scores:',
        '  - 1',
        '  - 2',
        '  - 10',
        '---',
        '# Alpha',
        '',
        'Body text.',
        '',
      ].join('\n'),
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

/**
 * Finishes with the open cell in a way that writes. Escape no longer is one — it puts the cell back
 * to the text it opened with — so this clicks away from the table, which is what a user leaving a
 * cell alone does.
 */
const commit = (page) => page.locator('#searchbox').click();

/** Opens a cell, replaces everything in it, and leaves in a way that writes. */
async function retype(page, cell, text) {
  await open(cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  if (text !== '') await page.keyboard.type(text);
  else await page.keyboard.press('Delete');
  await commit(page);
}

const fileText = (page, name) => page.evaluate(name => window.__files[name], name);

// ---------------------------------------------------------------- the round trip

test('typing in a cell writes the value into the note', async ({ page }) => {
  await openTable(page);
  const original = await fileText(page, 'alpha.md');

  await retype(page, cellFor(page, 'Alpha', 'status'), 'published');
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: published');

  // the smallest number of bytes that does the job: every other byte of the note, the comments and
  // the body included, is exactly where it was
  expect(await fileText(page, 'alpha.md')).toBe(original.replace('status: draft', 'status: published'));
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

test('a value that prints back as itself is written without quotes', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'note'), '42');

  // the parser reads it as the number forty-two whatever the column says, and prints it back as
  // `42` — so quotes would only put marks in the note that nobody typed
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('note: 42');
  await expect(cellFor(page, 'Alpha', 'note')).toHaveText('42');
});

test('a key that is quoted in the note stays quoted', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'ref'), '0043');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('ref: "0043"');
  await expect(cellFor(page, 'Alpha', 'ref')).toHaveText('0043');
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

  // Sorted by status ascending, through the controls above the table: the column's own header is
  // off to the right of a table this wide, and both controls are styled into labels that a click
  // cannot reach headlessly — so the change event they answer to is dispatched directly.
  await page.evaluate(() => {
    const direction = document.getElementById('sort-direction');
    direction.checked = true;
    direction.dispatchEvent(new Event('change', { bubbles: true }));
    const select = document.getElementById('sort-select');
    select.value = 'status';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });

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
  await commit(page);

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
  await commit(page);

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
  expect(text).toContain('  - 10\nextra: filled in\n---\n# Alpha');
  await expect(cellFor(page, 'Alpha', 'extra')).toHaveText('filled in');
});

test('a note with no front matter at all is given a block at byte 0', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Gamma', 'status'), 'new here');

  // the blank line is what keeps '# Gamma' a heading to a markdown parser
  await expect.poll(() => fileText(page, 'gamma.md'))
    .toBe('---\nstatus: new here\n---\n\n# Gamma\n\nNo front matter here.\n');

  // the heading is still the title, because a title is matched anywhere in the file
  await expect(cellFor(page, 'Gamma', 'title')).toHaveText('Gamma');
  await expect(cellFor(page, 'Gamma', 'status')).toHaveText('new here');
});

// Byte 0 is the one placement that cannot be re-read as something else. A separator lower down has
// to be told apart from a setext underline above it, so a note written with underlined headings is
// exactly the note a cleverer placement would break.
test('a note that already starts with a blank line does not gain a second', async ({ page }) => {
  await openTable(page, { 'delta.md': '\n# Underlined Title\n\nBody text.\n' });

  await retype(page, cellFor(page, 'Underlined Title', 'status'), 'new here');

  await expect.poll(() => fileText(page, 'delta.md'))
    .toBe('---\nstatus: new here\n---\n\n# Underlined Title\n\nBody text.\n');
});

test('a block written above a setext heading is still read as front matter', async ({ page }) => {
  await openTable(page, { 'delta.md': 'Underlined Title\n----------------\n\nBody text.\n' });

  await retype(page, cellFor(page, 'Underlined Title', 'status'), 'new here');

  await expect.poll(() => fileText(page, 'delta.md'))
    .toBe('---\nstatus: new here\n---\n\nUnderlined Title\n----------------\n\nBody text.\n');

  const cell = cellFor(page, 'Underlined Title', 'status');
  await expect(cell).toHaveText('new here');
  await expect(cell).not.toHaveAttribute('data-yaml-error', /.*/);   // it read back cleanly
});

// ---------------------------------------------------------------- lists

test('changing one item of a list leaves every other byte alone', async ({ page }) => {
  await openTable(page);
  const original = await fileText(page, 'alpha.md');

  await retype(page, cellFor(page, 'Alpha', 'people'), 'Jane Smith, "Doe, Jane"');

  await expect.poll(() => fileText(page, 'alpha.md'))
    .toBe(original.replace('- John Smith', '- Jane Smith'));

  // which is what keeps a comment sitting between two items
  expect(await fileText(page, 'alpha.md')).toContain('# the one in the middle');
  await expect(cellFor(page, 'Alpha', 'people')).toHaveText('Jane Smith, "Doe, Jane"');
});

test('a list of numbers is compared by value, so one edit is still one splice', async ({ page }) => {
  await openTable(page);
  await setType(page, 'scores', 'array');
  const original = await fileText(page, 'alpha.md');

  // the cell reads 1, 2, 10 and captures back as strings — compared as raw text every item would
  // look changed, and the whole list would be rewritten
  await retype(page, cellFor(page, 'Alpha', 'scores'), '1, 7, 10');

  await expect.poll(() => fileText(page, 'alpha.md')).toBe(original.replace('- 2', '- 7'));
});

test('adding an item rewrites the list in the style the file already uses', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'people'), 'John Smith, "Doe, Jane", Rae Chen');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('- Rae Chen');

  // flush with the key, because that is how this note writes a list — and the comment between the
  // items is the price of rewriting the whole value, which is the plan's stated cost
  // flush with the key, because that is how this note writes a list. The item holding a comma
  // loses the quotes it had, and rightly: a block item runs to the end of its line, so the quotes
  // were never what held it together.
  const text = await fileText(page, 'alpha.md');
  expect(text).toContain('people:\n- John Smith\n- Doe, Jane\n- Rae Chen\nlangs:');
  await expect(cellFor(page, 'Alpha', 'people')).toHaveText('John Smith, "Doe, Jane", Rae Chen');
});

// The exact boundary of the "comments in a list block" limitation, so it stays true rather than
// being remembered: the span of a key's value ends at its last item's line, and a comment line
// never extends it. So only a comment *between* two items sits inside the bytes a rewrite replaces.
test('a comment survives a rewrite unless it sits between two items', async ({ page }) => {
  await openTable(page, {
    'delta.md': '---\n  # above the key\npeople:\n- a\n- b\n  # after the last item\nstatus: draft\n---\n# Delta\n\nBody.\n',
  });

  await retype(page, cellFor(page, 'Delta', 'people'), 'a, b, c');

  await expect.poll(() => fileText(page, 'delta.md'))
    .toBe('---\n  # above the key\npeople:\n- a\n- b\n- c\n  # after the last item\nstatus: draft\n---\n# Delta\n\nBody.\n');
});

test('a flow list stays a flow list, item or whole', async ({ page }) => {
  await openTable(page);
  await setType(page, 'langs', 'array');

  await retype(page, cellFor(page, 'Alpha', 'langs'), 'en, de');
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('langs: [en, de]');

  await retype(page, cellFor(page, 'Alpha', 'langs'), 'en, de, nl');
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('langs: [en, de, nl]');
});

test('an item holding a comma is quoted inside a flow list', async ({ page }) => {
  await openTable(page);
  await setType(page, 'langs', 'array');

  await retype(page, cellFor(page, 'Alpha', 'langs'), 'en, "Dutch, spoken"');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('langs: [en, "Dutch, spoken"]');
  // and it comes back as one item rather than two
  await expect(cellFor(page, 'Alpha', 'langs')).toHaveText('en, "Dutch, spoken"');
});

test('emptying a list writes an empty list rather than a bare key', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'people'), '');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('people: []');

  // the column survives, which a key holding nothing would have risked
  await expect(cellFor(page, 'Alpha', 'people')).toHaveText('');
  await expect(page.locator('.note-table-cell-header[data-property="people"]')).toHaveCount(1);
});

test('the first item into a note with no such key is written in block form', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Gamma', 'people'), 'Rae Chen, Sam Lee');

  // two spaces: the one place a style is chosen, because there is nothing to copy
  await expect.poll(() => fileText(page, 'gamma.md'))
    .toBe('---\npeople:\n  - Rae Chen\n  - Sam Lee\n---\n\n# Gamma\n\nNo front matter here.\n');
  await expect(cellFor(page, 'Gamma', 'people')).toHaveText('Rae Chen, Sam Lee');
});

// ---------------------------------------------------------------- the way out, and what it leaves

/** The cell a page's focus is in, as "title/property", or what else has focus. */
const focusedCell = (page) => page.evaluate(() => {
  const el = document.activeElement;
  const cell = el?.closest?.('.note-table-cell');
  if (!cell) return el === document.body ? 'body' : (el?.id || el?.tagName);
  const row = cell.closest('.note-table');
  return `${row.querySelector('[data-prop="title"]').textContent}/${cell.dataset.prop}`;
});

test('Escape leaves the cell without writing anything', async ({ page }) => {
  await openTable(page);
  const original = await fileText(page, 'alpha.md');

  const cell = cellFor(page, 'Alpha', 'status');
  await open(cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('never written');
  await expect(cell).toHaveText('never written');   // it was typed

  await page.keyboard.press('Escape');

  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('draft');   // and taken back
  expect(await fileText(page, 'alpha.md')).toBe(original);
  expect(await page.evaluate(() => Object.keys(window.__saved).length)).toBe(0);
});

test('Escape in a date cell puts its text back too', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'date');
  const original = await fileText(page, 'alpha.md');

  const cell = cellFor(page, 'Alpha', 'due');
  await open(cell);
  await cell.locator('.cell-date-input').evaluate(el => {
    el.value = '2026-12-25';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(cell).toHaveText('2026-12-25');

  await page.keyboard.press('Escape');

  await expect(cellFor(page, 'Alpha', 'due')).toHaveText('2026-03-01');
  expect(await fileText(page, 'alpha.md')).toBe(original);
});

test('Escape steps back one level at a time', async ({ page }) => {
  await openTable(page);
  const cell = cellFor(page, 'Alpha', 'status');
  await open(cell);

  await page.keyboard.press('Escape');
  await expect(cell).not.toHaveClass(/is-expanded/);
  await expect(cell).toHaveClass(/is-selected/);   // still the cell you were in

  await page.keyboard.press('Escape');
  await expect(cell).not.toHaveClass(/is-selected/);
});

test('a cell you have finished with is still the cell you are on', async ({ page }) => {
  await openTable(page);

  const cell = cellFor(page, 'Alpha', 'status');
  await open(cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('published');
  await page.keyboard.press('Enter');

  // the write and its re-render land, and the cell is still where the keyboard is
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('published');
  expect(await focusedCell(page)).toBe('Alpha/status');
  await expect(cellFor(page, 'Alpha', 'status')).toHaveClass(/is-selected/);

  // so one Enter opens it again, rather than two
  await page.keyboard.press('Enter');
  await expect(cellFor(page, 'Alpha', 'status')).toHaveAttribute('contenteditable', 'plaintext-only');
});

test('the arrow keys move from the cell that was just edited', async ({ page }) => {
  await openTable(page);

  const cell = cellFor(page, 'Alpha', 'note');
  await open(cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('edited');
  await page.keyboard.press('Enter');
  await expect(cellFor(page, 'Alpha', 'note')).toHaveText('edited');

  const columns = await page.evaluate(() =>
    [...document.querySelectorAll('.note-table-cell-header')].map(h => h.dataset.property));
  const next = columns[columns.indexOf('note') + 1];

  await page.keyboard.press('ArrowRight');
  expect(await focusedCell(page)).toBe(`Alpha/${next}`);
});

test('the selection follows the arrow keys, and Enter opens where you are', async ({ page }) => {
  await openTable(page);

  const start = cellFor(page, 'Alpha', 'note');
  await start.click();                                   // one click selects, as it always did
  await expect(start).toHaveClass(/is-selected/);

  const columns = await page.evaluate(() =>
    [...document.querySelectorAll('.note-table-cell-header')].map(h => h.dataset.property));
  const next = cellFor(page, 'Alpha', columns[columns.indexOf('note') + 1]);

  await page.keyboard.press('ArrowRight');

  // the mark moves with the keyboard rather than being left behind on the cell you came from
  expect(await focusedCell(page)).toBe(`Alpha/${columns[columns.indexOf('note') + 1]}`);
  await expect(next).toHaveClass(/is-selected/);
  await expect(start).not.toHaveClass(/is-selected/);
  expect(await page.locator('.note-table-cell.is-selected').count()).toBe(1);

  // so one Enter opens it, the same as a second click would
  await page.keyboard.press('Enter');
  await expect(next).toHaveClass(/is-expanded/);
});

test('arrowing away from an open cell closes it', async ({ page }) => {
  await openTable(page);

  // a locked cell opens to be read and keeps the arrow keys, having no caret to give them to
  const locked = cellFor(page, 'Alpha', 'title');
  await open(locked);
  await expect(locked).toHaveClass(/is-expanded/);

  await page.keyboard.press('ArrowRight');

  await expect(locked).not.toHaveClass(/is-expanded/);
  await expect(locked).not.toHaveClass(/is-selected/);
});

test('leaving by clicking another cell leaves you on that one', async ({ page }) => {
  await openTable(page);

  const cell = cellFor(page, 'Alpha', 'status');
  await open(cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('clicked away');
  await cellFor(page, 'Alpha', 'note').click();

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('status: clicked away');
  expect(await focusedCell(page)).toBe('Alpha/note');
  await expect(cellFor(page, 'Alpha', 'note')).toHaveClass(/is-selected/);
});

// ---------------------------------------------------------------- Enter in a list cell

test('Enter writes a list cell rather than starting a new item', async ({ page }) => {
  await openTable(page);

  const cell = cellFor(page, 'Alpha', 'people');
  await open(cell);
  await page.keyboard.press('End');
  await page.keyboard.type(', Rae Chen');
  await page.keyboard.press('Enter');

  await expect(page.locator('.note-table-cell.is-expanded')).toHaveCount(0);
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('- Rae Chen');
  await expect(cellFor(page, 'Alpha', 'people')).toHaveText('John Smith, "Doe, Jane", Rae Chen');
});

test('a pasted spreadsheet column still arrives as separate items', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openTable(page);

  // The half of the old Enter that mattered: a paste brings its own newlines whatever that key
  // does, and a newline is still where an item ends.
  const cell = cellFor(page, 'Alpha', 'people');
  await open(cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.evaluate(() => navigator.clipboard.writeText('Ada Lovelace\nAlan Turing\nRae Chen'));
  await page.keyboard.press('ControlOrMeta+V');
  await page.keyboard.press('Enter');

  await expect.poll(() => fileText(page, 'alpha.md'))
    .toContain('- Ada Lovelace\n- Alan Turing\n- Rae Chen');
  await expect(cellFor(page, 'Alpha', 'people')).toHaveText('Ada Lovelace, Alan Turing, Rae Chen');
});

// ---------------------------------------------------------------- opening a cell from the keyboard

// The bug this covers: focus() does nothing when the element already has focus, so a cell opened
// from the keyboard was editable and focused with no selection inside it — no caret, nothing typed,
// and the arrow keys falling through to the page. Only the cell last clicked worked, because the
// click had left a selection in it.
test('Enter opens a cell you arrowed to, with a caret that takes text', async ({ page }) => {
  await openTable(page);

  // arrive by keyboard alone, from a cell in another column
  await cellFor(page, 'Alpha', 'note').click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');

  const cell = cellFor(page, 'Alpha', 'note');
  await expect(cell).toHaveAttribute('contenteditable', 'plaintext-only');

  // the caret is at the end, so typing continues the value rather than going nowhere
  await page.keyboard.type(' and typed');
  await expect(cell).toHaveText('plain and typed');

  await page.keyboard.press('Enter');
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('note: plain and typed');
});

test('Space opens a cell too, without typing a space into it', async ({ page }) => {
  await openTable(page);

  await cellFor(page, 'Alpha', 'note').click();
  await page.keyboard.press(' ');

  const cell = cellFor(page, 'Alpha', 'note');
  await expect(cell).toHaveAttribute('contenteditable', 'plaintext-only');
  await expect(cell).toHaveText('plain');

  await page.keyboard.type('!');
  await expect(cell).toHaveText('plain!');
});

test('F2 opens a cell and F2 again finishes with it', async ({ page }) => {
  await openTable(page);

  await cellFor(page, 'Alpha', 'note').click();
  await page.keyboard.press('F2');

  const cell = cellFor(page, 'Alpha', 'note');
  await expect(cell).toHaveAttribute('contenteditable', 'plaintext-only');

  await page.keyboard.type(' by F2');
  await page.keyboard.press('F2');

  await expect(page.locator('.note-table-cell.is-expanded')).toHaveCount(0);
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('note: plain by F2');
  expect(await focusedCell(page)).toBe('Alpha/note');   // and still where you were
});

test('a date cell opened from the keyboard takes a caret as well', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'date');

  await cellFor(page, 'Alpha', 'due').click();
  await page.keyboard.press('F2');

  await page.keyboard.type('!');
  await expect(cellFor(page, 'Alpha', 'due').locator('.cell-date-text')).toHaveText('2026-03-01!');
});
