const { test, expect } = require('@playwright/test');
const { loadFolder } = require('./helpers');

// What each note is for:
//   a.md — a real date, a list, and a value holding markup. The markup one is the whole point of
//          the escaping: a cell is what an edit is read back out of, so `a <b> c` rendered as
//          `a  c` would have rewritten the note on the first commit.
//   b.md — prose in the date column, so a mismatched cell is on screen beside a matching one.
//   c.md — no front matter at all, so an empty date cell can be checked.
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
      } };
    };
  });
}

async function openTable(page, width = 1400) {
  await page.setViewportSize({ width, height: 900 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
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

test('an empty date cell is blank rather than N/A', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'date');
  await expect(cellFor(page, 'Gamma', 'due')).toHaveText('');
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

test('clicking the picker keeps the cell open and the caret inside it', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'date');

  const cell = cellFor(page, 'Alpha', 'due');
  await open(cell);
  await cell.locator('.cell-date-pick').click();

  await expect(cell).toHaveClass(/is-expanded/);
  expect(await cell.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
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

test('a date that cannot be read gets no caret and no picker', async ({ page }) => {
  await openTable(page);
  await setType(page, 'due', 'date');

  const bad = cellFor(page, 'Beta', 'due');
  await open(bad);

  await expect(bad).toHaveClass(/is-expanded/);
  await expect(bad.locator('.cell-date-pick')).toHaveCount(0);
  await expect(bad).not.toHaveAttribute('contenteditable', /.*/);
  await expect(bad.locator('.cell-mismatch-note')).toHaveText(/fix this in the note/);
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

test('a property that cannot be written back takes no caret', async ({ page }) => {
  await openTable(page);

  const title = cellFor(page, 'Alpha', 'title');
  await open(title);
  await expect(title).toHaveClass(/is-expanded/);                    // it still opens to be read
  await expect(title).not.toHaveAttribute('contenteditable', /.*/);  // but takes no caret
  await expect(title.locator('.cell-mismatch-note')).toHaveCount(0); // and says nothing about it
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

// Asserted as a rule rather than against a list of columns, so it keeps its meaning when one of
// these becomes editable: the header's lock and the cell's caret are one decision in one place
// (isPropertyEditable), and this is what catches them drifting apart.
test('a column wears a lock exactly when its cells take no caret', async ({ page }) => {
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
    expect(caret, `${property}: lock says ${locked}, caret says ${caret}`).toBe(!locked);

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
