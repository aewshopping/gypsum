const { test, expect } = require('@playwright/test');
const { loadFolder } = require('../helpers');

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

// A type is the user's choice, so any column can end up holding anything. Showing the file's own
// words is what lets someone see what is there and work out which type it wanted, which a blank
// cell or the string "[object Map]" takes away. The marker is on the cell rather than left to be
// inferred from the text, because a matching text cell and a mismatched one read the same.
test('a value that cannot be drawn as its column type shows its text, marked', async ({ page }) => {
  await openTable(page);

  const cell = property => rowFor(page, 'Alpha').locator(`.note-table-cell[data-prop="${property}"]`);
  await expect(cell('people')).not.toHaveAttribute('data-mismatch', /.*/);

  // a list column set to a single-value type
  await openPicker(page);
  await pickerRow(page, 'people').locator('.column-picker-type').click();
  await typeOption(page, 'date').click();
  await page.keyboard.press('Escape');
  await closePicker(page);

  await expect(cell('people')).toHaveAttribute('data-mismatch', 'shape');
  await expect(cell('people')).toContainText('John Smith');   // the names, not a blank cell
  await expect(cell('people')).toHaveAttribute('data-tip', /change this column's type/);

  // and a single value in a column set to list
  await openPicker(page);
  await pickerRow(page, 'due').locator('.column-picker-type').click();
  await typeOption(page, 'array').click();
  await page.keyboard.press('Escape');
  await closePicker(page);

  await expect(cell('due')).toHaveAttribute('data-mismatch', 'shape');
  await expect(cell('due')).toContainText('2026-03-01');      // not blank
});

/** The sentence an opened cell shows, which note-table-cell.css draws from data-tip. */
const shownSentence = cell => cell.evaluate(el => getComputedStyle(el, '::after').content);

/** Whether this cell, or anything in it, took a caret. */
const hasCaret = cell => cell.evaluate(el =>
  el.hasAttribute('contenteditable') || !!el.querySelector('[contenteditable]'));

// Committing a list into a column of single values — or the reverse — rewrites the value in the
// other shape, adding or destroying the note's brackets or its block of dashes from something that
// looked like typing over a word. So a shape the column cannot hold opens to be read and no more,
// and says why in the cell as well as in its tooltip: a tooltip needs a pointer and half the people
// using this have a finger.
test('a cell whose shape its column cannot hold takes no caret, and says why', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await pickerRow(page, 'people').locator('.column-picker-type').click();
  await typeOption(page, 'date').click();
  await page.keyboard.press('Escape');
  await closePicker(page);

  const bad = rowFor(page, 'Alpha').locator('.note-table-cell[data-prop="people"]');
  await bad.click();
  await bad.click();

  await expect(bad).toHaveClass(/is-expanded/);                    // it opens, so the value is readable
  expect(await hasCaret(bad)).toBe(false);                         // but takes no caret
  await expect(bad).toHaveClass(/is-readonly/);
  expect(await shownSentence(bad)).toMatch(/change this column's type/);

  // a front matter cell whose value does fit is still editable, and says nothing
  await page.keyboard.press('Escape');
  const ok = rowFor(page, 'Alpha').locator('.note-table-cell[data-prop="published"]');
  await ok.click();
  await ok.click();
  await expect(ok).toHaveAttribute('contenteditable', 'plaintext-only');
  expect(await shownSentence(ok)).toBe('none');
});

// The other half of the same distinction. "quite soon" in a date column is a scalar in a scalar
// column: typing over it splices exactly the span a matching cell splices, so there is no shape to
// get wrong and no reason to send someone to the note to do by hand what the cell can do. It still
// says what is wrong with the value, and still wears the marker — it just takes a caret too.
test('a value that cannot be read as its type takes a caret', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await pickerRow(page, 'due').locator('.column-picker-type').click();
  await typeOption(page, 'date').click();
  await page.keyboard.press('Escape');
  await closePicker(page);

  const bad = rowFor(page, 'Beta').locator('.note-table-cell[data-prop="due"]');
  await expect(bad).toHaveAttribute('data-mismatch', 'unreadable');

  await bad.click();
  await bad.click();

  expect(await hasCaret(bad)).toBe(true);
  await expect(bad).not.toHaveClass(/is-readonly/);
  await expect(bad).toHaveAttribute('data-mismatch', 'unreadable');   // still marked
  expect(await shownSentence(bad)).toMatch(/not a date/);             // and still says so
});

// Searching a list reads its items rather than running String() over the value. Set against people
// rather than tags, which used to serve here: the app fills tags in, so its whole-item matching is
// the app's to say and the picker will not offer to change it.
test('a list searched as text reads part of an item, and exact match does not', async ({ page }) => {
  await openTable(page);

  // "search text" is the default for a list the app knows nothing about, so part of a name hits
  await page.fill('#searchbox', 'people:Smi');
  await page.press('#searchbox', 'Enter');
  await expect(page.locator('.note-table')).toHaveCount(1);

  await openPicker(page);
  await pickerRow(page, 'people').locator('.column-picker-type').click();
  await searchOption(page, 'array').click();
  await page.keyboard.press('Escape');
  await closePicker(page);

  // switched to whole items, the same part of a name matches nothing, and the whole one still does
  await page.keyboard.press('Alt+x');
  await page.fill('#searchbox', 'people:Smi');
  await page.press('#searchbox', 'Enter');
  await expect(page.locator('.note-table')).toHaveCount(0);

  await page.keyboard.press('Alt+x');
  await page.fill('#searchbox', 'people:John Smith');
  await page.press('#searchbox', 'Enter');
  await expect(page.locator('.note-table')).toHaveCount(1);
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

// The whole reason info sits beside a column's type rather than replacing it. Last modified is also
// the default sort column, so getting this wrong would break the table's opening state.
test('an info column keeps the type underneath, and still renders and sorts by it', async ({ page }) => {
  await openTable(page);

  const resolved = await page.evaluate(async () => {
    const m = await import('/public/js/services/property-type.js');
    return { modified: m.propertyType('lastModified'), size: m.propertyType('sizeInBytes') };
  });
  expect(resolved).toEqual({ modified: 'datetime', size: 'number' });

  // a date and a time of day, not a raw Date object printed out
  await expect(rowFor(page, 'Alpha').locator('.note-table-cell[data-prop="lastModified"]'))
    .toHaveText(/^\d+\/\d+\/\d+ \d+:\d+(\s?[AP]M)?$/);

  // and both are still offered in the sort dropdown
  await expect(page.locator('[data-action="sort-select"] option[value="sizeInBytes"]')).toHaveCount(1);
  await expect(page.locator('[data-action="sort-select"] option[value="lastModified"]')).toHaveCount(1);
});

// The app owns these columns, so a hand-edited layout file cannot quietly change what one sorts by.
test('a file cannot set a type on a column the app fills in', async ({ page }) => {
  await openTable(page);
  const after = await page.evaluate(async () => {
    const s = await import('/public/js/services/store.js');
    const m = await import('/public/js/services/property-type.js');
    // Written straight into the Map, past setPropertyType, which is the most a hand-edited file
    // could ever manage.
    s.appState.propertyTypes.set('lastModified', { type: 'number' });
    s.appState.propertyTypes.set('title', { type: 'date' });
    s.appState.propertyTypes.set('tags', { search_type: 'string' });
    return {
      modified: m.propertyType('lastModified'),
      title: m.propertyType('title'),
      tagSearch: m.propertySearchType('tags'),
    };
  });
  expect(after).toEqual({ modified: 'datetime', title: 'string', tagSearch: 'array' });
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
  // A column the app fills in that is not an info column is refused too, and says who chose for it
  await expect(pickerRow(page, 'title').locator('.column-picker-type')).toBeDisabled();
  await expect(pickerRow(page, 'title').locator('.column-picker-type'))
    .toHaveAttribute('data-tip', 'text — set by the app');
  // ...while a property read from a note's front matter is the user's to set
  await expect(pickerRow(page, 'due').locator('.column-picker-type')).toBeEnabled();
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

// The types modal: the same type dialog, reached without going to table view first, and listing
// only the properties whose type is the user's to set.

const typesRow = (page, property) => page.locator(`#property-types-list .info-modal-row[data-property="${property}"]`);

async function openTypesModal(page) {
  await page.click('[data-action="toggle-file-controls"]');
  await page.click('[data-action="open-property-types"]');
  await expect(page.locator('#modal-property-types')).toBeVisible();
}

test('the types modal lists the user\'s own properties and nothing else', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await openTypesModal(page);

  await expect(page.locator('#property-types-note'))
    .toHaveText('types are used when sorting, searching, and when showing values in table view');

  for (const property of ['published', 'revisions', 'due', 'people']) {
    await expect(typesRow(page, property)).toHaveCount(1);
  }
  // Everything the app fills in itself, whether it is an info column or simply not front matter
  for (const property of ['title', 'tags', 'filename', 'lastModified', 'sizeInBytes', 'internalId']) {
    await expect(typesRow(page, property)).toHaveCount(0);
  }
});

// The point of the modal: a type set from it is the same write as one set from the picker, so it
// has to survive the modal closing and reach the table's cells.
test('a type set from the types modal sticks and reaches the table', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await openTypesModal(page);

  await typesRow(page, 'revisions').locator('.column-picker-type').click();
  await expect(typeDialog(page)).toBeVisible();
  await typeOption(page, 'number').click();
  await page.click('[data-action="close-column-type"]');
  await page.click('[data-action="close-property-types"]');
  await expect(page.locator('#modal-property-types')).not.toBeVisible();

  await openTypesModal(page);
  await expect(typesRow(page, 'revisions')).toHaveAttribute('data-type', 'number');
  await page.click('[data-action="close-property-types"]');

  // The header is the other half of it: the column now reads as a number wherever it is drawn.
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
  await expect(header(page, 'revisions').locator('.header-type-glyph use'))
    .toHaveAttribute('href', '#icon-type-number');
});

// An empty folder is the case the note exists for: nothing in the list, so the dialog has to say
// something rather than open blank.
test('the types modal explains itself when there are no user properties', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root', values: async function* () {},
    });
  });
  await page.goto('/');
  await loadFolder(page);
  await openTypesModal(page);

  await expect(page.locator('#property-types-list .info-modal-row')).toHaveCount(0);
  await expect(page.locator('#property-types-note'))
    .toHaveText("your files don't have any user properties, feel free to add some in frontmatter YAML format :-)");
});
