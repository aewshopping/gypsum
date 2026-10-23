const { test, expect } = require('@playwright/test');
const { loadFolder, chooseView, setupMockDirectoryWithNoteCreation, setupMockCellWritingFolder } = require('../helpers');

// What each note is for:
//   a.md — a real date, a list, and a value holding markup. The markup one is the whole point of
//          the escaping: a cell is what an edit is read back out of, so `a <b> c` rendered as
//          `a  c` would have rewritten the note on the first commit.
//   b.md — prose in the date column, so a mismatched cell is on screen beside a matching one.
//   c.md — no front matter at all, so an empty date cell can be checked.
//   d.md — a date carrying a time, which only the "date and time" type can put in a picker.
async function setupFiles(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const mk = (n, c) => ({ kind: 'file', name: n,
        getFile: async () => ({ name: n, size: c.length, lastModified: Date.now(), text: async () => c }) });
      return { kind: 'directory', name: 'root', values: async function* () {
        yield mk('a.md', '---\ndue: 2026-03-01\nmarkup: a <b> c & "quoted"\npeople:\n  - John Smith\n  - "Doe, Jane"\n---\n# Alpha\n');
        yield mk('b.md', '---\ndue: quite soon\nmarkup: plain\npeople:\n  - Sam\n---\n# Beta\n');
        // a colour tag, because a coloured row forces its text to whatever reads against that
        // colour — and an expanded cell swaps to the neutral background underneath it
        yield mk('c.md', '# Gamma\n\n#color/coral\n');
        // a time of day in the date column, for the type that can hold one
        yield mk('d.md', '---\ndue: 2026-03-01 14:30\nmarkup: plain\n---\n# Delta\n');
      } };
    };
  });
}

async function openTable(page, width = 1400) {
  await page.setViewportSize({ width, height: 900 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await chooseView(page, 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const rowFor = (page, title) => page.locator('.note-table').filter({ hasText: title }).first();
const cellFor = (page, title, prop) => rowFor(page, title).locator(`.note-table-cell[data-prop="${prop}"]`);

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

const open = async cell => { await cell.click(); await cell.click(); };

// ---------------------------------------------------------------- the precondition

// The assertion that would have caught the data loss: what a cell shows and what textContent reads
// back have to be the note's own characters, not the browser's reading of them as markup.
test('a value holding markup survives the round trip through its cell', async ({ page }) => {
  await openTable(page);
  const cell = cellFor(page, 'Alpha', 'markup');

  await expect(cell).toHaveText('a <b> c & "quoted"');
  expect(await cell.evaluate(el => el.textContent)).toBe('a <b> c & "quoted"');
  expect(await cell.evaluate(el => el.querySelector('b'))).toBe(null);
});

test('a tags cell still renders pills, so escaping did not reach the markup that is meant', async ({ page }) => {
  await openTable(page);
  await expect(cellFor(page, 'Alpha', 'internalId').locator('a')).toHaveCount(1);
});

// ---------------------------------------------------------------- dates

test('a date cell shows the note\'s own words, and an app-owned one stays formatted', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'date');

  await expect(cellFor(page, 'Alpha', 'due')).toHaveText('2026-03-01');

  // lastModified is a Date object the app fills in, with no note text behind it
  await expect(cellFor(page, 'Alpha', 'lastModified')).toHaveText(/\d+[/.-]\d+[/.-]\d+/);
});

test('a date cell opens with a caret and a picker, and picking rewrites the text', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'date');

  const cell = cellFor(page, 'Alpha', 'due');
  await open(cell);

  const text = cell.locator('.cell-date-text');
  await expect(text).toHaveAttribute('contenteditable', 'plaintext-only');
  expect(await text.evaluate(el => document.activeElement === el)).toBe(true);

  // the picker is seeded from the cell, and the input is rendered so showPicker() has a box
  const input = cell.locator('.cell-date-input');
  await expect(input).toHaveValue('2026-03-01');
  expect(await input.evaluate(el => el.getBoundingClientRect().width > 0)).toBe(true);

  // the native calendar is browser chrome that Playwright cannot drive, so this is the seam:
  // whatever the calendar sets, the change event is what the cell listens to
  await input.evaluate(el => {
    el.value = '2026-12-25';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(text).toHaveText('2026-12-25');
  await expect(cell).toHaveText('2026-12-25');   // the button and input contribute no text
});

// An unreadable date reaches the date editor for the first time — until it took a caret, the
// mismatch turned it away before this code ran. It needs nothing special: the seed already falls
// back to an empty input when the text will not parse, so the caret can retype the value and the
// calendar can replace it outright, which is the faster of the two fixes.
test('an unreadable date opens with a caret and an empty picker', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'date');

  const cell = cellFor(page, 'Beta', 'due');
  await expect(cell).toHaveAttribute('data-mismatch', 'unreadable');
  await open(cell);

  await expect(cell.locator('.cell-date-text')).toHaveText('quite soon');   // the note's own words
  await expect(cell.locator('.cell-date-input')).toHaveValue('');           // nothing to seed it with

  await cell.locator('.cell-date-input').evaluate(el => {
    el.value = '2026-12-25';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(cell.locator('.cell-date-text')).toHaveText('2026-12-25');
});

test('a date and time column opens the picker that has a clock in it', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'datetime');

  const cell = cellFor(page, 'Delta', 'due');
  await expect(cell).toHaveText('2026-03-01 14:30');   // still the note's own words
  await open(cell);

  // The difference between the two date types is the picker and nothing else: same span, same
  // caret, an input that asks for a time as well and is seeded with the one the note carries.
  const input = cell.locator('.cell-date-input');
  await expect(input).toHaveAttribute('type', 'datetime-local');
  await expect(input).toHaveValue('2026-03-01T14:30');

  await input.evaluate(el => {
    el.value = '2026-12-25T09:05';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(cell).toHaveText('2026-12-25T09:05');   // the browser's spelling, not one of ours
});

test('collapsing a date cell leaves plain text and hands focus back to the cell', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'date');

  const cell = cellFor(page, 'Alpha', 'due');
  await open(cell);
  await page.keyboard.press('Escape');

  await expect(cell).not.toHaveClass(/is-expanded/);
  await expect(cell.locator('.cell-date-text')).toHaveCount(0);
  await expect(cell.locator('.cell-date-pick')).toHaveCount(0);
  await expect(cell).toHaveText('2026-03-01');

  // keyboard navigation reads document.activeElement and needs the cell itself, so losing focus
  // to the body here would kill the arrow keys until something was clicked
  expect(await cell.evaluate(el => document.activeElement === el)).toBe(true);
});

// ---------------------------------------------------------------- lists

test('a list cell is one comma-joined line, open and closed', async ({ page }) => {
  await openTable(page);
  const cell = cellFor(page, 'Alpha', 'people');

  await expect(cell.locator('ul')).toHaveCount(0);
  await expect(cell).toHaveText('John Smith, "Doe, Jane"');   // the item holding a comma is quoted

  await open(cell);
  await expect(cell).toHaveAttribute('contenteditable', 'plaintext-only');
  await expect(cell).toHaveText('John Smith, "Doe, Jane"');   // and opening changes nothing
});

// ---------------------------------------------------------------- what refuses a caret

// lastModified, the app's own value: title and then filename were the exemplar here, and both now
// take a caret — title from front matter, filename by renaming the file.
test('a property that cannot be written back takes no caret', async ({ page }) => {
  await openTable(page);

  const modified = cellFor(page, 'Alpha', 'lastModified');
  await open(modified);
  await expect(modified).toHaveClass(/is-expanded/);                    // it still opens to be read
  await expect(modified).not.toHaveAttribute('contenteditable', /.*/);  // but takes no caret
  // and says nothing about it: nothing is wrong, and there is nothing to do about it
  expect(await modified.evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
});

test('the title takes a caret, although its column is locked', async ({ page }) => {
  await openTable(page);

  // The one column where the padlock and the caret part company. The padlock is drawn on the type
  // glyph and says the type is the app's, which it still is; the caret is a separate question, and
  // for title the answer is yes because a front matter `title:` overrides the note's own `# H1`.
  const title = cellFor(page, 'Alpha', 'title');
  await expect(page.locator('.note-table-cell-header[data-property="title"] .type-glyph use[href="#icon-lock-badge"]'))
    .toHaveCount(1);

  await open(title);
  await expect(title).toHaveAttribute('contenteditable', 'plaintext-only');
});

// ---------------------------------------------------------------- Enter

// Enter used to belong to a list cell, where it typed the break that reads as a new item — §3.3,
// now superseded. It finishes a cell of any type, so that one key means one thing.
test('Enter finishes with a cell, whatever the column holds', async ({ page }) => {
  await openTable(page);

  const list = cellFor(page, 'Alpha', 'people');
  await open(list);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');

  await expect(list).not.toHaveClass(/is-expanded/);
  expect(await list.evaluate(el => el.textContent)).not.toContain('\n');

  const text = cellFor(page, 'Alpha', 'markup');
  await open(text);
  const before = await text.evaluate(el => el.textContent);
  await page.keyboard.press('Enter');

  await expect(text).not.toHaveClass(/is-expanded/);
  expect(await text.evaluate(el => el.textContent)).toBe(before);
});

// ---------------------------------------------------------------- the lock

// One direction only, and deliberately so. The lock and the caret were one decision until `title`
// became editable; now the padlock is about the type (isTypeSettable) and the caret is its own
// question (isPropertyEditable), so a locked column may or may not take one — title does, every
// other locked column does not. What must never happen is the table promising more than the cell
// gives, so what is asserted is that an *open* column always takes a caret. The title's own case is
// covered by name above, being the single exception.
test('a column with no lock always takes a caret', async ({ page }) => {
  await openTable(page);

  // internalId is left out because its cell is an open-file link rather than a value at all, so
  // clicking it opens the note instead of selecting the cell. It is locked, as a control column.
  const columns = (await page.evaluate(() =>
    [...document.querySelectorAll('.note-table-cell-header')].map(h => h.dataset.property)))
    .filter(name => name !== 'internalId');
  expect(columns.length).toBeGreaterThan(4);   // the fixture is not all locked or all open

  for (const property of columns) {
    const locked = await page
      .locator(`.note-table-cell-header[data-property="${property}"] .type-glyph use[href="#icon-lock-badge"]`)
      .count() === 1;
    const cell = rowFor(page, 'Alpha').locator(`.note-table-cell[data-prop="${property}"]`);
    await open(cell);

    const caret = await cell.evaluate(el =>
      el.hasAttribute('contenteditable') || !!el.querySelector('[contenteditable]'));
    if (!locked) expect(caret, `${property}: no lock, but the cell refused a caret`).toBe(true);

    await page.keyboard.press('Escape');
  }
});

// ---------------------------------------------------------------- read-only cells look it

// ---------------------------------------------------------------- list item marking

/** The text each registered list-item range covers, for one cell. */
const markedItems = (page, prop) => page.evaluate(prop => {
  const cell = [...document.querySelectorAll('.note-table')]
    .find(r => r.textContent.includes('Alpha'))
    .querySelector(`[data-prop="${prop}"]`);
  const h = CSS.highlights.get('list-item');
  return h ? [...h].filter(r => r.startContainer.parentElement === cell).map(r => r.toString()) : [];
}, prop);

// ---------------------------------------------------------------- an opened cell's own spacing

// plans/completed/table-rename-filename.md: the filename cell renames the note. What reaches the
// disk is tests/1-data/23-rename-shortcut.spec.js; this is what the cell does on screen.
test('a filename cell opens before its extension, says what is wrong or where it moves, and keeps its place', async ({ page }) => {
  await setupMockDirectoryWithNoteCreation(page);
  await page.addInitScript(() => {
    window.__createdFiles.clear();
    window.__createdFiles.set('a&b.txt', '# Amp\n#keep');
    window.__createdFiles.set('other.md', '# Other\nnothing here');
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await loadFolder(page);
  await chooseView(page, 'table');
  await page.fill('#searchbox', 'tags:keep');
  await page.press('#searchbox', 'Enter');
  await expect(page.locator('.note-table[data-vt-id]')).toHaveCount(1);

  const cell = page.locator('.note-table-cell[data-prop="filename"]').first();
  await expect(cell).toHaveText('a&b.txt');                                // escaped, so drawn as itself
  await open(cell);
  await page.keyboard.type('X');
  await expect(cell).toHaveText('a&bX.txt');                               // the caret sat before .txt

  const retype = async text => { await page.keyboard.press('Control+A'); await page.keyboard.type(text); };
  await retype('other.md');
  await expect(cell).toHaveAttribute('data-rename-line', 'A loaded file with that path already exists.');
  await expect(cell).toHaveClass(/rename-refused/);
  await retype('lists/a&b');
  await expect(cell).toHaveAttribute('data-rename-line', '→ moves to lists/');
  await expect(cell).not.toHaveClass(/rename-refused/);
  await retype('a&b');
  await expect(cell).not.toHaveAttribute('data-rename-line');              // typed back as it was
  await expect(cell).not.toHaveClass(/rename-refused/);
  await retype('a&c');
  await expect(cell).not.toHaveAttribute('data-rename-line');              // a plain rename says nothing

  await page.keyboard.press('Enter');
  // Still drawn under the filter, which was keyed by the old name, and focus is back on the cell
  const renamed = page.locator('.note-table[data-vt-id="a&c.txt"] .note-table-cell[data-prop="filename"]');
  await expect(renamed).toHaveText('a&c.txt');
  await expect(page.locator('.note-table[data-vt-id]')).toHaveCount(1);
  await expect(renamed).toBeFocused();
});

// ---------------------------------------------------------------- the tags cell

// plans/completed/tag-edit-in-table-view.md: a bullet on each tag the note's `tags:` holds, and completion of
// tag names while typing in the cell. What reaches the disk is tests/1-data/64-table-tag-edit.spec.js.
async function openTagTable(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setupMockCellWritingFolder(page, {
    'tagged.md': '---\ntags: [work, project]\n---\n# Tagged\n\nAlso #idea and #work.\n',
    'other.md': '---\ntags: [workshop]\n---\n# Other\n',
  });
  await page.goto('/');
  await loadFolder(page);
  await chooseView(page, 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

test('a front matter tag\'s pill carries a bullet, a body-only one does not, and both still filter', async ({ page }) => {
  await openTagTable(page);
  const pill = (tag) => cellFor(page, 'Tagged', 'tags').locator(`[data-tag="${tag}"]`);

  // inside the one pill, after the name — and `work`, in the body as well, is the front matter's
  expect(await pill('work').evaluate(el => el.textContent)).toBe('work •');
  expect(await pill('project').evaluate(el => el.textContent)).toBe('project •');
  expect(await pill('idea').evaluate(el => el.textContent)).toBe('idea');

  // a bulleted pill is the same filter: `work` is on Tagged alone (Other's is `workshop`)
  await pill('work').click();
  await expect(page.locator('.list-table > .note-table')).toHaveCount(1);
});

test('typing in a tags cell offers the folder\'s tags, and choosing one replaces the word typed', async ({ page }) => {
  await openTagTable(page);
  const cell = cellFor(page, 'Tagged', 'tags');
  await cell.focus();
  await page.keyboard.press('Enter');
  await expect(cell).toHaveText('work, project');

  await page.keyboard.press('End');
  await page.keyboard.type(' #wor');
  const popup = page.locator('.ac-picker-popup');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('workshop');
  // no note picker here: '[[' is not a trigger in this cell
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(popup).not.toBeVisible();
  await expect(cell).toHaveText('work, project #workshop');

  // Escape closes a popup before it closes the cell
  await page.keyboard.type(' pro');
  await expect(popup).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).not.toBeVisible();
  await expect(cell).toHaveAttribute('contenteditable', 'plaintext-only');
});

test('a press on a tag pill filters without selecting its cell, and a selected tags cell clips no pill', async ({ page }) => {
  await openTagTable(page);
  const cell = cellFor(page, 'Tagged', 'tags');

  await cell.locator('[data-tag="idea"]').click();
  await expect(page.locator('.list-table > .note-table')).toHaveCount(1);
  await expect(cell).not.toHaveClass(/is-selected/);
  expect(await cell.evaluate(el => el.contains(document.activeElement))).toBe(false);

  // selected from the keyboard: no strip, no ellipsis, nothing laid over the last pill
  await cell.focus();
  await expect(cell).toHaveClass(/is-selected/);
  const look = await cell.evaluate(el => ({
    overflow: getComputedStyle(el).textOverflow,
    strip: getComputedStyle(el, '::after').content,
  }));
  expect(look).toEqual({ overflow: 'clip', strip: 'none' });
});
