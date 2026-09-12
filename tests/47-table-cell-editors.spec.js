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

test('Enter adds an item to a list and does nothing to a one-line value', async ({ page }) => {
  await openTable(page);

  const list = cellFor(page, 'Alpha', 'people');
  await open(list);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Sam');
  expect(await list.evaluate(el => el.textContent)).toContain('\nSam');

  await page.keyboard.press('Escape');

  const text = cellFor(page, 'Alpha', 'markup');
  await open(text);
  const before = await text.evaluate(el => el.textContent);
  await page.keyboard.press('Enter');
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
    const href = await page.locator(`.note-table-cell-header[data-property="${property}"] .type-glyph use`)
      .getAttribute('href');
    const locked = href.endsWith('-locked');
    const cell = rowFor(page, 'Alpha').locator(`.note-table-cell[data-prop="${property}"]`);
    await open(cell);

    const caret = await cell.evaluate(el =>
      el.hasAttribute('contenteditable') || !!el.querySelector('[contenteditable]'));
    expect(caret, `${property}: lock says ${locked}, caret says ${caret}`).toBe(!locked);

    await page.keyboard.press('Escape');
  }
});

test('the lock explains itself, and costs the heading nothing', async ({ page }) => {
  await openTable(page);
  const locked = page.locator('.note-table-cell-header[data-property="title"]');
  const open_ = page.locator('.note-table-cell-header[data-property="people"]');

  await expect(locked.locator('.type-glyph')).toHaveAttribute('data-tip', /not editable/);
  await expect(locked.locator('.type-glyph use')).toHaveAttribute('href', '#icon-type-string-locked');
  await expect(open_.locator('.type-glyph')).not.toHaveAttribute('data-tip', /.*/);

  // one element either way, so the glyphs line up down the table and a locked column spends no more
  // of its header than an open one
  await expect(locked.locator('svg')).toHaveCount(1);
  const width = el => el.evaluate(e => Math.round(e.getBoundingClientRect().width));
  expect(await width(locked.locator('.type-glyph'))).toBe(await width(open_.locator('.type-glyph')));

  // and it is still the last thing in the header, which is what lines it up
  expect(await locked.evaluate(el => el.lastElementChild.classList.contains('header-type-glyph'))).toBe(true);
});

// ---------------------------------------------------------------- read-only cells look it

// The bug behind the read-only styling. A row carrying a file's colour has its text forced to what
// reads against that colour; an expanded cell takes the neutral background and kept that forced
// colour, which in the dark palette is near-black text on a dark ground.
test('an expanded cell takes the neutral foreground, even on a coloured row', async ({ page }) => {
  await openTable(page);

  const contr = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--colour-contr').trim());
  const asRgb = await page.evaluate(c => {
    const d = document.createElement('div');
    d.style.color = c; document.body.append(d);
    const out = getComputedStyle(d).color; d.remove(); return out;
  }, contr);

  const coloured = cellFor(page, 'Gamma', 'title');
  expect(await coloured.evaluate(el => getComputedStyle(el).color)).not.toBe(asRgb);  // the row forces it

  const cell = cellFor(page, 'Alpha', 'markup');
  await open(cell);
  expect(await cell.evaluate(el => getComputedStyle(el).color)).toBe(asRgb);
});

test('an opened cell that takes no caret says so without words', async ({ page }) => {
  await openTable(page);

  const locked = cellFor(page, 'Alpha', 'title');
  await open(locked);
  await expect(locked).toHaveClass(/is-readonly/);
  expect(await locked.evaluate(el => getComputedStyle(el).cursor)).not.toBe('text');
  expect(await locked.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('dashed');

  // the text and the outline fade together, to the same colour, so they read as one thing
  const faded = await locked.evaluate(el => {
    const cs = getComputedStyle(el);
    return { color: cs.color, outline: cs.outlineColor };
  });
  expect(faded.color).toBe(faded.outline);
  expect(faded.color).toMatch(/rgba|color\(/);   // faded against transparent, so it carries alpha

  await page.keyboard.press('Escape');

  const open_ = cellFor(page, 'Alpha', 'markup');
  await open(open_);
  await expect(open_).not.toHaveClass(/is-readonly/);
  expect(await open_.evaluate(el => getComputedStyle(el).cursor)).toBe('text');
  expect(await open_.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
});

test('collapsing takes the read-only marking off again', async ({ page }) => {
  await openTable(page);
  const cell = cellFor(page, 'Alpha', 'title');
  await open(cell);
  await page.keyboard.press('Escape');
  await expect(cell).not.toHaveClass(/is-readonly/);
});

// ---------------------------------------------------------------- list item marking

/** The text each registered list-item range covers, for one cell. */
const markedItems = (page, prop) => page.evaluate(prop => {
  const cell = [...document.querySelectorAll('.note-table')]
    .find(r => r.textContent.includes('Alpha'))
    .querySelector(`[data-prop="${prop}"]`);
  const h = CSS.highlights.get('list-item');
  return h ? [...h].filter(r => r.startContainer.parentElement === cell).map(r => r.toString()) : [];
}, prop);

test('every item in a list cell is marked, and nothing else is', async ({ page }) => {
  await openTable(page);

  expect(await markedItems(page, 'people')).toEqual(['John Smith', '"Doe, Jane"']);

  // a tags cell renders pills rather than a comma line, whatever its column's type says
  await expect(cellFor(page, 'Alpha', 'tags')).not.toHaveAttribute('data-list', /.*/);
  expect(await markedItems(page, 'tags')).toEqual([]);

  // and a plain text cell is not a list
  expect(await markedItems(page, 'markup')).toEqual([]);
});

test('a mismatched list column is not marked, since it shows raw text', async ({ page }) => {
  await openTable(page);
  await setType(page, 'markup', 'array');   // a single value in a column of lists
  await expect(cellFor(page, 'Alpha', 'markup')).toHaveAttribute('data-mismatch', 'shape');
  expect(await markedItems(page, 'markup')).toEqual([]);
});

test('typing inside an item grows its mark, without the handler doing anything', async ({ page }) => {
  await openTable(page);
  const cell = cellFor(page, 'Alpha', 'people');
  await open(cell);

  // the caret goes to the start of the first item, then types into it
  await page.keyboard.press('Home');
  await page.keyboard.type('Dr ');

  expect(await markedItems(page, 'people')).toEqual(['Dr John Smith', '"Doe, Jane"']);
});

test('typing a comma splits an item in two', async ({ page }) => {
  await openTable(page);
  const cell = cellFor(page, 'Alpha', 'people');
  await open(cell);

  await page.keyboard.press('End');
  await page.keyboard.type(', Rae Chen');

  expect(await markedItems(page, 'people')).toEqual(['John Smith', '"Doe, Jane"', 'Rae Chen']);
});

test('a search match still paints over a marked item', async ({ page }) => {
  await openTable(page);
  const priority = await page.evaluate(() => CSS.highlights.get('list-item').priority);
  expect(priority).toBeLessThan(0);
});

test('a list item is marked by its tint alone', async ({ page }) => {
  await openTable(page);
  // the bands above and below each item were taken out for being louder than a table wants
  const rule = await page.evaluate(() => {
    // style.css is a list of @imports, so the rules are a level down inside each CSSImportRule
    const flatten = sheet => [...sheet.cssRules].flatMap(r => r.styleSheet ? flatten(r.styleSheet) : [r]);
    return [...document.styleSheets]
      .flatMap(sheet => { try { return flatten(sheet); } catch { return []; } })
      .find(r => r.selectorText === '::highlight(list-item)')?.style.cssText ?? '';
  });

  expect(rule).toContain('background-color');
  expect(rule).not.toContain('text-decoration');
});
