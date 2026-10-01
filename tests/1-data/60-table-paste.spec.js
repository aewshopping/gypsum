const { test, expect } = require('@playwright/test');
const { loadFolder, appModule } = require('../helpers');
const { setupPropertyFolder } = require('../fixtures/property-notes');

/**
 * plans/completed/table-range-paste.md, what reaches the disk: pasted text lands in the right key of the right
 * note, the cells that refuse are skipped in place, the journal is written before any note, and one
 * undo puts every byte back. The pasting gestures and the held rows are level 2's
 * (tests/2-behaviour/59-table-range-select.spec.js); the TSV itself is proved in node below.
 *
 * Sorted by filename, so the rows are a, b, broken, c and the columns people, status, note.
 */

/** Sets a property's type, as the type dialog does, and redraws. */
const setType = (page, property, type) => page.evaluate(async ([property, type]) => {
  const { setPropertyType } = await import('/public/js/services/property-type.js');
  const { renderFiles } = await import('/public/js/ui/ui-functions-render/a-render-all-files.js');
  setPropertyType(property, type);
  renderFiles();
}, [property, type]);

const NOTES = {
  // `people` reads as a list column, since a note holds a list there; each test says what it wants.
  'a.md': '---\nstatus: draft\npeople: [ann, bob]\nnote: x\n---\n# A\n',
  'b.md': '---\nstatus: live\nnote: y\n---\n# B\n',
  // Front matter that did not read: every cell of it is locked.
  'broken.md': '---\nstatus: old\nthis line has no colon\n---\n# Broken\n',
  'c.md': '---\nstatus: done\npeople: cat\nnote: z\n---\n# C\n',
};

async function openTable(page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await setupPropertyFolder(page, NOTES);
  await page.addInitScript(() => { window.__betweenPassesKind = 'paste'; });
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
  await page.evaluate(async () => {
    const { appState } = await import('/public/js/services/store.js');
    const { sortAppStateFiles } = await import('/public/js/services/file-object-sort.js');
    const { propertyType } = await import('/public/js/services/property-type.js');
    const { renderFiles } = await import('/public/js/ui/ui-functions-render/a-render-all-files.js');
    appState.sortState = { property: 'filename', direction: 'asc' };
    sortAppStateFiles('filename', propertyType('filename'), 'asc');
    renderFiles();
  });
}

const files = (page) => page.evaluate(() => ({ ...window.__files }));

/** The cell of a note's row, found by file name rather than by position. */
const cell = (page, filename, prop) => page.locator('.list-table > .note-table')
  .filter({ has: page.locator('.note-table-cell[data-prop="filename"]', { hasText: new RegExp(`^\\s*${filename.replace('.', '\\.')}\\s*$`) }) })
  .locator(`.note-table-cell[data-prop="${prop}"]`);

/** Focuses one cell and, given a second, makes the range between them — as a drag would. */
async function select(page, from, to) {
  await from.click();
  if (!to) return;
  const handles = [await from.elementHandle(), await to.elementHandle()];
  await page.evaluate(async ([anchor, extent]) => {
    const { extendRange } = await import('/public/js/ui/ui-functions-cell/cell-range.js');
    extendRange(anchor, extent);
  }, handles);
}

/** Ctrl+V with this text on the clipboard: the paste event, at the focused cell. */
const paste = (page, text) => page.evaluate((text) => {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
}, text);

const report = (page) => page.locator('#output-report');

test('one cell fills the range: journal first, a locked note skipped in place, one undo puts it all back', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => {
    window.__betweenPasses = () => { window.__writtenAtJournal = { ...window.__writes }; };
  });
  const original = await files(page);

  await select(page, cell(page, 'a.md', 'status'), cell(page, 'c.md', 'status'));
  await paste(page, 'wip');

  const dialog = page.locator('#modal-unsaved-warning');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#modal-unsaved-warning-text')).toContainText('Paste into 3 cells in 3 files?');
  await expect(page.locator('#modal-unsaved-warning-text')).toContainText('1 cell is locked and will be skipped.');
  await expect(page.locator('#modal-unsaved-warning-cancel')).toBeFocused();
  await page.click('#modal-unsaved-warning-proceed');

  await expect(report(page)).toContainText('pasted 3 cells, 1 locked');
  expect(await files(page)).toEqual({
    ...original,
    'a.md': '---\nstatus: wip\npeople: [ann, bob]\nnote: x\n---\n# A\n',
    'b.md': '---\nstatus: wip\nnote: y\n---\n# B\n',
    'c.md': '---\nstatus: wip\npeople: cat\nnote: z\n---\n# C\n',
  });
  // The journal was on disk before any note was written, and names the paste.
  expect(await page.evaluate(() => window.__writtenAtJournal)).toEqual({});
  const journal = await page.evaluate(() => JSON.parse(window.__saved['undo.gypsum']));
  expect(journal.undo.at(-1)).toMatchObject({ kind: 'paste', property: 'status' });
  await expect(page.locator('#table-undo-btn')).toHaveAttribute('data-tip', /status paste in 3 files/);

  // The range is still there to paste over again, and focus came back to where it was.
  await expect(page.locator('.list-table .in-range')).toHaveCount(4);
  await expect(cell(page, 'a.md', 'status')).toBeFocused();

  await page.evaluate(async () => {
    const { reverseCellEdits } = await import('/public/js/ui/ui-functions-click/undo-cell-edit.js');
    await reverseCellEdits('undo');
  });
  expect(await files(page)).toEqual(original);
});

test('a block lands from the top-left: a list written as one value, an empty field clears, a missing one is left, nothing outside the range', async ({ page }) => {
  await openTable(page);
  // A text column, so a.md's list is the wrong shape for it and takes no caret — but a paste writes it.
  await setType(page, 'people', 'string');
  const original = await files(page);

  await select(page, cell(page, 'a.md', 'people'), cell(page, 'c.md', 'note'));
  // Windows line endings, as Excel writes them; a fifth row the range does not reach.
  await paste(page, 'p1\ts1\tn1\r\n\t\r\nx\ty\tz\r\np3\r\nbeyond\tbeyond\tbeyond\r\n');

  // a.md's people holds a list in a column of single values, so it changes shape.
  await expect(page.locator('#modal-unsaved-warning-text')).toContainText('Paste into 5 cells in 3 files?');
  await expect(page.locator('#modal-unsaved-warning-text')).toContainText("1 cell holds a list where the column holds one value, or the reverse");
  await expect(page.locator('#modal-unsaved-warning-text')).toContainText('3 cells are locked');
  await page.click('#modal-unsaved-warning-proceed');

  await expect(report(page)).toContainText('pasted 5 cells, 3 locked');
  await expect(report(page)).not.toContainText("didn't fit");
  expect(await files(page)).toEqual({
    ...original,
    'a.md': '---\nstatus: s1\npeople: p1\nnote: n1\n---\n# A\n',
    // An empty field clears status, key and all; the missing note field leaves y alone.
    'b.md': '---\nnote: y\n---\n# B\n',
    'c.md': '---\nstatus: done\npeople: p3\nnote: z\n---\n# C\n',
  });
});

test('with no range a block grows from the focused cell, and what falls off the page is counted', async ({ page }) => {
  await openTable(page);
  const original = await files(page);

  await select(page, cell(page, 'c.md', 'status'));
  await paste(page, 'q1\tq2\tq3\nr1');
  await page.click('#modal-unsaved-warning-proceed');

  await expect(report(page)).toContainText("pasted 2 cells, 2 didn't fit");
  expect(await files(page)).toEqual({
    ...original,
    'c.md': '---\nstatus: q1\npeople: cat\nnote: q2\n---\n# C\n',
  });
});

test('one cell goes straight through, and a list column takes it as a list — over a single value too', async ({ page }) => {
  await openTable(page);
  await setType(page, 'people', 'array');

  await select(page, cell(page, 'a.md', 'people'));
  await paste(page, 'zed');
  await expect(report(page)).toContainText('pasted 1 cell');
  await expect(page.locator('#modal-unsaved-warning')).toBeHidden();

  await select(page, cell(page, 'c.md', 'people'));
  await paste(page, 'dan, eve');
  await expect(report(page)).toContainText('pasted 1 cell');

  const after = await files(page);
  expect(after['a.md']).toBe('---\nstatus: draft\npeople: [zed]\nnote: x\n---\n# A\n');
  // A single value had no list style to copy, so the list is written in the one chosen for it.
  expect(after['c.md']).toBe('---\nstatus: done\npeople:\n  - dan\n  - eve\nnote: z\n---\n# C\n');
});

test('cancelling writes nothing, and nor does a journal that could not be saved', async ({ page }) => {
  await openTable(page);
  const original = await files(page);

  await select(page, cell(page, 'a.md', 'note'), cell(page, 'b.md', 'note'));
  await paste(page, 'gone');
  await page.click('#modal-unsaved-warning-cancel');
  await expect(page.locator('#modal-unsaved-warning')).toBeHidden();
  expect(await files(page)).toEqual(original);
  // Cancelling leaves the range where it was.
  await expect(page.locator('.list-table .in-range')).toHaveCount(2);

  await page.evaluate(() => { window.__betweenPasses = () => { throw new Error('disk full'); }; });
  await paste(page, 'gone');
  await page.click('#modal-unsaved-warning-proceed');
  await expect(report(page)).toContainText('the undo history could not be saved, so nothing was pasted');
  expect(await files(page)).toEqual(original);
  expect(await page.evaluate(() => Object.keys(window.__writes))).toEqual([]);
});

test('the TSV parser undoes what copy writes, and reads any line ending', async () => {
  const { parseTsv, tsvField } = await appModule('services/tsv.js');

  const values = ['a\tb', 'two\nlines', 'say "hi"', 'plain', ''];
  expect(parseTsv(values.map(tsvField).join('\t'))).toEqual([values]);

  expect(parseTsv('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  expect(parseTsv('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  expect(parseTsv('a\rb\r')).toEqual([['a'], ['b']]);
  expect(parseTsv('"x\r\ny"\tz\n')).toEqual([['x\r\ny', 'z']]);
  // Rows are never padded: a missing field is absent, an empty one is ''.
  expect(parseTsv('a\tb\nc')).toEqual([['a', 'b'], ['c']]);
  expect(parseTsv('a\t\tc\n\t')).toEqual([['a', '', 'c'], ['', '']]);
  // A quote that never closes was never a quoted field.
  expect(parseTsv('"open')).toEqual([['"open']]);
  expect(parseTsv('\r\n')).toEqual([['']]);
});
