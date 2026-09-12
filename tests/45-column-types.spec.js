const { test, expect } = require('@playwright/test');
const { loadFolder } = require('./helpers');

// Four front matter keys the app knows nothing about, chosen for what they catch:
// `published` and `revisions` hold false and 0, which the cell renderer used to throw away;
// `due` holds a real date in one note and prose in the other, which is what a date column has to
// survive; `people` is a list, so it exercises the search setting. The tags are a pair where one
// name contains the other, which is the case a tag pill must not widen.
async function setupFiles(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const mk = (n, c) => ({ kind: 'file', name: n,
        getFile: async () => ({ name: n, size: c.length, lastModified: Date.now(), text: async () => c }) });
      return { kind: 'directory', name: 'root', values: async function* () {
        yield mk('a.md', '---\npublished: false\nrevisions: 0\ndue: 2026-03-01\npeople:\n  - John Smith\n---\n# Alpha\n\n#work/planning');
        yield mk('b.md', '---\npublished: true\nrevisions: 12\ndue: quite soon\npeople:\n  - Jane Doe\n---\n# Beta\n\n#work/category');
        yield mk('c.md', '# Gamma\n\n#work/cat');
      } };
    };
  });
}

async function openTable(page, width = 1200) {
  await page.setViewportSize({ width, height: 900 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const rowFor = (page, title) => page.locator('.note-table').filter({ hasText: title }).first();
const pickerRow = (page, property) => page.locator(`.info-modal-row[data-property="${property}"]`);
const header = (page, property) => page.locator(`.note-table-cell-header[data-property="${property}"]`);

const typeDialog = page => page.locator('#modal-column-type');
const typeOption = (page, value) => typeDialog(page).locator(`[data-action="column-type-set"][data-value="${value}"]`);
const searchOption = (page, value) => typeDialog(page).locator(`[data-action="column-search-type-set"][data-value="${value}"]`);

async function openPicker(page) {
  await page.click('[data-action="open-column-picker"]');
  await expect(page.locator('#modal-columns')).toBeVisible();
}

async function closePicker(page) {
  await page.click('[data-action="close-column-picker"]');
  await expect(page.locator('#modal-columns')).not.toBeVisible();
}

// Two clicks: the first selects the column, the second opens its menu.
async function openColumnMenu(page, property) {
  await header(page, property).click();
  await header(page, property).click();
  await expect(page.locator('#column-menu')).toBeVisible();
}

// The renderer's fallback branch was `value || ''`, and in JavaScript both of these count as
// empty to ||. A note said `published: false` and its cell said nothing at all.
test('a front matter key holding false or 0 reaches its cell', async ({ page }) => {
  await openTable(page);
  await expect(rowFor(page, 'Alpha')).toContainText('false');
  await expect(rowFor(page, 'Alpha')).toContainText('0');
  await expect(rowFor(page, 'Beta')).toContainText('true');
  await expect(rowFor(page, 'Beta')).toContainText('12');
});

// Every row gets the glyph, with no exceptions: a type change never writes a file, so nothing can
// be damaged by setting one on a column where it means nothing.
test('every picker row carries a type glyph, and it says what the column is', async ({ page }) => {
  await openTable(page);
  await openPicker(page);

  const rows = page.locator('#column-picker-list .info-modal-row');
  await expect(rows.locator('.column-picker-type')).toHaveCount(await rows.count());

  await expect(pickerRow(page, 'due').locator('.column-picker-type')).toHaveAttribute('data-tip', 'text');
  // A column the app fills in says so, and still names the type underneath, since that is what it
  // sorts by.
  await expect(pickerRow(page, 'lastModified').locator('.column-picker-type'))
    .toHaveAttribute('data-tip', 'info — date, filled in by the app');
  // A list says how it is searched too, since that is the only place the setting is visible.
  await expect(pickerRow(page, 'people').locator('.column-picker-type')).toHaveAttribute('data-tip', 'list, search text');
  await expect(pickerRow(page, 'tags').locator('.column-picker-type')).toHaveAttribute('data-tip', 'list, search exact match');
});

// The table header says what a column holds too, so the two places agree without opening anything.
// Asserted as agreement rather than against a list of expected glyphs, so it keeps its meaning
// whatever a column's glyph turns out to be — the info columns included.
test('the table header carries the same glyph as the picker', async ({ page }) => {
  await openTable(page);
  await openPicker(page);

  for (const property of ['internalId', 'filename', 'title', 'tags', 'lastModified', 'sizeInBytes']) {
    const inPicker = await pickerRow(page, property).locator('.column-picker-type use').getAttribute('href');
    const inHeader = await header(page, property).locator('.type-glyph use').getAttribute('href');
    expect(inHeader, `${property} disagrees between header and picker`).toBe(inPicker);
  }
});

// The chevron used to be hidden with visibility, which reserved its width on every column that was
// not the sorted one. With the glyph beside it that was enough to push "file" into reading as an
// ellipsis, and to clip the longest heading the schema ships.
//
// Only the app's own columns are checked. A front matter key the app has never heard of gets the
// default width, which a long name has always overflowed — that is not this glyph's doing.
test('the schema\'s own column headings are not clipped by the glyph beside them', async ({ page }) => {
  await openTable(page);
  const clipped = await page.evaluate(() => ['internalId', 'filename', 'title', 'tags', 'lastModified', 'sizeInBytes']
      .map(name => document.querySelector(`.note-table-cell-header[data-property="${name}"] .header-label`))
      .filter(label => label && label.scrollWidth > label.clientWidth + 1)
      .map(label => label.textContent));
  expect(clipped).toEqual([]);
});

test('the glyph is drawn for the type, and follows a change', async ({ page }) => {
  await openTable(page);
  await openPicker(page);

  // Columns whose type is the user's to set. The app's own are covered by the info tests below.
  const glyphHref = property => pickerRow(page, property).locator('.column-picker-type use');
  await expect(glyphHref('due')).toHaveAttribute('href', '#icon-type-string');
  await expect(glyphHref('tags')).toHaveAttribute('href', '#icon-type-array');

  await pickerRow(page, 'due').locator('.column-picker-type').click();
  await typeOption(page, 'number').click();
  await expect(glyphHref('due')).toHaveAttribute('href', '#icon-type-number');
  await typeOption(page, 'date').click();
  await expect(glyphHref('due')).toHaveAttribute('href', '#icon-type-date');

  // and it survives the row being redrawn from the layout
  await page.keyboard.press('Escape');
  await closePicker(page);
  await openPicker(page);
  await expect(glyphHref('due')).toHaveAttribute('href', '#icon-type-date');
});

// The two halves of that are deliberately on different clocks, and both matter: the row answers
// straight away so the choice is visibly taken, and the layout is not touched until the picker
// closes so reset can still undo it. Read without retrying, because "eventually" would pass here
// even if the glyph were only redrawn on close.
test('the glyph changes as soon as the type is picked, before the layout is touched', async ({ page }) => {
  await openTable(page);
  await openPicker(page);

  const glyph = pickerRow(page, 'people').locator('.column-picker-type');
  await glyph.click();
  await typeOption(page, 'date').click();

  expect(await glyph.locator('use').getAttribute('href')).toBe('#icon-type-date');
  expect(await glyph.getAttribute('data-tip')).toBe('date');

  const stored = await page.evaluate(async () => {
    const s = await import('/public/js/services/store.js');
    return s.TABLE_VIEW_COLUMNS.columnLayout.get('people')?.type ?? null;
  });
  expect(stored).toBeNull();

  // Changing how a list is searched moves the tooltip and leaves the glyph alone, since the column
  // is still a list.
  await typeOption(page, 'array').click();
  await searchOption(page, 'array').click();
  expect(await glyph.locator('use').getAttribute('href')).toBe('#icon-type-array');
  expect(await glyph.getAttribute('data-tip')).toBe('list, search exact match');
});

// A dialog rather than a menu, so that it can be reached from a header cell that opens one menu
// only, and so that it is not inert when reached from inside the column picker.
test('the type dialog opens over the picker without closing it, and names its column', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await pickerRow(page, 'people').locator('.column-picker-type').click();

  await expect(typeDialog(page)).toBeVisible();
  await expect(page.locator('#column-type-title')).toHaveText("'people' type");
  await expect(page.locator('#modal-columns')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(typeDialog(page)).not.toBeVisible();
  await expect(page.locator('#modal-columns')).toBeVisible();   // only the inner one closed
});

// The options were <select>s once, and a native dropdown is painted outside its container: choosing
// one counted as a click outside and dismissed what held it, so nothing could be picked at all.
test('the options in the type dialog can actually be clicked', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await pickerRow(page, 'due').locator('.column-picker-type').click();

  await typeOption(page, 'number').click();
  expect(await pickerRow(page, 'due').getAttribute('data-type')).toBe('number');
  await expect(typeDialog(page)).toBeVisible();   // it holds two settings, so it stays up
});

// Each type row carries the same glyph the header and the picker show for it, which is what lets
// the list stand without a heading over it.
test('each type row in the dialog is drawn with its own glyph', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await pickerRow(page, 'due').locator('.column-picker-type').click();

  for (const value of ['string', 'number', 'date', 'array']) {
    await expect(typeOption(page, value).locator('use')).toHaveAttribute('href', `#icon-type-${value}`);
  }
  // The search rows are subordinate to the list row, not types of their own.
  await expect(searchOption(page, 'string').locator('use')).toHaveCount(0);
});

// Both lists mark what the column is on, the way the layouts modal marks the layout in use.
test('the current choice is marked in both lists', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await pickerRow(page, 'people').locator('.column-picker-type').click();

  await expect(typeOption(page, 'array')).toHaveAttribute('aria-current', 'true');
  await expect(typeOption(page, 'date')).toHaveAttribute('aria-current', 'false');
  await expect(searchOption(page, 'string')).toHaveAttribute('aria-current', 'true');
  await expect(searchOption(page, 'array')).toHaveAttribute('aria-current', 'false');

  await searchOption(page, 'array').click();
  await expect(searchOption(page, 'array')).toHaveAttribute('aria-current', 'true');
  await expect(searchOption(page, 'string')).toHaveAttribute('aria-current', 'false');
});

// "Search list as" has no meaning off a list, since nothing else in the app searches by whole
// values. Disabled rather than hidden, so the dialog keeps one shape as the type is changed.
test('the search options are only available for a list column', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await pickerRow(page, 'due').locator('.column-picker-type').click();

  await expect(searchOption(page, 'array')).toBeDisabled();
  await typeOption(page, 'array').click();
  await expect(searchOption(page, 'array')).toBeEnabled();
  await typeOption(page, 'date').click();
  await expect(searchOption(page, 'array')).toBeDisabled();
});

test('a type set in the picker reaches the table', async ({ page }) => {
  await openTable(page);
  await expect(rowFor(page, 'Alpha')).toContainText('2026-03-01');   // text, as loaded

  await openPicker(page);
  await pickerRow(page, 'due').locator('.column-picker-type').click();
  await typeOption(page, 'date').click();
  await page.keyboard.press('Escape');
  await closePicker(page);

  // The text does not change, and that is the point: a date cell shows the note's own words, so
  // there is no rendering of it to edit by mistake. What proves the type reached the rows is the
  // cell that can no longer be read as one.
  await expect(rowFor(page, 'Alpha')).toContainText('2026-03-01');
  await expect(rowFor(page, 'Beta')).toContainText('quite soon');
  await expect(rowFor(page, 'Beta').locator('[data-prop="due"]'))
    .toHaveAttribute('data-mismatch', 'unreadable');
});

// The same dialog, reached from the other place. The header cell is the host here, so the glyph in
// the header is what redraws, and the layout is written when the dialog closes.
test('a type set from the column menu reaches the table', async ({ page }) => {
  await openTable(page, 1900);   // wide enough that the last column's header is on screen
  await openColumnMenu(page, 'due');
  await page.click('[data-action="column-change-type"]');

  await expect(typeDialog(page)).toBeVisible();
  await expect(page.locator('#column-menu')).not.toBeVisible();   // the header opened one menu only
  await expect(page.locator('#column-type-title')).toHaveText("'due' type");

  await typeOption(page, 'date').click();
  expect(await header(page, 'due').locator('.type-glyph use').getAttribute('href')).toBe('#icon-type-date');

  await page.click('[data-action="close-column-type"]');
  await expect(typeDialog(page)).not.toBeVisible();
  await expect(rowFor(page, 'Beta').locator('[data-prop="due"]'))
    .toHaveAttribute('data-mismatch', 'unreadable');
  await expect(header(page, 'due').locator('.type-glyph use')).toHaveAttribute('href', '#icon-type-date');
});

// The same path the picker's toggle takes, minus the deferral: a single menu item has nothing to
// hold back.
test('hide column removes it, and the picker agrees', async ({ page }) => {
  await openTable(page, 1900);   // wide enough that the last column's header is on screen
  const before = await page.locator('.note-table-cell-header').count();

  await openColumnMenu(page, 'due');
  await page.click('[data-action="column-hide"]');
  await expect(page.locator('.note-table-cell-header')).toHaveCount(before - 1);
  await expect(header(page, 'due')).toHaveCount(0);

  await openPicker(page);
  await expect(pickerRow(page, 'due').locator('input.toggle')).not.toBeChecked();
});

// The floor the column picker enforces, enforced here too: an empty column set makes --grid-columns
// an empty string and draws a broken table rather than raising anything.
test('the file column cannot be hidden', async ({ page }) => {
  await openTable(page);
  await openColumnMenu(page, 'internalId');
  await expect(page.locator('[data-action="column-hide"]')).toBeDisabled();
});

// A type is the user's choice, so any column can end up holding anything. Showing the file's own
// words is what lets someone see what is there and work out which type it wanted, which a blank
// cell or the string "[object Map]" takes away. The marker is on the cell rather than left to be
// inferred from the text, because a matching text cell and a mismatched one read the same.
test('a value that cannot be drawn as its column type shows its text, marked', async ({ page }) => {
  await openTable(page);

  const cell = property => rowFor(page, 'Alpha').locator(`.note-table-cell[data-prop="${property}"]`);
  await expect(cell('tags')).not.toHaveAttribute('data-mismatch', /.*/);

  // a list column set to a single-value type
  await openPicker(page);
  await pickerRow(page, 'tags').locator('.column-picker-type').click();
  await typeOption(page, 'date').click();
  await page.keyboard.press('Escape');
  await closePicker(page);

  await expect(cell('tags')).toHaveAttribute('data-mismatch', 'shape');
  await expect(cell('tags')).toContainText('planning');   // the tag names, not "[object Map]"
  await expect(cell('tags')).toHaveAttribute('data-tip', /change this column's type/);

  // and a single value in a column set to list
  await openPicker(page);
  await pickerRow(page, 'title').locator('.column-picker-type').click();
  await typeOption(page, 'array').click();
  await page.keyboard.press('Escape');
  await closePicker(page);

  await expect(cell('title')).toHaveAttribute('data-mismatch', 'shape');
  await expect(cell('title')).toContainText('Alpha');     // not blank
});

// The other kind: the right shape, but text that cannot be read as the type. The column is fine and
// the note is wrong, so it is told apart from a shape mismatch and points at the other fix.
test('a value that cannot be read as its type says so, and points at the note', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await pickerRow(page, 'due').locator('.column-picker-type').click();
  await typeOption(page, 'date').click();
  await page.keyboard.press('Escape');
  await closePicker(page);

  const dueCell = title => rowFor(page, title).locator('.note-table-cell[data-prop="due"]');

  // a real date is not flagged
  await expect(dueCell('Alpha')).not.toHaveAttribute('data-mismatch', /.*/);
  await expect(dueCell('Alpha')).toContainText('2026-03-01'); // the file's own words: '3/1/2026' reads as 3 January to half the world

  // prose in a date column is
  await expect(dueCell('Beta')).toHaveAttribute('data-mismatch', 'unreadable');
  await expect(dueCell('Beta')).toContainText('quite soon');
  await expect(dueCell('Beta')).toHaveAttribute('data-tip', /fix this in the note/);
});

// Editing a value the column cannot describe risks writing back the wrong shape, so a mismatched
// cell opens but takes no caret. It says why in the cell as well as in its tooltip, because a
// tooltip needs a pointer and half the people using this have a finger.
test('a mismatched cell cannot be edited, and says why when opened', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await pickerRow(page, 'due').locator('.column-picker-type').click();
  await typeOption(page, 'date').click();
  await page.keyboard.press('Escape');
  await closePicker(page);

  const bad = rowFor(page, 'Beta').locator('.note-table-cell[data-prop="due"]');
  await bad.click();
  await bad.click();

  await expect(bad).toHaveClass(/is-expanded/);                    // it opens, so the value is readable
  await expect(bad).not.toHaveAttribute('contenteditable', /.*/);  // but takes no caret
  await expect(bad.locator('.cell-mismatch-note')).toHaveText(/fix this in the note/);

  // a front matter cell whose value does fit is still editable, and carries no note
  await page.keyboard.press('Escape');
  const ok = rowFor(page, 'Alpha').locator('.note-table-cell[data-prop="published"]');
  await ok.click();
  await ok.click();
  await expect(ok).toHaveAttribute('contenteditable', 'plaintext-only');
  await expect(ok.locator('.cell-mismatch-note')).toHaveCount(0);
});

// Searching a list as text ran String() over the tag Map and searched "[object Map]", so it matched
// nothing, ever. Setting tags to "search text" was a silent way to break tag search.
test('a list searched as text reads its items', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await pickerRow(page, 'tags').locator('.column-picker-type').click();
  await searchOption(page, 'string').click();
  await page.keyboard.press('Escape');
  await closePicker(page);

  // "cat" and "category" are both in the folder, and contains-text finds both
  await page.fill('#searchbox', 'tags:cat');
  await page.press('#searchbox', 'Enter');
  await expect(page.locator('.note-table')).toHaveCount(2);
});

// The file column's cell is a link that opens the note, not the value of internalId. Sorting it,
// searching it and giving it a type would all be about an id nobody is ever shown.
test('the file column offers no type, no sort and no search', async ({ page }) => {
  await openTable(page);
  await openColumnMenu(page, 'internalId');
  for (const action of ['column-sort-asc', 'column-sort-desc', 'column-search', 'column-change-type', 'column-hide']) {
    await expect(page.locator(`[data-action="${action}"]`)).toBeDisabled();
  }
  await page.keyboard.press('Escape');

  // nor from the sort dropdown
  await expect(page.locator('[data-action="sort-select"] option[value="internalId"]')).toHaveCount(0);

  // nor by typing it into the search box, where it behaves like a property the folder lacks
  await page.fill('#searchbox', 'internalId:a.md');
  await page.press('#searchbox', 'Enter');
  await expect(page.locator('.filter-pill')).toHaveCount(0);

  // and its picker row has no type to set
  await openPicker(page);
  await expect(pickerRow(page, 'internalId').locator('.column-picker-type')).toBeDisabled();
});

// Four columns the app fills in itself rather than reading from a note. They wear their own glyph,
// no type can be chosen for them, and their cells take no caret. filename and filepath are
// deliberately not among them: renaming and moving from the table are both wanted later.
test('the columns the app fills in wear the info glyph', async ({ page }) => {
  await openTable(page);
  const glyph = property => header(page, property).locator('.type-glyph use');

  await expect(glyph('internalId')).toHaveAttribute('href', '#icon-type-info');
  await expect(glyph('sizeInBytes')).toHaveAttribute('href', '#icon-type-info');
  await expect(glyph('lastModified')).toHaveAttribute('href', '#icon-type-info');

  await expect(glyph('filename')).toHaveAttribute('href', '#icon-type-string');
  await expect(glyph('tags')).toHaveAttribute('href', '#icon-type-array');
});

// The whole reason info sits beside a column's type rather than replacing it. Last modified is also
// the default sort column, so getting this wrong would break the table's opening state.
test('an info column keeps the type underneath, and still renders and sorts by it', async ({ page }) => {
  await openTable(page);

  const resolved = await page.evaluate(async () => {
    const m = await import('/public/js/services/property-type.js');
    return { modified: m.propertyType('lastModified'), size: m.propertyType('sizeInBytes') };
  });
  expect(resolved).toEqual({ modified: 'date', size: 'number' });

  // a date, not a raw Date object printed out
  await expect(rowFor(page, 'Alpha').locator('.note-table-cell[data-prop="lastModified"]'))
    .toHaveText(/^\d+\/\d+\/\d+$/);

  // and both are still offered in the sort dropdown
  await expect(page.locator('[data-action="sort-select"] option[value="sizeInBytes"]')).toHaveCount(1);
  await expect(page.locator('[data-action="sort-select"] option[value="lastModified"]')).toHaveCount(1);
});

// The app owns these columns, so a hand-edited layout file cannot quietly change what one sorts by.
test('a layout file cannot set a type on an info column', async ({ page }) => {
  await openTable(page);
  const after = await page.evaluate(async () => {
    const s = await import('/public/js/services/store.js');
    const m = await import('/public/js/services/property-type.js');
    s.TABLE_VIEW_COLUMNS.columnLayout.get('lastModified').type = 'number';
    return m.propertyType('lastModified');
  });
  expect(after).toBe('date');
});

// It loses its type and nothing else. Sorting by size or by last modified is the point of having
// them, so those stay live — unlike the file column, which is refused all three.
test('an info column offers no type, but still sorts and searches', async ({ page }) => {
  await openTable(page);
  await openColumnMenu(page, 'sizeInBytes');

  await expect(page.locator('[data-action="column-change-type"]')).toBeDisabled();
  await expect(page.locator('[data-action="column-sort-asc"]')).toBeEnabled();
  await expect(page.locator('[data-action="column-search"]')).toBeEnabled();
  await expect(page.locator('[data-action="column-hide"]')).toBeEnabled();
  await page.keyboard.press('Escape');

  await openPicker(page);
  await expect(pickerRow(page, 'sizeInBytes').locator('.column-picker-type')).toBeDisabled();
  await expect(pickerRow(page, 'sizeInBytes').locator('.column-picker-type'))
    .toHaveAttribute('data-tip', 'info — number, filled in by the app');
  // the type underneath is still named, since it is still what the column sorts by
  await expect(pickerRow(page, 'title').locator('.column-picker-type')).toBeEnabled();
});

// Quietly, unlike a mismatch: nothing is wrong and there is nothing to do about it, so a sentence
// on every size cell would be noise. The header's glyph is what says it.
test('an info cell opens but takes no caret, and says nothing', async ({ page }) => {
  await openTable(page);
  const cell = rowFor(page, 'Alpha').locator('.note-table-cell[data-prop="sizeInBytes"]');

  await cell.click();
  await cell.click();
  await expect(cell).toHaveClass(/is-expanded/);
  await expect(cell).not.toHaveAttribute('contenteditable', /.*/);
  await expect(cell.locator('.cell-mismatch-note')).toHaveCount(0);
});

// A tag pill means that one tag. Tags is the only property pinned to whole-item matching, and this
// is why: "cat" and "category" are both in the folder.
test('a tag pill still filters to that tag alone', async ({ page }) => {
  await openTable(page);
  await page.locator('.note-table .tag', { hasText: /^cat$/ }).first().click();
  await expect(page.locator('.note-table')).toHaveCount(1);
  await expect(page.locator('.note-table')).toContainText('Gamma');
});

// Contains text is the default for a list, which is what people and internalLink used a hidden
// search_type to get before anyone could set it.
test('a list column is searched by part of its text', async ({ page }) => {
  await openTable(page);
  await page.fill('#searchbox', 'people:smi');
  await page.press('#searchbox', 'Enter');
  await expect(page.locator('.note-table')).toHaveCount(1);
  await expect(page.locator('.note-table')).toContainText('Alpha');
});
