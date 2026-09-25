const { test, expect } = require('@playwright/test');
const { loadFolder, setupMockCellWritingFolder } = require('../helpers');

/**
 * The table around a cell edit, rather than the bytes it writes — which are
 * tests/1-data/49-table-cell-writing.spec.js's, and where these tests lived until level 1 outgrew its
 * time budget. Two things: an edited row waits, outlined, until focus leaves it
 * (ui-functions-table/pending-row-move.js), and the selection follows focus and the arrow keys.
 */

async function openTable(page, extra) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setupMockCellWritingFolder(page, extra);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const rowFor = (page, title) => page.locator('.note-table').filter({ hasText: title }).first();
const cellFor = (page, title, prop) => rowFor(page, title).locator(`.note-table-cell[data-prop="${prop}"]`);
const open = async (cell) => { await cell.click(); await cell.click(); };

/** Opens a cell, replaces everything in it, and leaves by clicking the searchbox, which writes. */
async function retype(page, cell, text) {
  await open(cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type(text);
  await page.locator('#searchbox').click();
}

/** The cell a page's focus is in, as "title/property", or what else has focus. */
const focusedCell = (page) => page.evaluate(() => {
  const el = document.activeElement;
  const cell = el?.closest?.('.note-table-cell');
  if (!cell) return el === document.body ? 'body' : (el?.id || el?.tagName);
  const row = cell.closest('.note-table');
  return `${row.querySelector('[data-prop="title"]').textContent}/${cell.dataset.prop}`;
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

// ---------------------------------------------------------------- the selection and the arrow keys

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
