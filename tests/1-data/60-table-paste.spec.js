const { test, expect } = require('@playwright/test');
const { loadFolder, appModule, chooseView } = require('../helpers');
const { setupPropertyFolder } = require('../fixtures/property-notes');

/**
 * plans/completed/table-range-paste.md, what reaches the disk.
 *
 * **The bytes are proved in node**, where a case costs microseconds: the TSV, and what one note
 * becomes when the plan pass is replayed by the write pass — shape changes, a kept comment, a new
 * key, a cleared one — and that undo restores it. Only what needs the app is in a browser, in two
 * page loads: which notes and keys the pasted fields land on, and that nothing is written without a
 * journal on disk first. The gestures, the dialog's wording and the held rows are level 2's
 * (tests/2-behaviour/59-table-range-select.spec.js); the type conversion is a cell edit's, proved by
 * 49-table-cell-writing.spec.js.
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
  await chooseView(page, 'table');
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

test('the write pass replays the plan byte for byte, shape changes included, and undo restores the note', async () => {
  const { planFileEdits } = await appModule('editing/plan-file-edits.js');
  const { toYamlText } = await appModule('services/file-parsing/yaml-value-write.js');
  const { splitFlowItems } = await appModule('services/file-parsing/flow-list.js');

  // What toRawEdits sends for a pasted cell, without the store it reads the type from.
  const planned = (text, property, type, pasted) => planFileEdits(text, [{
    internalId: 'n', property,
    raw: (shape) => toYamlText(pasted, type, shape),
    ...(type === 'array' && { items: splitFlowItems(pasted) }),
  }], 'n');
  // What paste-cells.js's second pass sends: the plan's own result, checked against what it saw.
  const replay = (text, records) => planFileEdits(text, records.map(record => ({
    internalId: 'n', property: record.property, raw: record.after,
    expect: record.existed ? record.before : null,
  })), 'n');
  // What reverseBatch sends.
  const undo = (text, records) => planFileEdits(text, records.map(edit => ({
    internalId: 'n', property: edit.property, raw: edit.before, expect: edit.after,
    anchor: edit.anchor, gap: edit.gap, keepKey: edit.before === '' && edit.existed,
  })), 'n');

  const cases = [
    ['a flow list into a single-value column', '---\nstatus: draft\npeople: [ann, bob]\nnote: x\n---\n# A\n',
      'people', 'string', 'p1', '---\nstatus: draft\npeople: p1\nnote: x\n---\n# A\n'],
    ['a block list into a single-value column', '---\npeople:\n  - ann\n  - bob\nnote: x\n---\n',
      'people', 'string', 'p1', '---\npeople: p1\nnote: x\n---\n'],
    ['a single value into a list column', '---\npeople: cat\nnote: z\n---\n',
      'people', 'array', 'dan, eve', '---\npeople:\n  - dan\n  - eve\nnote: z\n---\n'],
    ['one item changed, a comment between the items kept', '---\npeople:\n  - ann\n  # chair\n  - bob\n---\n',
      'people', 'array', 'ann, cat', '---\npeople:\n  - ann\n  # chair\n  - cat\n---\n'],
    ['an empty field clears the key', '---\nstatus: live\nnote: y\n---\n# B\n',
      'status', 'string', '', '---\nnote: y\n---\n# B\n'],
    ['a key the note lacks is appended', '---\nnote: y\n---\n',
      'status', 'string', 'new', '---\nnote: y\nstatus: new\n---\n'],
    // Undo takes the key out but not the block made to hold it — an undo's answer for any edit, not
    // only a paste's. Nothing is lost; an empty block is left. Held here so a change to it is seen.
    ['a note with no block is given one', '# C\n',
      'status', 'string', 'new', '---\nstatus: new\n---\n\n# C\n', '---\n---\n\n# C\n'],
    ['a CRLF note keeps its line endings', '---\r\nstatus: draft\r\nnote: x\r\n---\r\n',
      'status', 'string', 'done', '---\r\nstatus: done\r\nnote: x\r\n---\r\n'],
  ];
  for (const [name, text, property, type, pasted, expected, undone = text] of cases) {
    const plan = planned(text, property, type, pasted);
    expect(plan?.updated, name).toBe(expected);
    const written = replay(text, plan.records);
    expect(written?.updated, `${name}, replayed`).toBe(expected);
    expect(undo(written.updated, written.records)?.updated, `${name}, undone`).toBe(undone);
  }

  // A note changed between the passes is refused, and so is a key that appeared meanwhile.
  const plan = planned('---\nstatus: draft\n---\n', 'status', 'string', 'wip');
  expect(replay('---\nstatus: done\n---\n', plan.records)).toBeNull();
  const added = planned('---\nnote: y\n---\n', 'status', 'string', 'new');
  expect(replay('---\nnote: y\nstatus: other\n---\n', added.records)).toBeNull();
  // A locked note gives the plan nothing to write.
  expect(planned('---\nstatus: old\nthis line has no colon\n---\n', 'status', 'string', 'x')).toBeNull();
});

test('a block lands from the top-left, journal first: refusals in place, a short row leaves cells, nothing past the range, one undo', async ({ page }) => {
  await openTable(page);
  // A text column, so a.md's list is the wrong shape for it — a paste writes over it anyway.
  await setType(page, 'people', 'string');
  await page.evaluate(() => {
    window.__betweenPasses = () => { window.__writtenAtJournal = { ...window.__writes }; };
  });
  const original = await files(page);

  await select(page, cell(page, 'a.md', 'people'), cell(page, 'c.md', 'note'));
  // A fifth row the range does not reach.
  await paste(page, 'p1\ts1\tn1\n\t\nx\ty\tz\np3\nbeyond\tbeyond\tbeyond\n');
  await page.click('#modal-unsaved-warning-proceed');

  await expect(report(page)).toContainText('pasted 5 cells, 3 locked');
  expect(await files(page)).toEqual({
    ...original,
    'a.md': '---\nstatus: s1\npeople: p1\nnote: n1\n---\n# A\n',
    // An empty field clears status, key and all; the missing note field leaves y alone.
    'b.md': '---\nnote: y\n---\n# B\n',
    'c.md': '---\nstatus: done\npeople: p3\nnote: z\n---\n# C\n',
  });
  // The journal was on disk before any note was written.
  expect(await page.evaluate(() => window.__writtenAtJournal)).toEqual({});
  const journal = await page.evaluate(() => JSON.parse(window.__saved['undo.gypsum']));
  expect(journal.undo.at(-1)).toMatchObject({ kind: 'paste', property: null });

  await page.evaluate(async () => {
    const { reverseCellEdits } = await import('/public/js/ui/ui-functions-click/undo-cell-edit.js');
    await reverseCellEdits('undo');
  });
  expect(await files(page)).toEqual(original);
});

test('cancelling or a journal that could not be saved writes nothing; one cell fills a range; no range grows to the page edge', async ({ page }) => {
  await openTable(page);
  const original = await files(page);

  await select(page, cell(page, 'a.md', 'status'), cell(page, 'c.md', 'status'));
  await paste(page, 'wip');
  await page.click('#modal-unsaved-warning-cancel');
  await expect(page.locator('#modal-unsaved-warning')).toBeHidden();
  expect(await files(page)).toEqual(original);

  await page.evaluate(() => { window.__betweenPasses = () => { throw new Error('disk full'); }; });
  await paste(page, 'wip');
  await page.click('#modal-unsaved-warning-proceed');
  await expect(report(page)).toContainText('the undo history could not be saved, so nothing was pasted');
  expect(await page.evaluate(() => Object.keys(window.__writes))).toEqual([]);

  // The same paste once the journal can be written: every cell of the range but the locked note's.
  await paste(page, 'wip');
  await page.click('#modal-unsaved-warning-proceed');
  await expect(report(page)).toContainText('pasted 3 cells, 1 locked');
  const filled = {
    ...original,
    'a.md': '---\nstatus: wip\npeople: [ann, bob]\nnote: x\n---\n# A\n',
    'b.md': '---\nstatus: wip\nnote: y\n---\n# B\n',
    'c.md': '---\nstatus: wip\npeople: cat\nnote: z\n---\n# C\n',
  };
  expect(await files(page)).toEqual(filled);

  // No range: from the last row's status, q2 lands in note, the last column, and the rest fall off.
  await select(page, cell(page, 'c.md', 'status'));
  await paste(page, 'q1\tq2\tq3\nr1');
  await page.click('#modal-unsaved-warning-proceed');
  await expect(report(page)).toContainText("pasted 2 cells, 2 didn't fit");
  expect(await files(page)).toEqual({ ...filled, 'c.md': '---\nstatus: q1\npeople: cat\nnote: q2\n---\n# C\n' });
});
