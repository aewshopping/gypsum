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

async function openTable(page) {
  await page.setViewportSize({ width: 1100, height: 900 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const rowFor = (page, title) => page.locator('.note-table').filter({ hasText: title }).first();
const pickerRow = (page, property) => page.locator(`.info-modal-row[data-property="${property}"]`);

async function openPicker(page) {
  await page.click('[data-action="open-column-picker"]');
  await expect(page.locator('#modal-columns')).toBeVisible();
}

async function closePicker(page) {
  await page.click('[data-action="close-column-picker"]');
  await expect(page.locator('#modal-columns')).not.toBeVisible();
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
  await expect(pickerRow(page, 'lastModified').locator('.column-picker-type')).toHaveAttribute('data-tip', 'date');
  // A list says how it is searched too, since that is the only place the setting is visible.
  await expect(pickerRow(page, 'people').locator('.column-picker-type')).toHaveAttribute('data-tip', 'list, contains text');
  await expect(pickerRow(page, 'tags').locator('.column-picker-type')).toHaveAttribute('data-tip', 'list, exact match');
});

// The glyph is drawn per type, so the list can be read down rather than one tooltip at a time.
// Both the renderer and the popover build the symbol id from the stored type name; this is what
// stops them drifting into drawing different glyphs for the same type.
test('the glyph is drawn for the type, and follows a change', async ({ page }) => {
  await openTable(page);
  await openPicker(page);

  const glyphHref = property => pickerRow(page, property).locator('.column-picker-type use');
  await expect(glyphHref('due')).toHaveAttribute('href', '#icon-type-string');
  await expect(glyphHref('lastModified')).toHaveAttribute('href', '#icon-type-date');
  await expect(glyphHref('sizeInBytes')).toHaveAttribute('href', '#icon-type-number');
  await expect(glyphHref('tags')).toHaveAttribute('href', '#icon-type-array');

  await pickerRow(page, 'due').locator('.column-picker-type').click();
  await page.selectOption('#column-type-select', 'date');
  await expect(glyphHref('due')).toHaveAttribute('href', '#icon-type-date');

  // and it survives the row being redrawn from the layout
  await page.keyboard.press('Escape');
  await closePicker(page);
  await openPicker(page);
  await expect(glyphHref('due')).toHaveAttribute('href', '#icon-type-date');
});

// The two halves of that are deliberately on different clocks, and both matter: the row answers
// straight away so the choice is visibly taken, and the layout is not touched until the dialog
// closes so reset can still undo it. Read without retrying, because "eventually" would pass here
// even if the glyph were only redrawn on close.
test('the glyph changes as soon as the type is picked, before the layout is touched', async ({ page }) => {
  await openTable(page);
  await openPicker(page);

  const glyph = pickerRow(page, 'people').locator('.column-picker-type');
  await glyph.click();
  await page.selectOption('#column-type-select', 'date');

  expect(await glyph.locator('use').getAttribute('href')).toBe('#icon-type-date');
  expect(await glyph.getAttribute('data-tip')).toBe('date');
  await expect(page.locator('#column-type-menu')).toBeVisible();

  const stored = await page.evaluate(async () => {
    const s = await import('/public/js/services/store.js');
    return s.TABLE_VIEW_COLUMNS.columnLayout.get('people')?.type ?? null;
  });
  expect(stored).toBeNull();

  // Changing how a list is searched moves the tooltip and leaves the glyph alone, since the column
  // is still a list.
  await page.selectOption('#column-type-select', 'array');
  await page.selectOption('#column-search-select', 'array');
  expect(await glyph.locator('use').getAttribute('href')).toBe('#icon-type-array');
  expect(await glyph.getAttribute('data-tip')).toBe('list, exact match');
});

// Every row has one of these buttons, and a shared anchor name resolves to the LAST matching
// element in the document — so without the one-at-a-time attribute the popover would hang off the
// bottom row whichever glyph was clicked.
test('the type popover opens on the glyph that was clicked', async ({ page }) => {
  await openTable(page);
  await openPicker(page);

  for (const property of ['title', 'due']) {
    await pickerRow(page, property).locator('.column-picker-type').click();
    await expect(page.locator('#column-type-menu')).toBeVisible();

    const btn = await pickerRow(page, property).locator('.column-picker-type').boundingBox();
    const menu = await page.locator('#column-type-menu').boundingBox();

    expect(Math.abs((menu.x + menu.width) - (btn.x + btn.width))).toBeLessThan(2);
    // Below the button, or above it when the row sits too near the bottom of the dialog for the
    // popover to fit. Either way it is touching its own button and not some other row's.
    const gap = menu.y > btn.y ? menu.y - (btn.y + btn.height) : btn.y - (menu.y + menu.height);
    expect(gap).toBeLessThan(12);

    await page.keyboard.press('Escape');
  }
});

// tooltip.js writes its own anchor-name inline on any [data-tip] element while its tooltip is up,
// and it builds that value by clearing the inline one and reading the computed stylesheet value.
// That merges a stylesheet declaration and destroys an inline one — and the pointer is sitting on
// this very button, so the tooltip fires the moment the popover opens.
test('the popover keeps its anchor while the button tooltip is showing', async ({ page }) => {
  await openTable(page);
  await openPicker(page);

  const glyph = pickerRow(page, 'title').locator('.column-picker-type');
  await glyph.click();
  await expect(page.locator('#column-type-menu')).toBeVisible();

  const before = await page.locator('#column-type-menu').boundingBox();
  await glyph.hover();
  await page.waitForTimeout(800);   // longer than the tooltip's own delay
  const after = await page.locator('#column-type-menu').boundingBox();

  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
});

// "Search as" has no meaning off a list, since nothing else in the app searches by whole values.
// Disabled rather than hidden, so the popover keeps one shape as the type is changed.
test('search as is only available for a list column', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await pickerRow(page, 'due').locator('.column-picker-type').click();

  await expect(page.locator('#column-search-select')).toBeDisabled();
  await page.selectOption('#column-type-select', 'array');
  await expect(page.locator('#column-search-select')).toBeEnabled();
  await page.selectOption('#column-type-select', 'date');
  await expect(page.locator('#column-search-select')).toBeDisabled();
});

// The choice lands on the row and is read into the layout when the dialog closes, which is the
// path the order and the visibility already take.
test('a type set in the picker reaches the table', async ({ page }) => {
  await openTable(page);
  await expect(rowFor(page, 'Alpha')).toContainText('2026-03-01');   // text, as loaded

  await openPicker(page);
  await pickerRow(page, 'due').locator('.column-picker-type').click();
  await page.selectOption('#column-type-select', 'date');
  await page.keyboard.press('Escape');
  await closePicker(page);

  await expect(rowFor(page, 'Alpha')).toContainText('3/1/2026');     // read as a date
  // The founding rule in the plan: a type is the user's choice, so the column holds whatever the
  // notes hold. Falling back to the raw text shows what the file says; "Invalid Date" would be the
  // app inventing a fact.
  await expect(rowFor(page, 'Beta')).toContainText('quite soon');
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
