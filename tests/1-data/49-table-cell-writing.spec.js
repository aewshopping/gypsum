const { test, expect } = require('@playwright/test');
const { loadFolder, appModule } = require('../helpers');

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

test('clearing a cell removes the key and the line it was on', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'status'), '');

  // The key line goes whole: the block now opens on the comment that followed it, with no blank
  // line left where the key was, and the key after it exactly where it was.
  await expect.poll(() => fileText(page, 'alpha.md'))
    .toContain('---\n  # a comment the parser skips\nnote: plain\n');
  expect(await fileText(page, 'alpha.md')).not.toContain('status:');

  // The column is still there. It is the layout's, not the file's — which is what makes removing
  // the key safe, and is the whole of the other half of this change.
  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('');
  await expect(page.locator('.note-table-cell-header[data-property="status"]')).toHaveCount(1);
});

test('the last note to carry a key losing it leaves the column, marked empty', async ({ page }) => {
  // The interlock between the two halves of this change, and the one a later change is most likely
  // to break quietly: removing the key is only safe because the column outlives it. `note` is
  // alpha.md's alone, so clearing that one cell is the last value the column has.
  await openTable(page);
  await expect(page.locator('.note-table-cell-header[data-property="note"]')).not.toHaveAttribute('data-empty', '');

  await retype(page, cellFor(page, 'Alpha', 'note'), '');
  await expect.poll(() => fileText(page, 'alpha.md')).not.toContain('note:');

  // Still a column, and now saying it holds nothing — without waiting for the folder to be reloaded.
  const header = page.locator('.note-table-cell-header[data-property="note"]');
  await expect(header).toHaveCount(1);
  await expect(header).toHaveAttribute('data-empty', '');
});

test('a note with no block at all is untouched by clearing a cell it has no key for', async ({ page }) => {
  await openTable(page);
  const original = await fileText(page, 'gamma.md');

  // Nothing to remove, so nothing is written — not a block added to hold an absence.
  await retype(page, cellFor(page, 'Gamma', 'status'), '');
  await page.waitForTimeout(200);
  expect(await fileText(page, 'gamma.md')).toBe(original);
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

/** The sentence an opened cell shows, which note-table-cell.css draws from data-tip. */
const shownSentence = cell => cell.evaluate(el => getComputedStyle(el, '::after').content);

// The type is set first so the cell is *both* unreadable and yaml-broken, which is what pins the
// order the two sentences come in: a block that did not read cleanly makes every value in it a
// guess — including whether this one really is the wrong type — and it is the thing refusing the
// caret, so it is the thing that gets to explain. An unreadable value would otherwise take a caret
// here, and the cell would be explaining a refusal that came from somewhere else.
test('a note whose front matter did not read cleanly has those cells locked', async ({ page }) => {
  await openTable(page);
  await setType(page, 'status', 'number');

  const cell = cellFor(page, 'Beta', 'status');
  await expect(cell).toHaveAttribute('data-yaml-error', '');
  await expect(cell).toHaveAttribute('data-mismatch', 'unreadable');

  await open(cell);
  await expect(cell).toHaveClass(/is-expanded/);                    // it still opens to be read
  await expect(cell).not.toHaveAttribute('contenteditable', /.*/);  // and takes no caret
  expect(await shownSentence(cell)).toMatch(/fix it in the note/);  // the yaml sentence, not the type's

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

/**
 * Sorts by status ascending through the controls above the table: the column's own header is off to
 * the right of a table this wide, and both controls are styled into labels that a click cannot
 * reach headlessly — so the change event they answer to is dispatched directly.
 */
async function sortByStatus(page) {
  await page.evaluate(() => {
    const direction = document.getElementById('sort-direction');
    direction.checked = true;
    direction.dispatchEvent(new Event('change', { bubbles: true }));
    const select = document.getElementById('sort-select');
    select.value = 'status';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const titles = (page) => page.evaluate(() => [...document.querySelectorAll('.note-table[data-vt-id]')]
  .map(row => row.querySelector('[data-prop="title"]').textContent));

const heldRow = (page) => page.locator('.note-table.move-pending');

test('an edited row waits, outlined, until focus leaves it', async ({ page }) => {
  await openTable(page);
  await sortByStatus(page);
  await expect.poll(() => titles(page)).toEqual(['Alpha', 'Beta', 'Gamma']);

  // 'zzz' sorts after 'live', and Gamma has no status at all so it stays at the end either way. A
  // write moves the file's last modified time too, so under the app's own sort every edit would
  // move its row — which is the whole reason the move waits.
  await open(cellFor(page, 'Alpha', 'status'));
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('zzz');
  await page.keyboard.press('Enter');

  await expect(cellFor(page, 'Alpha', 'status')).toHaveText('zzz');
  await expect(heldRow(page)).toHaveAttribute('data-vt-id', 'alpha.md');
  expect(await titles(page)).toEqual(['Alpha', 'Beta', 'Gamma']);

  // Enter leaves the cell selected and focused, and it stays that way while the move waits.
  await expect(cellFor(page, 'Alpha', 'status')).toHaveClass(/is-selected/);
  await expect(cellFor(page, 'Alpha', 'status')).toBeFocused();
});

test('the move happens when a cell in another row takes focus', async ({ page }) => {
  await openTable(page);
  await sortByStatus(page);
  await expect.poll(() => titles(page)).toEqual(['Alpha', 'Beta', 'Gamma']);

  // Finished with Enter, which leaves you on the cell — so the row is still the one focus is in.
  await open(cellFor(page, 'Alpha', 'status'));
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('zzz');
  await page.keyboard.press('Enter');
  await expect(heldRow(page)).toHaveCount(1);

  await cellFor(page, 'Gamma', 'title').click();

  await expect.poll(() => titles(page)).toEqual(['Beta', 'Alpha', 'Gamma']);
  await expect(heldRow(page)).toHaveCount(0);
  // The row moved under the click, and the cell clicked is still the selected one.
  await expect(cellFor(page, 'Gamma', 'title')).toHaveClass(/is-selected/);
});

test('the move happens when the click lands on nothing that can take focus', async ({ page }) => {
  await openTable(page);
  await sortByStatus(page);
  await expect.poll(() => titles(page)).toEqual(['Alpha', 'Beta', 'Gamma']);

  await open(cellFor(page, 'Alpha', 'status'));
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('zzz');
  await page.keyboard.press('Enter');
  await expect(heldRow(page)).toHaveCount(1);

  // The report line above the table takes no focus, so this click blurs the cell to the body and
  // fires no focusin at all. Focus has still left the row, which is the only question that matters.
  await page.locator('#output-report').click();

  await expect.poll(() => titles(page)).toEqual(['Beta', 'Alpha', 'Gamma']);
  await expect(heldRow(page)).toHaveCount(0);
});

test('a cell left by clicking away moves at once, having nobody in it to protect', async ({ page }) => {
  await openTable(page);
  await sortByStatus(page);
  await expect.poll(() => titles(page)).toEqual(['Alpha', 'Beta', 'Gamma']);

  // retype finishes by clicking the searchbox, which is the write and the departure in one gesture:
  // the write lands after focus has already gone, so there is no row anyone is in to hold.
  await retype(page, cellFor(page, 'Alpha', 'status'), 'zzz');

  await expect.poll(() => titles(page)).toEqual(['Beta', 'Alpha', 'Gamma']);
  await expect(heldRow(page)).toHaveCount(0);
});

test('a row holding a move keeps its outline through another edit in the same row', async ({ page }) => {
  await openTable(page);
  await sortByStatus(page);
  await expect.poll(() => titles(page)).toEqual(['Alpha', 'Beta', 'Gamma']);

  await open(cellFor(page, 'Alpha', 'status'));
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('zzz');
  await page.keyboard.press('Enter');
  await expect(heldRow(page)).toHaveCount(1);

  // A second cell in the same row: the row is redrawn by that write, and is still holding its move.
  await open(cellFor(page, 'Alpha', 'note'));
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press('Enter');

  await expect(cellFor(page, 'Alpha', 'note')).toHaveText('plain!');
  await expect(heldRow(page)).toHaveAttribute('data-vt-id', 'alpha.md');
  expect(await titles(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
});

test('sorting by hand lets a held move go with it', async ({ page }) => {
  await openTable(page);
  await sortByStatus(page);
  await expect.poll(() => titles(page)).toEqual(['Alpha', 'Beta', 'Gamma']);

  await open(cellFor(page, 'Alpha', 'status'));
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('zzz');
  await page.keyboard.press('Enter');
  await expect(heldRow(page)).toHaveCount(1);

  // Sorting the table is a new answer to where every row goes, so nothing is left waiting.
  await sortByStatus(page);

  await expect(heldRow(page)).toHaveCount(0);
  await expect.poll(() => titles(page)).toEqual(['Beta', 'Alpha', 'Gamma']);
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

// The other half of the test above, and the reason the two reasons are told apart. A value that
// cannot be *read* as its type is a scalar in a scalar column, so correcting it splices exactly the
// bytes a matching cell splices — the whole file is compared rather than the one line, because that
// is what would catch an explanation being captured out of the cell and written into the note.
test('an unreadable value can be corrected in its own cell', async ({ page }) => {
  await openTable(page);
  await setType(page, 'count', 'number');
  await retype(page, cellFor(page, 'Alpha', 'count'), 'about five');
  await expect(cellFor(page, 'Alpha', 'count')).toHaveAttribute('data-mismatch', 'unreadable');

  const before = await fileText(page, 'alpha.md');
  await retype(page, cellFor(page, 'Alpha', 'count'), '5');

  await expect.poll(() => fileText(page, 'alpha.md'))
    .toBe(before.replace('count: about five', 'count: 5'));
  await expect(cellFor(page, 'Alpha', 'count')).not.toHaveAttribute('data-mismatch', /.*/);
});

// And the half that must go on refusing. Committing `zzz` into a column of lists would rewrite the
// value in the other shape, taking `[en, fr]`'s brackets with it — so the cell takes no caret and
// nothing reaches the file.
test('a cell whose shape its column cannot hold still writes nothing', async ({ page }) => {
  await openTable(page);
  await setType(page, 'langs', 'number');
  const before = await fileText(page, 'alpha.md');

  const cell = cellFor(page, 'Alpha', 'langs');
  await expect(cell).toHaveAttribute('data-mismatch', 'shape');

  await open(cell);
  await page.keyboard.type('zzz');
  await commit(page);

  expect(await fileText(page, 'alpha.md')).toBe(before);
  // table_layouts.gypsum is there — setting the column's type wrote it — but no version of the
  // note was snapshotted, because nothing was written to the note to snapshot.
  expect(await page.evaluate(() => Object.keys(window.__saved))).not.toContain('history.gypsum');
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

test('a padded list is compared by the text the parser kept, so one edit is still one splice', async ({ page }) => {
  // The other half of the test above, for the values the parser now declines to coerce. `01` is
  // kept as its own text, so the comparison has to ask readValue() rather than the spec's
  // coerceValue() — which would read `01` back as `1`, call two untouched items changed and rewrite
  // the whole list, taking the comment between them with it.
  await openTable(page, {
    'delta.md': '---\ncodes:\n- 01\n- 02\n  # between two items\n- 10\nstatus: draft\n---\n# Delta\n\nBody.\n',
  });
  await setType(page, 'codes', 'array');

  await expect(cellFor(page, 'Delta', 'codes')).toHaveText('01, 02, 10');
  await retype(page, cellFor(page, 'Delta', 'codes'), '01, 07, 10');

  // The edited item comes back quoted and the untouched ones do not, which is both rules at once:
  // the writer quotes `07` so that every *other* reader sees the text too, and the bytes it did not
  // touch keep the note looking like the note it was.
  await expect.poll(() => fileText(page, 'delta.md'))
    .toBe('---\ncodes:\n- 01\n- "07"\n  # between two items\n- 10\nstatus: draft\n---\n# Delta\n\nBody.\n');
  await expect(cellFor(page, 'Delta', 'codes')).toHaveText('01, 07, 10');
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

test('emptying a list removes the key and every one of its item lines', async ({ page }) => {
  await openTable(page);
  await retype(page, cellFor(page, 'Alpha', 'people'), '');

  // people: is flush with its key and runs to '- "Doe, Jane"'. All of it goes, and the key before
  // it and the key after it close up with nothing between them.
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('ref: "0042"\nlangs: [en, fr]\n');
  expect(await fileText(page, 'alpha.md')).not.toContain('John Smith');

  // the column survives the last note that carried the key losing it
  await expect(cellFor(page, 'Alpha', 'people')).toHaveText('');
  await expect(page.locator('.note-table-cell-header[data-property="people"]')).toHaveCount(1);
});

test('an indented block list goes the same way, and the block stays readable', async ({ page }) => {
  await openTable(page);
  await setType(page, 'scores', 'array');
  await retype(page, cellFor(page, 'Alpha', 'scores'), '');

  // scores is the last key in the block, so its removal has to stop at the closing separator.
  await expect.poll(() => fileText(page, 'alpha.md')).toContain('langs: [en, fr]\n---\n# Alpha');
  expect(await fileText(page, 'alpha.md')).not.toContain('scores');
});

test('a comment after a list survives its key being removed, one between two items does not', async ({ page }) => {
  // The limitation CLAUDE.md already states for list edits, pinned here as a known cost: a comment
  // between two items is inside the bytes the key occupies. One after the last item is not, and a
  // blank or comment line never extends a key's span — which is what keeps the rest of the block safe.
  await openTable(page, {
    'delta.md': [
      '---', 'keep: yes', 'people:', '  - Ann',
      '  # between the items', '  - Bo',
      '# after the list', 'tail: yes', '---', '# Delta', '',
    ].join('\n'),
  });

  await retype(page, cellFor(page, 'Delta', 'people'), '');

  await expect.poll(() => fileText(page, 'delta.md'))
    .toBe('---\nkeep: yes\n# after the list\ntail: yes\n---\n# Delta\n');
});

test('a CRLF note keeps its line endings when a key is removed', async ({ page }) => {
  // A span's valueEnd stops short of the '\r' on purpose, so the delete has to reach past it to the
  // newline — or the note would be left with a stray carriage return on a line of its own.
  await openTable(page, {
    'epsilon.md': '---\r\nkeep: yes\r\nstatus: draft\r\ntail: yes\r\n---\r\n# Epsilon\r\n',
  });

  await retype(page, cellFor(page, 'Epsilon', 'status'), '');

  await expect.poll(() => fileText(page, 'epsilon.md'))
    .toBe('---\r\nkeep: yes\r\ntail: yes\r\n---\r\n# Epsilon\r\n');
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

  // a read-only cell opens to be read and keeps the arrow keys, having no caret to give them to.
  // filename rather than title, which now takes a caret: the file itself is not editable from here.
  const locked = cellFor(page, 'Alpha', 'filename');
  await open(locked);
  await expect(locked).toHaveClass(/is-expanded/);

  await page.keyboard.press('ArrowRight');

  await expect(locked).not.toHaveClass(/is-expanded/);
  await expect(locked).not.toHaveClass(/is-selected/);
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

// ---------------------------------------------------------------- Tab

test('Tab out of an open cell writes it and leaves one cell marked', async ({ page }) => {
  await openTable(page);

  const cell = cellFor(page, 'Alpha', 'note');
  await open(cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('tabbed away');
  await page.keyboard.press('Tab');

  await expect.poll(() => fileText(page, 'alpha.md')).toContain('note: tabbed away');

  await expect(page.locator('.note-table-cell.is-expanded')).toHaveCount(0);
  await expect(cellFor(page, 'Alpha', 'note')).not.toHaveClass(/is-selected/);
  await expect(page.locator('.note-table-cell.is-selected')).toHaveCount(1);

  // you are on the next cell now, one press from editing it
  await page.keyboard.press('F2');
  await expect(page.locator('.note-table-cell.is-expanded')).toHaveCount(1);
});

// ---------------------------------------------------------------- a value holding a [[link]]

// A closed cell draws the [[links]] in its value as anchors. The anchor wraps the note's own
// characters, brackets and all, so the cell's text — which is what the commit writes back — is
// exactly what it was before the links became clickable. An anchor labelled with the alias instead
// would rewrite `related: "[[alpha.md|the alpha note]]"` to `the alpha note` the first time anyone
// opened that cell and clicked away. That is the fault these two guard.
const LINKED = [
  '---',
  'related: "[[alpha.md|the alpha note]]"',
  'others:',
  '  - "[[alpha.md]]"',
  '  - "[[gamma.md]]"',
  '---',
  '# Linked',
  '',
].join('\n');

/**
 * Opens a cell from the keyboard. A link can cover every pixel of its cell's text, and a press on
 * one selects the cell rather than opening it — so a click is the wrong way in here, where what is
 * being tested is the writing rather than the pointing.
 */
async function openFromKeyboard(page, cell) {
  await cell.focus();
  await page.keyboard.press('Enter');
  await expect(cell).toHaveClass(/is-expanded/);
}

test('opening a cell holding a [[link]] and leaving it writes nothing', async ({ page }) => {
  await openTable(page, { 'linked.md': LINKED });
  const before = await fileText(page, 'linked.md');

  const cell = cellFor(page, 'Linked', 'related');
  // the anchor's text is the note's own, brackets and pipe included
  await expect(cell.locator('a.internal-link')).toHaveText('[[alpha.md|the alpha note]]');

  await openFromKeyboard(page, cell);
  await commit(page);

  expect(await fileText(page, 'linked.md')).toBe(before);
});

test('an edit beside a link leaves the link as the note wrote it', async ({ page }) => {
  await openTable(page, { 'linked.md': LINKED });
  await setType(page, 'others', 'array');

  const cell = cellFor(page, 'Linked', 'others');
  await openFromKeyboard(page, cell);
  await page.keyboard.press('End');
  await page.keyboard.type(', [[beta.md]]');
  await commit(page);

  await expect.poll(() => fileText(page, 'linked.md')).toContain('"[[beta.md]]"');
  const after = await fileText(page, 'linked.md');
  expect(after).toContain('"[[alpha.md]]"');
  expect(after).toContain('"[[gamma.md]]"');
});

// A link completed from the picker is inserted by execCommand and a backward Selection.modify, so
// the characters that reach the note depend on an extend count being exactly right. An off-by-one
// there eats a bracket or a letter of the value beside it, and only the bytes on disk show it.
test('a link completed from the picker reaches the note intact', async ({ page }) => {
  await openTable(page, { 'linked.md': '---\nref: see\n---\n# Linked\n\n' });

  const cell = cellFor(page, 'Linked', 'ref');
  await openFromKeyboard(page, cell);
  await page.keyboard.press('End');
  await page.keyboard.type(' [[alph');

  await expect(page.locator('.ac-picker-popup')).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(cell).toHaveText('see [[alpha.md]]');

  await commit(page);
  // Quoted because the value holds a '[' — needsQuoting's breaksBlock rule. The point of the test
  // is the characters between the quotes.
  // Bare, and rightly: breaksBlock quotes a value that *starts* with '[', and this one starts with
  // 's'. A plain scalar is what YAML reads it back as, which is what makes the link survive.
  await expect.poll(() => fileText(page, 'linked.md')).toContain('ref: see [[alpha.md]]');

  // And the round trip that matters: the re-read found a real link, not just the right characters.
  await expect.poll(() => page.evaluate(() =>
    window.appState.myFiles.find(f => f.internalId === 'linked.md')?.internalLink ?? []
  )).toContain('alpha.md');
});

// ---------------------------------------------------------------- the lock the table shows
// plans/table-delete-column.md §5.1 and §5.3: the write refuses exactly the notes the table locks.

test('a shadowed reserved key or a duplicated key keeps a note from being written, and nothing else in the batch', async ({ page }) => {
  await openTable(page, {
    'shadow.md': '---\nstatus: draft\nfilename: fake.md\n---\n# Shadow\n',
    'dup.md': '---\nstatus: draft\nnote: x\nstatus: live\n---\n# Dup\n',
  });
  const before = { shadow: await fileText(page, 'shadow.md'), dup: await fileText(page, 'dup.md') };

  const cellEdit = await page.evaluate(async () => {
    const { applyCellEdits } = await import('/public/js/editing/save-cell-edit.js');
    const records = await applyCellEdits(['alpha.md', 'shadow.md', 'dup.md']
      .map(internalId => ({ internalId, property: 'status', text: 'done' })));
    return records.map(record => record.internalId);
  });
  expect(cellEdit).toEqual(['alpha.md']);
  expect(await fileText(page, 'alpha.md')).toContain('status: done');

  // An undo is a raw write with `expect`, which is the path that could meet a note locked since.
  const undo = await page.evaluate(async () => {
    const { applyRawEdits } = await import('/public/js/editing/apply-raw-edits.js');
    const records = await applyRawEdits([
      { internalId: 'alpha.md', property: 'status', raw: ' draft', expect: ' done' },
      { internalId: 'shadow.md', property: 'status', raw: ' gone', expect: ' draft' },
      { internalId: 'dup.md', property: 'status', raw: ' gone', expect: ' live' },
    ]);
    return records.map(record => record.internalId);
  });
  expect(undo).toEqual(['alpha.md']);
  expect(await fileText(page, 'shadow.md')).toBe(before.shadow);
  expect(await fileText(page, 'dup.md')).toBe(before.dup);
});

test('an edit for a note that is no longer loaded is refused rather than thrown on', async ({ page }) => {
  await openTable(page);
  const records = await page.evaluate(async () => {
    const { applyRawEdits } = await import('/public/js/editing/apply-raw-edits.js');
    return applyRawEdits([
      { internalId: 'gone.md', property: 'status', raw: ' x' },
      { internalId: 'alpha.md', property: 'status', raw: ' done' },
    ]);
  });
  expect(records.map(record => record.internalId)).toEqual(['alpha.md']);
});

// §6.3: the shape, not the time. A folder-wide batch renders once and reads each file once.
test('a batch across many files renders once and reads each written file once', async ({ page }) => {
  const extra = {};
  for (let i = 0; i < 60; i++) extra[`n${i}.md`] = `---\nstatus: draft\nnote: ${i}\n---\n# N${i}\n`;
  await openTable(page, extra);

  const counts = await page.evaluate(async () => {
    const { appState } = await import('/public/js/services/store.js');
    const { applyRawEdits } = await import('/public/js/editing/apply-raw-edits.js');

    const reads = new Map();
    for (const file of appState.myFiles) {
      const getFile = file.handle.getFile;
      file.handle.getFile = async () => {
        const got = await getFile();
        const text = got.text;
        return { ...got, text: async () => { reads.set(file.filename, (reads.get(file.filename) ?? 0) + 1); return text(); } };
      };
    }
    // One callback per burst of synchronous DOM work, so two renders separated by an await are two.
    let renders = 0;
    const counter = new MutationObserver(records => { if (records.some(r => r.addedNodes.length)) renders++; });
    counter.observe(document.getElementById('output'), { childList: true, subtree: true });

    const edits = appState.myFiles.filter(file => file.filename.startsWith('n'))
      .map(file => ({ internalId: file.internalId, property: 'note', raw: '' }));
    const progress = [];
    const records = await applyRawEdits(edits, { onProgress: (done, total) => progress.push([done, total]) });
    counter.disconnect();
    return {
      records: records.length,
      maxReads: Math.max(...reads.values()),
      filesRead: reads.size,
      progress: progress.length,
      last: progress.at(-1),
      renders,
    };
  });
  expect(counts.records).toBe(60);
  expect(counts.filesRead).toBe(60);
  // The write's own read and the verified save's read-back; the refresh parses the written text.
  expect(counts.maxReads).toBe(2);
  expect(counts.progress).toBe(60);
  expect(counts.last).toEqual([60, 60]);
  expect(counts.renders).toBe(1);
});

// ---------------------------------------------------------------- a key put back where it was
// plans/table-delete-column.md §12 and §5.2.


/** Every top-level key's span in a note. */
async function spansOf(text) {
  const { parseYaml } = await appModule('services/file-parsing/yaml-parse.js');
  const spans = new Map();
  parseYaml(text, [], spans);
  return spans;
}

test('the anchor recorded for a removal is the key on the line above, or null for the first', async () => {
  const { keyAbove } = await appModule('editing/front-matter-splice.js');
  const text = '---\nfirst: 1\nlist:\n  - a\n  - b\n# a comment\n\nafter: 2\nlast: 3\n---\n';
  const spans = await spansOf(text);
  expect(keyAbove(spans, 'first')).toBe(null);
  expect(keyAbove(spans, 'list')).toBe('first');
  expect(keyAbove(spans, 'after')).toBe('list');    // past the comment and the blank line
  expect(keyAbove(spans, 'last')).toBe('after');
});

test('keySplice puts a key back after its anchor, under the separator, or at the end', async () => {
  const { keySplice } = await appModule('editing/front-matter-splice.js');
  const text = '---\nfirst: 1\nlist:\n  - a\n  - b\nlast: 3\n---\nbody\n';
  const spans = await spansOf(text);
  const indices = { start: 0, end: 6 };
  const put = (placement) => {
    const s = keySplice(text, 'x', ' 9', indices, undefined, placement);
    return text.slice(0, s.start) + s.written + text.slice(s.end);
  };
  expect(put({ anchor: 'first', anchorSpan: spans.get('first') }))
    .toBe('---\nfirst: 1\nx: 9\nlist:\n  - a\n  - b\nlast: 3\n---\nbody\n');
  expect(put({ anchor: 'list', anchorSpan: spans.get('list') }))
    .toBe('---\nfirst: 1\nlist:\n  - a\n  - b\nx: 9\nlast: 3\n---\nbody\n');
  expect(put({ anchor: null }))
    .toBe('---\nx: 9\nfirst: 1\nlist:\n  - a\n  - b\nlast: 3\n---\nbody\n');
  expect(put({ anchor: 'gone' }))
    .toBe('---\nfirst: 1\nlist:\n  - a\n  - b\nlast: 3\nx: 9\n---\nbody\n');
});

test('keySplice with keepKey writes a bare key', async () => {
  const { keySplice } = await appModule('editing/front-matter-splice.js');
  const text = '---\na: 1\n---\n';
  const s = keySplice(text, 'people', '', { start: 0, end: 2 }, undefined, { keepKey: true });
  expect(text.slice(0, s.start) + s.written + text.slice(s.end)).toBe('---\na: 1\npeople:\n---\n');
});

/** Takes keys out of notes through the writer, then undoes that batch, returning every stage. */
async function removeAndUndo(page, edits) {
  return page.evaluate(async (edits) => {
    const { applyRawEdits } = await import('/public/js/editing/apply-raw-edits.js');
    const { pushUndoBatch, reverseLastBatch } = await import('/public/js/table-undo/undo-stacks.js');
    const names = [...new Set(edits.map(edit => edit.internalId))];
    const snap = () => Object.fromEntries(names.map(name => [name, window.__files[name]]));
    const before = snap();
    const records = await applyRawEdits(edits.map(edit => ({ ...edit, raw: '' })));
    pushUndoBatch(records);
    const removed = snap();
    await reverseLastBatch('undo');
    return { before, removed, undone: snap(), records };
  }, edits);
}

test('a cleared key comes back on its own line, first, middle, block list or CRLF', async ({ page }) => {
  await openTable(page, {
    'keys.md': '---\nfirst: 1\nmiddle: 2\nlist:\n    - a\n    - b\n# after the list\nlast: 3\n---\n# Keys\n',
    'crlf.md': '---\r\nfirst: 1\r\nlist:\r\n  - a\r\n  - b\r\nlast: 3\r\n---\r\n# Crlf\r\n',
  });
  for (const [name, property] of [['keys.md', 'first'], ['keys.md', 'middle'], ['keys.md', 'list'],
                                  ['crlf.md', 'list'], ['crlf.md', 'first']]) {
    const { before, removed, undone } = await removeAndUndo(page, [{ internalId: name, property }]);
    expect(removed[name]).not.toBe(before[name]);
    expect(undone[name]).toBe(before[name]);
  }
});

test('a key whose anchor has gone comes back at the end of the block', async ({ page }) => {
  await openTable(page, { 'keys.md': '---\nfirst: 1\nmiddle: 2\nlast: 3\n---\n# Keys\n' });
  const result = await page.evaluate(async () => {
    const { applyRawEdits } = await import('/public/js/editing/apply-raw-edits.js');
    const { pushUndoBatch, reverseLastBatch } = await import('/public/js/table-undo/undo-stacks.js');
    pushUndoBatch(await applyRawEdits([{ internalId: 'keys.md', property: 'middle', raw: '' }]));
    await applyRawEdits([{ internalId: 'keys.md', property: 'first', raw: '' }]);
    await reverseLastBatch('undo');
    return window.__files['keys.md'];
  });
  expect(result).toBe('---\nlast: 3\nmiddle: 2\n---\n# Keys\n');
});

test('two neighbouring keys cleared in one batch are put back together, in order', async ({ page }) => {
  await openTable(page, { 'keys.md': '---\nfirst: 1\na: x\nb: y\nlast: 3\n---\n# Keys\n' });
  const { before, removed, undone, records } = await removeAndUndo(page, [
    { internalId: 'keys.md', property: 'a' },
    { internalId: 'keys.md', property: 'b' },
  ]);
  expect(removed['keys.md']).toBe('---\nfirst: 1\nlast: 3\n---\n# Keys\n');
  expect(records.find(record => record.property === 'b').anchor).toBe('a');
  expect(undone['keys.md']).toBe(before['keys.md']);
});

test('a bare key is removed, and put back bare', async ({ page }) => {
  await openTable(page, { 'bare.md': '---\nfirst: 1\npeople:\nlast: 3\n---\n# Bare\n' });
  const { before, removed, undone, records } = await removeAndUndo(page, [{ internalId: 'bare.md', property: 'people' }]);
  expect(removed['bare.md']).toBe('---\nfirst: 1\nlast: 3\n---\n# Bare\n');
  expect(records[0]).toMatchObject({ before: '', after: '', existed: true, anchor: 'first' });
  expect(undone['bare.md']).toBe(before['bare.md']);
});
