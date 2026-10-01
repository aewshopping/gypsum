const { test, expect } = require('@playwright/test');
const { loadFolder } = require('../helpers');
const { setupPropertyFolder } = require('../fixtures/property-notes');

// Ten notes with three short front matter values each, a date (whose editor puts focus on an input of
// its own inside the cell), and a [[link]], so a drag can start on a link.
async function openTable(page) {
  // Wide enough for every column, so no drag in these tests has to leave the window.
  await page.setViewportSize({ width: 1800, height: 800 });
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const mk = (name, content) => ({ kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }) });
      return { kind: 'directory', name: 'root', values: async function* () {
        for (let i = 1; i <= 10; i++) {
          const n = String(i).padStart(2, '0');
          yield mk(`note-${n}.md`, `---\ndate: 2026-01-${n}\ntags: [x, y]\na: a${n}\nb: b${n}\nc: c${n}\nrelated: "[[note-01.md]]"\n---\n# Note ${n}\n`);
        }
      } };
    };
  });
  // What the app puts on the clipboard, read back without clipboard permissions.
  await page.addInitScript(() => {
    const set = DataTransfer.prototype.setData;
    DataTransfer.prototype.setData = function (type, value) { window.__copied = value; return set.call(this, type, value); };
  });
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

// Rows in the order drawn, which is whatever the table is sorted by; the tests only ever ask about
// positions, so they do not depend on it.
const cellAt = (page, row, prop) =>
  page.locator('.list-table > .note-table').nth(row).locator(`.note-table-cell[data-prop="${prop}"]`);

/** Every marked cell as "row:prop" plus its edge marks, so one comparison checks the whole range. */
const marks = page => page.$$eval('.list-table .in-range', els => els.map(el => {
  const row = [...el.parentElement.parentElement.children].indexOf(el.parentElement);
  const edges = ['top', 'bottom', 'left', 'right'].filter(e => el.classList.contains(`range-${e}`));
  return `${row}:${el.dataset.prop}${edges.length ? ' ' + edges.join(',') : ''}`;
}).sort());

const focusedAt = page => page.evaluate(() => {
  const cell = document.activeElement.closest('.note-table-cell');
  return cell && `${[...cell.parentElement.parentElement.children].indexOf(cell.parentElement)}:${cell.dataset.prop}`;
});

async function drag(page, from, to, via = []) {
  const centre = async locator => { const b = await locator.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  await from.scrollIntoViewIfNeeded(); // the table scrolls sideways, and a press off its edge is not on the cell
  await page.mouse.move(...await centre(from));
  await page.mouse.down();
  for (const step of [...via, to]) await page.mouse.move(...await centre(step), { steps: 4 });
  await page.mouse.up();
}

test('a drag marks the cells between, outlines only the outside, and leaves focus where it began', async ({ page }) => {
  await openTable(page);
  await drag(page, cellAt(page, 3, 'b'), cellAt(page, 1, 'a'), [cellAt(page, 2, 'c')]);

  // Dragged up and left of where it began: the rectangle is still b-to-a by row 1-to-3.
  expect(await marks(page)).toEqual([
    '1:a top,left', '1:b top,right',
    '2:a left', '2:b right',
    '3:a bottom,left', '3:b bottom,right',
  ]);
  expect(await focusedAt(page)).toBe('3:b');
  await expect(cellAt(page, 3, 'b')).toHaveClass(/is-selected/);
  await expect(page.locator('.note-table-cell.is-expanded')).toHaveCount(0);
});

test('a press and release in one cell is still a click, and a drag that comes back opens nothing', async ({ page }) => {
  await openTable(page);
  const cell = cellAt(page, 2, 'a');

  await cell.click();
  await drag(page, cell, cell, [cellAt(page, 2, 'c')]);
  // It was already selected, so a click here would have opened it.
  await expect(page.locator('.note-table-cell.is-expanded')).toHaveCount(0);
  expect(await marks(page)).toEqual([]);

  await cell.click();
  await expect(cell).toHaveClass(/is-expanded/);
});

test('a drag begun on a [[link]] makes a range rather than dragging the link', async ({ page }) => {
  await openTable(page);
  await drag(page, cellAt(page, 1, 'related').locator('a'), cellAt(page, 2, 'related'));
  expect(await marks(page)).toEqual(['1:related top,left,right', '2:related bottom,left,right']);
});

test('Shift+arrow grows the range from where it is, across separate presses of Shift and after a drag', async ({ page }) => {
  await openTable(page);
  await cellAt(page, 1, 'a').click();

  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await marks(page)).toEqual(['1:a top,left', '1:b top,right', '2:a bottom,left', '2:b bottom,right']);

  // Shift let go of and pressed again: the same range carries on rather than starting over.
  await page.keyboard.press('Shift+ArrowRight');
  expect((await marks(page)).filter(m => m.includes('right'))).toEqual(['1:c top,right', '2:c bottom,right']);

  // To the end of the column, and back one — the far corner moves, focus never does.
  await page.keyboard.press('Control+Shift+ArrowDown');
  expect(await marks(page)).toContain('9:c bottom,right');
  await page.keyboard.press('Shift+ArrowUp');
  expect(await marks(page)).toContain('8:c bottom,right');
  expect(await focusedAt(page)).toBe('1:a');

  // After a drag, the keyboard carries on from the drag's far corner.
  await drag(page, cellAt(page, 4, 'a'), cellAt(page, 5, 'b'));
  await page.keyboard.press('Shift+ArrowDown');
  expect(await marks(page)).toContain('6:b bottom,right');
  expect(await focusedAt(page)).toBe('4:a');
});

test('a range does not wrap at the end of a row', async ({ page }) => {
  await openTable(page);
  await cellAt(page, 1, 'c').click();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  expect(await marks(page)).toEqual(['1:c top,bottom,left', '1:related top,bottom,right']);

  // And past the table's very last cell there is nothing at all.
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await cellAt(page, 9, 'related').click();
  await page.keyboard.press('Shift+ArrowRight');
  expect(await marks(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a plain arrow, Escape and a press elsewhere end the range; opening its anchor does not', async ({ page }) => {
  await openTable(page);
  // From a cell focus is not already in: a press on the focused cell is the second press, and opens it.
  const makeRange = async () => {
    await cellAt(page, 3, 'a').click();
    await cellAt(page, 1, 'a').click();
    await page.keyboard.press('Shift+ArrowDown');
    expect(await marks(page)).toHaveLength(2);
  };

  await makeRange();
  await page.keyboard.press('ArrowRight');
  expect(await marks(page)).toEqual([]);
  expect(await focusedAt(page)).toBe('1:b'); // moved from the anchor, not the far corner

  await makeRange();
  await page.keyboard.press('Escape');
  expect(await marks(page)).toEqual([]);

  await makeRange();
  await cellAt(page, 5, 'c').click();
  expect(await marks(page)).toEqual([]);

  // The open anchor is where a value for the whole range will be typed, so the range stays — and
  // Escape steps back one level at a time: the cell first, then the range.
  await makeRange();
  await page.keyboard.press('F2');
  await expect(cellAt(page, 1, 'a')).toHaveClass(/is-expanded/);
  expect(await marks(page)).toHaveLength(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.note-table-cell.is-expanded')).toHaveCount(0);
  expect(await marks(page)).toHaveLength(2);
  await page.keyboard.press('Escape');
  expect(await marks(page)).toEqual([]);
});

// The date editor moves focus onto its own input, inside the cell. That is not focus moving on, so it
// must not end the range the way a move to another cell does.
test('opening a date cell with F2 keeps the range, as any other cell does', async ({ page }) => {
  await openTable(page);
  await cellAt(page, 1, 'date').click();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('F2');
  await expect(cellAt(page, 1, 'date')).toHaveClass(/is-expanded/);
  expect(await marks(page)).toHaveLength(2);
});


const copied = page => page.evaluate(() => window.__copied ?? null);

test('Ctrl+C copies the range as TSV of what each cell shows, counting rows in the file column', async ({ page }) => {
  await openTable(page);
  await cellAt(page, 3, 'filename').click();
  await page.keyboard.press('ArrowLeft'); // onto the file column's cell, not its link
  await page.keyboard.press('Shift+ArrowDown');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Control+c');

  const [first, second] = (await copied(page)).split('\n');
  const [count, filename, , tags] = first.split('\t');
  expect(count).toBe('1');                      // the file column counts copied rows, from 1
  expect(filename).toMatch(/^note-\d\d\.md$/);
  expect(tags).toBe('x, y');                    // a list, not pills run together
  expect(second.startsWith('2\t')).toBe(true);
  await expect(page.locator('#output-report')).toContainText('copied 8 cells');
});

test('copy and paste show while a closed cell is selected, and copy with headers leaves the range', async ({ page }) => {
  await openTable(page);
  const buttons = page.locator('#range-copy-btn, #range-paste-btn');
  await expect(buttons.first()).toBeHidden();
  await expect(buttons.last()).toBeHidden();

  await cellAt(page, 1, 'a').click();
  await expect(buttons.first()).toBeVisible();
  await expect(buttons.last()).toBeVisible();

  await page.keyboard.press('Shift+ArrowRight');
  await expect(buttons.last()).toBeVisible();
  await buttons.first().click();
  await page.click('#range-copy-menu [data-headers="true"]');

  const [a, b] = [await cellAt(page, 1, 'a').textContent(), await cellAt(page, 1, 'b').textContent()];
  expect(await copied(page)).toBe(`a\tb\n${a}\t${b}`);
  expect(await marks(page)).toHaveLength(2);    // the range is still selected
  expect(await focusedAt(page)).toBe('1:a');

  // What was copied is outlined, and stays so when the selection moves on.
  const copiedCells = page.locator('.list-table .is-copied');
  await expect(copiedCells).toHaveCount(2);
  await expect(buttons.first()).toHaveAttribute('data-copied', '');
  await page.keyboard.press('ArrowDown');
  await expect(copiedCells).toHaveCount(2);

  // An open cell's copy and paste are the browser's, so neither button is offered — except that the
  // copy button stays while there is an outline to clear.
  await page.keyboard.press('F2');
  await expect(buttons.last()).toBeHidden();
  await expect(buttons.first()).toBeVisible();
  await page.keyboard.press('Escape');

  // Clearing takes the outline off and empties the clipboard.
  await buttons.first().click();
  await page.click('#range-copy-menu [data-action="range-copy-clear"]');
  await expect(copiedCells).toHaveCount(0);
  await expect(buttons.first()).not.toHaveAttribute('data-copied', '');
  expect(await copied(page)).toBe('');
});

test('the copy outline follows its notes through a sort', async ({ page }) => {
  await openTable(page);
  await cellAt(page, 2, 'a').click();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Control+c');
  const notes = await page.$$eval('.list-table .is-copied', cells =>
    cells.map(cell => cell.parentElement.querySelector('[data-prop="filename"]').textContent.trim()).sort());
  expect(notes).toHaveLength(2);

  await page.evaluate(async () => {
    const { appState } = await import('/public/js/services/store.js');
    const { sortAppStateFiles } = await import('/public/js/services/file-object-sort.js');
    const { renderFiles } = await import('/public/js/ui/ui-functions-render/a-render-all-files.js');
    appState.sortState = { property: 'filename', direction: 'desc' };
    sortAppStateFiles('filename', 'string', 'desc');
    renderFiles();
  });
  expect(await page.$$eval('.list-table .is-copied', cells =>
    cells.map(cell => cell.parentElement.querySelector('[data-prop="filename"]').textContent.trim()).sort())).toEqual(notes);
});

test('Ctrl+C in an open cell is the browser\'s own copy, not the range', async ({ page }) => {
  await openTable(page);
  await cellAt(page, 1, 'a').click();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('F2');
  await page.keyboard.press('Control+c');
  expect(await copied(page)).toBeNull();
});

// ---- Paste: plans/completed/table-range-paste.md. What reaches the disk is level 1's
// (tests/1-data/60-table-paste.spec.js); these are the gestures and what the table does after.

/**
 * The same ten notes behind a folder that can be written, with the real clipboard allowed. Sorted by
 * last modified, newest first, as the app starts — so a written row belongs at the top.
 */
async function openWritableTable(page) {
  await page.setViewportSize({ width: 1800, height: 800 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const notes = {};
  for (let i = 1; i <= 10; i++) {
    const n = String(i).padStart(2, '0');
    notes[`note-${n}.md`] = `---\na: a${n}\nb: b${n}\nc: c${n}\n---\n# Note ${n}\n`;
  }
  await setupPropertyFolder(page, notes);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const rowNames = page => page.$$eval('.list-table > .note-table',
  rows => rows.map(row => row.querySelector('[data-prop="filename"]').textContent.trim()));

test('the paste button reads the clipboard, keeps focus, and pastes like Ctrl+V', async ({ page }) => {
  await openWritableTable(page);
  await page.evaluate(() => navigator.clipboard.writeText('same'));

  await cellAt(page, 4, 'b').click();
  await page.keyboard.press('Shift+ArrowDown');
  await page.locator('#range-paste-btn').click();
  await page.click('#modal-unsaved-warning-proceed');

  await expect(page.locator('#output-report')).toContainText('pasted 2 cells');
  await expect(cellAt(page, 4, 'b')).toHaveText('same');
  await expect(cellAt(page, 5, 'b')).toHaveText('same');
  expect(await focusedAt(page)).toBe('4:b');
});

test('Ctrl+V pastes into the range, which stays selected, and its rows hold their place until focus leaves them', async ({ page }) => {
  await openWritableTable(page);
  const before = await rowNames(page);
  await cellAt(page, 6, 'b').click();
  // Something copied first, so the held move can be seen to take its outline away.
  await page.keyboard.press('Control+c');
  await expect(page.locator('.list-table .is-copied')).toHaveCount(1);
  await page.evaluate(() => navigator.clipboard.writeText('X\tY\nZ'));

  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Control+v');
  await page.click('#modal-unsaved-warning-proceed');
  await expect(page.locator('#output-report')).toContainText('pasted 3 cells');

  // Written where aimed, the range still selected and focus where it was.
  await expect(cellAt(page, 6, 'b')).toHaveText('X');
  await expect(cellAt(page, 6, 'c')).toHaveText('Y');
  await expect(cellAt(page, 7, 'b')).toHaveText('Z');
  expect(await marks(page)).toHaveLength(4);
  expect(await focusedAt(page)).toBe('6:b');

  // Both written rows now belong at the top, and say so — but stay put. One dashed mark at a time.
  expect(await rowNames(page)).toEqual(before);
  await expect(page.locator('.list-table > .note-table.move-pending')).toHaveCount(2);
  await expect(page.locator('.list-table .is-copied')).toHaveCount(0);

  // Moving within the pasted rows ends the range, not the hold.
  await page.keyboard.press('ArrowDown');
  expect(await focusedAt(page)).toBe('7:b');
  expect(await rowNames(page)).toEqual(before);

  await page.click('#searchbox');
  await expect(page.locator('.list-table > .note-table.move-pending')).toHaveCount(0);
  const after = await rowNames(page);
  expect(after.slice(0, 2).sort()).toEqual([before[6], before[7]].sort());
});

test('Ctrl+V in an open cell is the browser\'s own paste, not the range', async ({ page }) => {
  await openWritableTable(page);
  await page.evaluate(() => navigator.clipboard.writeText('typed'));
  await cellAt(page, 1, 'a').click();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('F2');
  await page.keyboard.press('Control+v');

  await expect(page.locator('#modal-unsaved-warning')).toBeHidden();
  await expect(cellAt(page, 1, 'a')).toContainText('typed');
  await expect(cellAt(page, 2, 'a')).not.toContainText('typed');
});
