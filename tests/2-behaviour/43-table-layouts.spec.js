const { test, expect } = require('@playwright/test');
const { loadFolder, setupMockDirectoryWithLayouts } = require('../helpers');

async function openTable(page) {
  await page.setViewportSize({ width: 1000, height: 900 });
  await setupMockDirectoryWithLayouts(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

/** The layouts file as the app has written it, parsed. */
const layoutsFile = page => page.evaluate(() => JSON.parse(window.__layoutsFileContent || '{}'));

const layoutName = page => page.locator('#layout-name');
const saveBtn = page => page.locator('#layout-save-btn');
const isDirty = page => page.evaluate(async () => {
  const m = await import('/public/js/services/store.js');
  return m.appState.tableLayouts.isDirty;
});
const modal = page => page.locator('#modal-layouts');
const layoutRows = page => page.locator('#layout-list .layout-row');
const pickerRows = page => page.locator('#column-picker-list .info-modal-row');

async function openLayouts(page) {
  await layoutName(page).click();
  await expect(modal(page)).toBeVisible();
}

/** Saves over the active layout, from its own row in the layouts modal. */
async function saveActiveLayout(page) {
  await openLayouts(page);
  await saveBtn(page).click();
  await page.locator('[data-action="close-layouts-modal"]').click();
  await expect(modal(page)).not.toBeVisible();
}

/** Renames the row currently in edit mode by typing over it and committing with Enter. */
async function typeName(page, name) {
  const el = page.locator('#layout-list .layout-row-rename[contenteditable]');
  await expect(el).toBeFocused();
  await page.keyboard.type(name);   // the text is selected, so typing replaces it
  await page.keyboard.press('Enter');
}

async function openPicker(page) {
  await page.click('[data-action="open-column-picker"]');
  await expect(page.locator('#modal-columns')).toBeVisible();
}

/** Hides the tags column, so there is a change to save or discard. */
async function hideTags(page) {
  await openPicker(page);
  await pickerRows(page).filter({ hasText: 'tags' }).locator('input.toggle').uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('.note-table-cell-header[data-property="tags"]')).toHaveCount(0);
}

async function saveAsNew(page, name) {
  await openLayouts(page);
  await modal(page).locator('[data-action="layout-save-as"]').click();
  await typeName(page, name);
  await page.locator('[data-action="close-layouts-modal"]').click();
  await expect(layoutName(page)).toContainText(name);
}

test('a folder with no saved layout shows the app defaults and writes nothing', async ({ page }) => {
  await openTable(page);

  await expect(layoutName(page)).toContainText('default');
  expect(await page.evaluate(() => window.__layoutsFileContent)).toBe('');

  // The defaults make no statement about which columns are wanted, so every property the folder
  // holds is one — front matter keys no layout has ever heard of included.
  await expect(page.locator('.note-table-cell-header[data-property="people"]')).toHaveCount(1);
});

test('changing columns writes nothing until the user saves', async ({ page }) => {
  await openTable(page);
  await hideTags(page);

  await page.waitForTimeout(200);   // long enough for a write to have happened if one were coming
  expect(await page.evaluate(() => window.__layoutsFileContent)).toBe('');
  await expect(layoutName(page)).toContainText('default');
});

test('save as new writes every column to the layout', async ({ page }) => {
  await openTable(page);
  await hideTags(page);
  await saveAsNew(page, 'review');

  const doc = await layoutsFile(page);
  expect(doc.active).toBe('review');
  expect(doc.layoutVersion).toBe(2);

  const columns = doc.layouts.review.columns;
  // Hidden columns are written too, with their place and width, so switching one back on
  // returns it where it was.
  expect(columns.find(c => c.name === 'tags').visible).toBe(false);
  expect(columns.find(c => c.name === 'title').visible).toBe(true);

  // Every column carries all of its metrics, none inferred — and no type, which belongs to the
  // property and lives in the document's own propertyTypes object.
  for (const column of columns) {
    expect(typeof column.label).toBe('string');
    expect(Number.isFinite(column.width)).toBe(true);
    expect(typeof column.visible).toBe('boolean');
    expect(column.type).toBeUndefined();
    expect(column.search_type).toBeUndefined();
  }
  // order is regenerated from position on every write
  expect(columns.map(c => c.order)).toEqual(columns.map((_, i) => i));
});

test('save layout writes the current columns over the active layout', async ({ page }) => {
  await openTable(page);
  await saveAsNew(page, 'review');

  // tags is saved as visible; hide it and save again over the same layout
  expect((await layoutsFile(page)).layouts.review.columns.find(c => c.name === 'tags').visible).toBe(true);

  await hideTags(page);
  await saveActiveLayout(page);
  await page.waitForTimeout(150);

  const doc = await layoutsFile(page);
  expect(Object.keys(doc.layouts)).toEqual(['review']);   // saved over, not saved as another
  expect(doc.layouts.review.columns.find(c => c.name === 'tags').visible).toBe(false);
});

test('save sits on the active layout\'s row, and nowhere else', async ({ page }) => {
  await openTable(page);
  await saveAsNew(page, 'review');
  await saveAsNew(page, 'planning');

  await openLayouts(page);

  // One save button in the list, on the row of the layout in use: you can only save what is on
  // screen, and what is on screen belongs to the active layout.
  await expect(modal(page).locator('#layout-save-btn')).toHaveCount(1);
  await expect(modal(page).locator('.layout-row[data-layout="planning"] #layout-save-btn')).toHaveCount(1);

  // The app's defaults are nothing to write over — "save as new" is the answer there — so
  // selecting them takes the button away rather than offering a save that cannot happen.
  await modal(page).locator('button.layout-row-name[data-layout=""]').click();
  await expect(layoutName(page)).toContainText('default');
  await expect(modal(page).locator('#layout-save-btn')).toHaveCount(0);
});

test('unsaved column changes are discarded when the layout is reloaded', async ({ page }) => {
  await openTable(page);
  await saveAsNew(page, 'review');
  await hideTags(page);

  // Switching away and back re-reads the layout, which never saw the change.
  await openLayouts(page);
  await modal(page).locator('button.layout-row-name[data-layout=""]').click();
  await expect(layoutName(page)).toContainText('default');

  await modal(page).locator('button.layout-row-name[data-layout="review"]').click();
  await expect(layoutName(page)).toContainText('review');
  await page.locator('[data-action="close-layouts-modal"]').click();

  await expect(page.locator('.note-table-cell-header[data-property="tags"]')).toHaveCount(1);
});

test('a saved layout is restored when the folder is reopened', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await setupMockDirectoryWithLayouts(page);

  // A layout that hides everything but the file column and widens it.
  await page.addInitScript(() => {
    window.__layoutsFileContent = JSON.stringify({
      layoutVersion: 1,
      active: 'review',
      layouts: {
        review: {
          updated: '2026-01-01T00:00:00.000Z',
          columns: [
            { order: 0, name: 'title', label: 'headline', width: 275, visible: true },
            { order: 1, name: 'internalId', label: 'file', width: 111, visible: true },
            { order: 2, name: 'tags', label: 'tags', width: 200, visible: false },
          ],
        },
      },
    });
  });

  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  await expect(layoutName(page)).toContainText('review');

  // Order, heading and width all come from the file, not from FILE_PROPERTIES.
  const heads = page.locator('.note-table-cell-header');
  await expect(heads.nth(0)).toHaveAttribute('data-property', 'title');
  await expect(heads.nth(0)).toContainText('headline');
  await expect(heads.nth(1)).toHaveAttribute('data-property', 'internalId');

  const width = await heads.nth(1).evaluate(el => Math.round(el.getBoundingClientRect().width));
  expect(width).toBe(111);

  // A column the layout hides stays hidden; one it never mentions is hidden too. A layout names
  // the columns its user chose, so a property it has never seen is not one of them.
  await expect(page.locator('.note-table-cell-header[data-property="tags"]')).toHaveCount(0);
  await expect(page.locator('.note-table-cell-header[data-property="filename"]')).toHaveCount(0);
});

test('a wonky hand-edited order still loads, in the order it asks for', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await setupMockDirectoryWithLayouts(page);

  await page.addInitScript(() => {
    window.__layoutsFileContent = JSON.stringify({
      layoutVersion: 1,
      active: 'messy',
      layouts: {
        messy: {
          columns: [
            { order: 10, name: 'title', label: 'title', width: 200, visible: true },
            { name: 'tags', label: 'tags', width: 150, visible: true },          // absent: sorts last
            { order: 'x', name: 'filename', label: 'filename', width: 150, visible: true }, // not a number: last
            { order: -1, name: 'internalId', label: 'file', width: 90, visible: true },     // negative: first
            { order: 10, name: 'title', label: 'duplicate', width: 999, visible: true },    // repeat: dropped
          ],
        },
      },
    });
  });

  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  const order = await page.locator('.note-table-cell-header').evaluateAll(
    els => els.map(el => el.dataset.property));

  // -1 first, then 10, then the two without a usable order in the sequence they were written.
  expect(order.slice(0, 4)).toEqual(['internalId', 'title', 'tags', 'filename']);

  // The duplicate title lost outright rather than taking one entry's place and another's width.
  await expect(page.locator('.note-table-cell-header[data-property="title"]')).toHaveCount(1);
  const titleWidth = await page.locator('.note-table-cell-header[data-property="title"]')
    .evaluate(el => Math.round(el.getBoundingClientRect().width));
  expect(titleWidth).toBe(200);
});

test('rename and delete act on the active layout', async ({ page }) => {
  await openTable(page);

  await hideTags(page);
  await saveAsNew(page, 'draft');

  // rename, in the row itself
  await openLayouts(page);
  await modal(page).locator('[data-action="layout-edit-name"][data-layout="draft"]').click();
  await typeName(page, 'review');

  await expect(modal(page).locator('button.layout-row-name[data-layout="review"]')).toBeVisible();
  expect(Object.keys((await layoutsFile(page)).layouts)).toEqual(['review']);

  // delete, which asks first and then hands back to the app defaults
  await modal(page).locator('[data-action="layout-delete"][data-layout="review"]').click();
  await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
  await page.click('[data-action="warning-proceed"]');
  await page.locator('[data-action="close-layouts-modal"]').click();

  await expect(layoutName(page)).toContainText('default');
  expect((await layoutsFile(page)).layouts).toEqual({});

  // Deleting the record of an arrangement does not disturb the arrangement.
  await expect(page.locator('.note-table-cell-header[data-property="tags"]')).toHaveCount(0);
});

test('reset columns goes back to the saved layout, not to the app defaults', async ({ page }) => {
  await openTable(page);

  // A layout saved without the tags column, so "the layout" and "the defaults" differ.
  await hideTags(page);
  await saveAsNew(page, 'review');

  // Now hide another column on top of it, then reset.
  await openPicker(page);
  await pickerRows(page).filter({ hasText: 'title' }).locator('input.toggle').uncheck();
  await page.click('[data-action="reset-columns"]');

  // Back to the layout: title returns, tags stays hidden. Resetting to the app defaults would
  // have brought tags back too.
  await expect(pickerRows(page).filter({ hasText: 'title' }).locator('input.toggle')).toBeChecked();
  await expect(pickerRows(page).filter({ hasText: 'tags' }).locator('input.toggle')).not.toBeChecked();

  await page.keyboard.press('Escape');
  await expect(page.locator('.note-table-cell-header[data-property="title"]')).toHaveCount(1);
  await expect(page.locator('.note-table-cell-header[data-property="tags"]')).toHaveCount(0);
});

/** Seeds a layout file and opens the folder in table view with it already active. */
async function openTableWithLayout(page, doc, options) {
  await page.setViewportSize({ width: 1000, height: 900 });
  await setupMockDirectoryWithLayouts(page, options);
  await page.addInitScript(seed => { window.__layoutsFileContent = JSON.stringify(seed); }, doc);

  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

/** A layout naming only the file and title columns, so everything else is new to it. */
const sparseLayout = {
  layoutVersion: 1,
  active: 'review',
  layouts: {
    review: {
      updated: '2026-01-01T00:00:00.000Z',
      columns: [
        { order: 0, name: 'internalId', label: 'file', width: 90, visible: true },
        { order: 1, name: 'title', label: 'title', width: 350, visible: true },
      ],
    },
  },
};

/** A layout carrying two columns for properties no file in the folder has. */
const deadLayout = {
  layoutVersion: 1,
  active: 'review',
  layouts: {
    review: {
      updated: '2026-01-01T00:00:00.000Z',
      columns: [
        { order: 0, name: 'internalId', label: 'file', width: 90, visible: true },
        { order: 1, name: 'ghost', label: 'ghost', width: 150, visible: true },
        { order: 2, name: 'phantom', label: 'phantom', width: 150, visible: false },
        { order: 3, name: 'title', label: 'title', width: 350, visible: true },
      ],
    },
  },
};

const pickerRow = (page, prop) => page.locator(`#column-picker-list .info-modal-row[data-property="${prop}"]`);

/** How many distinct left and right edges the toggles have: one of each means they are in line. */
async function toggleEdges(page) {
  return page.locator('#column-picker-list input.toggle').evaluateAll(els => ({
    lefts: new Set(els.map(el => Math.round(el.getBoundingClientRect().left))).size,
    rights: new Set(els.map(el => Math.round(el.getBoundingClientRect().right))).size,
  }));
}

/** The long property's own row, keyed off the name the fixture used. */
const longPropRow = async page =>
  pickerRow(page, await page.evaluate(() => window.__longPropName));

test('a property the layout has never seen stays out of it, and is offered unticked', async ({ page }) => {
  await openTableWithLayout(page, sparseLayout);

  // people comes from beta.md's front matter and the layout predates it, so it is not a column.
  await expect(page.locator('.note-table-cell-header[data-property="people"]')).toHaveCount(0);

  // It is still a candidate, and the picker is where it is found.
  await openPicker(page);
  await expect(pickerRow(page, 'people')).toHaveCount(1);
  await expect(pickerRow(page, 'people').locator('input.toggle')).not.toBeChecked();

  await pickerRow(page, 'people').locator('input.toggle').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('.note-table-cell-header[data-property="people"]')).toHaveCount(1);

  // Saving records the answer both ways: the one switched on, and the ones left alone.
  await saveActiveLayout(page);
  await page.waitForTimeout(150);

  const columns = (await layoutsFile(page)).layouts.review.columns;
  expect(columns.find(c => c.name === 'people').visible).toBe(true);
  expect(columns.find(c => c.name === 'filename').visible).toBe(false);
  expect(columns.find(c => c.name === 'date').visible).toBe(false);
});

test('a dead column keeps its place, and the picker locks it as the layout has it', async ({ page }) => {
  await openTableWithLayout(page, deadLayout);

  // Drawn because the layout says so, even with nothing to put in it.
  await expect(page.locator('.note-table-cell-header[data-property="ghost"]')).toHaveCount(1);
  await expect(page.locator('.note-table-cell-header[data-property="phantom"]')).toHaveCount(0);

  await openPicker(page);
  const ghost = pickerRow(page, 'ghost').locator('input.toggle');
  const phantom = pickerRow(page, 'phantom').locator('input.toggle');

  await expect(ghost).toBeDisabled();
  await expect(ghost).toBeChecked();
  await expect(phantom).toBeDisabled();
  await expect(phantom).not.toBeChecked();

  // A live column is untouched by any of this.
  await expect(pickerRow(page, 'tags').locator('input.toggle')).toBeEnabled();
});

const headerFor = (page, prop) => page.locator(`.note-table-cell-header[data-property="${prop}"]`);
const menuDelete = page => page.locator('#column-menu [data-action="column-delete-menu"]');

/** Selects a header and clicks it again, which is what opens its options. */
async function openColumnMenu(page, prop) {
  await headerFor(page, prop).click();
  await headerFor(page, prop).click();
  await expect(page.locator('#column-menu')).toBeVisible();
}

test('an empty column says so in its heading, and a column with values does not', async ({ page }) => {
  await openTableWithLayout(page, deadLayout);

  // Drawn at a lighter weight rather than left out: the layout asked for the column, and a column
  // that vanished when nothing filled it is exactly what this replaces.
  await expect(headerFor(page, 'ghost')).toHaveAttribute('data-empty', '');
  await expect(headerFor(page, 'title')).not.toHaveAttribute('data-empty', '');

  const faded = await headerFor(page, 'ghost').locator('.header-label')
    .evaluate(el => Number(getComputedStyle(el).opacity));
  const full = await headerFor(page, 'title').locator('.header-label')
    .evaluate(el => Number(getComputedStyle(el).opacity));
  expect(faded).toBeLessThan(full);
});

test('the column menu offers delete only on an empty column', async ({ page }) => {
  await openTableWithLayout(page, deadLayout);

  await openColumnMenu(page, 'title');
  await expect(menuDelete(page)).toBeHidden();
  await page.keyboard.press('Escape');

  await openColumnMenu(page, 'ghost');
  await expect(menuDelete(page)).toBeVisible();
});

test('the app defaults offer no delete, because there is no layout to delete from', async ({ page }) => {
  // Nothing is empty under the defaults either — every column there exists because a file has the
  // key — so this is about the second half of the rule, and hiding tags first is what makes a
  // column the defaults would not otherwise show.
  await openTable(page);

  await openColumnMenu(page, 'title');
  await expect(menuDelete(page)).toBeHidden();
  // hide column is still there, which is the answer under the defaults
  await expect(page.locator('#column-menu [data-action="column-hide"]')).toBeVisible();
});

test('delete column in the menu removes it from the saved layout, the same as the bin', async ({ page }) => {
  await openTableWithLayout(page, deadLayout);
  await openColumnMenu(page, 'ghost');

  await menuDelete(page).click();
  await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
  await page.click('[data-action="warning-cancel"]');
  await expect(headerFor(page, 'ghost')).toHaveCount(1);

  await openColumnMenu(page, 'ghost');
  await menuDelete(page).click();
  await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
  await page.click('[data-action="warning-proceed"]');

  // The same write the bin does: straight to disk, one column, the rest left where they were.
  // (The tail is every other property the folder has, appended hidden — the defaults' own doing.)
  await expect(headerFor(page, 'ghost')).toHaveCount(0);
  await expect.poll(async () => (await layoutsFile(page)).layouts.review.columns.map(c => c.name))
    .not.toContain('ghost');

  const columns = (await layoutsFile(page)).layouts.review.columns;
  expect(columns.slice(0, 3).map(c => c.name)).toEqual(['internalId', 'phantom', 'title']);
  expect(columns.map(c => c.order)).toEqual(columns.map((_, i) => i));
});

/**
 * A folder whose notes can be written to, with a layout already saved — setupMockDirectoryWithLayouts
 * hands out read-only file handles, so a cell edit cannot reach a note in it.
 */
async function openWritableTableWithLayout(page, doc, files) {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.addInitScript(([seed, notes]) => {
    window.__layoutsFileContent = JSON.stringify(seed);
    window.__files = { ...notes };
    const store = { 'table_layouts.gypsum': JSON.stringify(seed) };

    const makeFile = (name) => ({
      kind: 'file', name,
      getFile: async () => ({ name, size: window.__files[name].length, lastModified: Date.now(),
        text: async () => window.__files[name] }),
      createWritable: async () => ({
        write: async (c) => { window.__files[name] = c; }, close: async () => {} }),
    });
    const gypsumDir = {
      getFileHandle: async (name, options) => {
        if (!(name in store)) {
          if (!options?.create) throw new Error(`NotFoundError: ${name}`);
          store[name] = '';
        }
        return {
          getFile: async () => ({ text: async () => store[name] }),
          createWritable: async () => ({
            write: async (c) => {
              store[name] = c;
              if (name === 'table_layouts.gypsum') window.__layoutsFileContent = c;
            },
            close: async () => {},
          }),
        };
      },
      removeEntry: async (name) => { delete store[name]; },
    };
    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { for (const name of Object.keys(window.__files)) yield makeFile(name); },
      getDirectoryHandle: async (name) => {
        if (name === '.gypsum') return gypsumDir;
        throw new Error(`Unexpected getDirectoryHandle: ${name}`);
      },
    });
  }, [doc, files]);

  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

test('a column emptied this session stays deleted, and does not come back on save', async ({ page }) => {
  // The case the bin exists for, and the one that used to undo itself. myFilesProperties only ever
  // grows, so clearing the last value of a key leaves it registered — resolveColumns then read it as
  // a property the layout had never seen and appended it hidden, on the very next render. The column
  // was back in the picker before the user could save, and the save wrote it to disk again.
  await openWritableTableWithLayout(page, {
    layoutVersion: 2, active: 'review', propertyTypes: {},
    layouts: { review: { updated: '2026-01-01T00:00:00.000Z', columns: [
      { order: 0, name: 'internalId', label: 'file', width: 90, visible: true },
      { order: 1, name: 'title', label: 'title', width: 260, visible: true },
      { order: 2, name: 'status', label: 'status', width: 160, visible: true },
    ] } },
  }, {
    'alpha.md': '---\nstatus: draft\n---\n# Alpha\n\nBody.\n',
    'beta.md': '---\n---\n\n# Beta\n\nBody.\n',
  });

  // alpha.md is the only note with the key, so clearing it empties the column.
  const cell = page.locator('.note-table').filter({ hasText: 'Alpha' }).first()
    .locator('.note-table-cell[data-prop="status"]');
  await cell.click();
  await cell.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');

  const header = page.locator('.note-table-cell-header[data-property="status"]');
  await expect(header).toHaveAttribute('data-empty', '');

  await openPicker(page);
  await pickerRow(page, 'status').locator('[data-action="column-delete"]').click();
  await page.click('[data-action="warning-proceed"]');

  // Gone from the picker at once — not put back by the render the delete itself runs.
  await expect(pickerRow(page, 'status')).toHaveCount(0);
  await page.click('[data-action="close-column-picker"]');
  await expect(header).toHaveCount(0);

  // And it stays gone when the layout is saved on top.
  await saveActiveLayout(page);
  await expect.poll(async () => (await layoutsFile(page)).layouts.review.columns.map(c => c.name))
    .not.toContain('status');
});

test('the bin removes a dead column from the saved layout, without closing the picker', async ({ page }) => {
  await openTableWithLayout(page, deadLayout);
  await openPicker(page);

  // Cancelling changes nothing.
  await pickerRow(page, 'ghost').locator('[data-action="column-delete"]').click();
  await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
  await page.click('[data-action="warning-cancel"]');
  await expect(pickerRow(page, 'ghost')).toHaveCount(1);

  await pickerRow(page, 'ghost').locator('[data-action="column-delete"]').click();
  await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
  await page.click('[data-action="warning-proceed"]');

  // The row goes, the dialog stays, and the column goes from the file rather than waiting on a save.
  await expect(pickerRow(page, 'ghost')).toHaveCount(0);
  await expect(page.locator('#modal-columns')).toBeVisible();
  await expect.poll(async () => (await layoutsFile(page)).layouts.review.columns.map(c => c.name))
    .not.toContain('ghost');

  // The rest are left where they were, the other dead one included: one bin removes one column.
  const columns = (await layoutsFile(page)).layouts.review.columns;
  expect(columns.slice(0, 3).map(c => c.name)).toEqual(['internalId', 'phantom', 'title']);
  expect(columns.map(c => c.order)).toEqual(columns.map((_, i) => i));

  await expect(page.locator('.note-table-cell-header[data-property="ghost"]')).toHaveCount(0);
});

// ---------------------------------------------------------------------------------------------
// Property types. They are not part of a layout: they sit in the document's own propertyTypes
// object, so switching layout cannot change what a column sorts by, and setting one works with
// the app's defaults in use. See the plan that undid table-value-types.md §3.1.
// ---------------------------------------------------------------------------------------------

/** Sets a column's value type from the picker, the way a user does. */
async function setTypeFromPicker(page, property, type) {
  await openPicker(page);
  await page.locator(`.info-modal-row[data-property="${property}"] .column-picker-type`).click();
  await page.locator(`#modal-column-type [data-action="column-type-set"][data-value="${type}"]`).click();
  await page.keyboard.press('Escape');
  await page.click('[data-action="close-column-picker"]');
  await expect(page.locator('#modal-columns')).not.toBeVisible();
}

const resolvedType = (page, property) => page.evaluate(async name => {
  const m = await import('/public/js/services/property-type.js');
  return m.propertyType(name);
}, property);

/** Sets a column's value type from the table header's own menu. */
async function setTypeFromHeader(page, property, type) {
  const header = page.locator(`.note-table-cell-header[data-property="${property}"]`);
  await header.scrollIntoViewIfNeeded();
  await header.click();
  await header.click();
  await page.locator('[data-action="column-change-type"]').click();
  await page.locator(`#modal-column-type [data-action="column-type-set"][data-value="${type}"]`).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-column-type')).not.toBeVisible();
}

// From the header menu rather than the picker, because closing the picker marks the layout dirty
// whatever was done in it — including nothing. The header menu changes one thing, so it is where
// "a type does not make a layout unsaved" can actually be seen.
test('a type is written at once, without saving a layout, and leaves the layout alone', async ({ page }) => {
  await openTable(page);
  // wide enough that the date column's header is on screen to be clicked
  await page.setViewportSize({ width: 1800, height: 900 });
  await setTypeFromHeader(page, 'date', 'string');

  await expect.poll(() => page.evaluate(() => window.__layoutsFileContent)).not.toBe('');
  const doc = await layoutsFile(page);
  expect(doc.propertyTypes.date).toEqual({ type: 'string' });

  // no layout was invented on the user's behalf, and none was marked unsaved
  expect(doc.layouts).toEqual({});
  expect(doc.active).toBeNull();
  await expect(layoutName(page)).toContainText('default');
  expect(await isDirty(page)).toBe(false);
});

test('a type survives switching between layouts', async ({ page }) => {
  await openTable(page);
  await saveAsNew(page, 'review');
  await hideTags(page);
  await saveAsNew(page, 'planning');

  await setTypeFromPicker(page, 'date', 'string');
  expect(await resolvedType(page, 'date')).toBe('string');

  await openLayouts(page);
  await layoutRows(page).filter({ hasText: 'review' }).locator('.layout-row-name').first().click();
  await page.locator('[data-action="close-layouts-modal"]').click();
  await expect(layoutName(page)).toContainText('review');

  expect(await resolvedType(page, 'date')).toBe('string');
});

test('a type set under the app defaults comes back when the folder is reloaded', async ({ page }) => {
  await openTable(page);
  await setTypeFromPicker(page, 'date', 'string');
  await expect.poll(() => page.evaluate(() => window.__layoutsFileContent)).not.toBe('');

  // The file is carried across in the init script, so this is the same folder opened again.
  const saved = await page.evaluate(() => window.__layoutsFileContent);
  await page.addInitScript(content => { window.__layoutsFileContent = content; }, saved);
  await page.reload();
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  await expect(layoutName(page)).toContainText('default');
  expect(await resolvedType(page, 'date')).toBe('string');
});

// A file from before types moved. Its column entries are simply not read for a type any more, so
// the folder starts with none rather than half-reading an older shape.
test('a type left on a column by an older file is ignored; the propertyTypes object is not', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await setupMockDirectoryWithLayouts(page);
  await page.addInitScript(() => {
    window.__layoutsFileContent = JSON.stringify({
      layoutVersion: 1, active: 'review',
      layouts: { review: { updated: '2026-01-01T00:00:00.000Z', columns: [
        { order: 0, name: 'internalId', label: 'file', width: 90, visible: true, type: 'string' },
        { order: 1, name: 'date', label: 'date', width: 150, visible: true, type: 'string' },
        { order: 2, name: 'people', label: 'people', width: 200, visible: true, type: 'string' },
      ] } },
    });
  });
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  // the schema's answer, not the file's
  expect(await resolvedType(page, 'date')).toBe('date');
  expect(await resolvedType(page, 'people')).toBe('array');

  // and the new object is honoured where the old key is not
  await page.evaluate(async () => {
    const f = await import('/public/js/table-layouts/layout-apply.js');
    f.applyPropertyTypesFromFile({ date: { type: 'string' } });
  });
  expect(await resolvedType(page, 'date')).toBe('string');
});

test('delete all layouts removes the file and returns the table to the defaults', async ({ page }) => {
  await openTable(page);
  await hideTags(page);
  await saveAsNew(page, 'review');
  await setTypeFromPicker(page, 'date', 'string');
  await expect.poll(() => page.evaluate(() => window.__layoutsFileContent)).not.toBe('');

  await openLayouts(page);
  await page.locator('[data-action="layout-clear"]').click();
  await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
  await page.click('[data-action="warning-proceed"]');

  await expect.poll(() => page.evaluate(() => window.__layoutsFileContent)).toBe('');
  expect(await page.evaluate(async () => {
    const { appState } = await import('/public/js/services/store.js');
    return {
      names: appState.tableLayouts.names,
      active: appState.tableLayouts.active,
      types: appState.propertyTypes.size,
    };
  })).toEqual({ names: [], active: null, types: 0 });

  await page.locator('[data-action="close-layouts-modal"]').click();
  await expect(layoutName(page)).toContainText('default');
  // back to the schema's own columns and types: tags is shown again, and date is a date
  await expect(page.locator('.note-table-cell-header[data-property="tags"]')).toHaveCount(1);
  expect(await resolvedType(page, 'date')).toBe('date');
});

test('delete all layouts asks first, and is offered only when there is something to delete', async ({ page }) => {
  await openTable(page);
  await openLayouts(page);
  await expect(page.locator('#layout-clear-btn')).toBeDisabled();
  await page.locator('[data-action="close-layouts-modal"]').click();

  await saveAsNew(page, 'review');
  await openLayouts(page);
  await expect(page.locator('#layout-clear-btn')).toBeEnabled();

  await page.locator('[data-action="layout-clear"]').click();
  await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
  await page.click('[data-action="warning-cancel"]');

  await expect(layoutRows(page).filter({ hasText: 'review' })).toHaveCount(1);
  expect((await layoutsFile(page)).layouts.review).toBeTruthy();
});

// readLayouts() rebuilds the document rather than spreading what it parsed, so any top-level key it
// does not name is dropped — and the next writer, which reads through it first, then writes a file
// without it. Saving a layout is the writer most likely to be reached after a flowchart option is
// set, so it is the one that would have silently thrown the choice away.
test('a flowchart choice and a property type survive each other, and survive saving a layout', async ({ page }) => {
  await openTable(page);
  await setTypeFromPicker(page, 'date', 'string');

  await page.evaluate(async () => {
    const options = await import('/public/js/services/flowchart-options.js');
    const file = await import('/public/js/table-layouts/layout-file.js');
    options.setFlowchartOption('subgraph', 'date');
    await file.saveFlowchartOptions();
  });

  let doc = await layoutsFile(page);
  expect(doc.flowchart).toEqual({ subgraph: 'date' });
  expect(doc.propertyTypes.date).toEqual({ type: 'string' });

  await saveAsNew(page, 'review');

  doc = await layoutsFile(page);
  expect(doc.flowchart).toEqual({ subgraph: 'date' });
  expect(doc.propertyTypes.date).toEqual({ type: 'string' });
  expect(doc.layouts.review).toBeTruthy();
});

test('a flowchart choice comes back when the folder is reloaded, and an unknown role is dropped', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await setupMockDirectoryWithLayouts(page);
  await page.addInitScript(() => {
    window.__layoutsFileContent = JSON.stringify({
      layoutVersion: 2, active: null, layouts: {}, propertyTypes: {},
      flowchart: { subgraph: 'date', nodeText: 'filename', nonsenseRole: 'date' },
    });
  });
  await page.goto('/');
  await loadFolder(page);

  const resolved = await page.evaluate(async () => {
    const m = await import('/public/js/services/flowchart-options.js');
    const store = await import('/public/js/services/store.js');
    return {
      subgraph: m.flowchartProperty('subgraph'),
      nodeText: m.flowchartProperty('nodeText'),
      // untouched by the file, so still the role's own default
      connectors: m.flowchartProperty('connectors'),
      stored: [...store.appState.flowchartOptions.keys()],
    };
  });

  expect(resolved.subgraph).toBe('date');
  expect(resolved.nodeText).toBe('filename');
  expect(resolved.connectors).toBe('internalLink');
  expect(resolved.stored).toEqual(['subgraph', 'nodeText']);
});

test('delete all layouts forgets the flowchart choices too', async ({ page }) => {
  await openTable(page);
  await page.evaluate(async () => {
    const options = await import('/public/js/services/flowchart-options.js');
    const file = await import('/public/js/table-layouts/layout-file.js');
    options.setFlowchartOption('subgraph', 'date');
    await file.saveFlowchartOptions();
  });
  await saveAsNew(page, 'review');

  await openLayouts(page);
  await page.locator('[data-action="layout-clear"]').click();
  await page.click('[data-action="warning-proceed"]');

  await expect.poll(() => page.evaluate(() => window.__layoutsFileContent)).toBe('');
  expect(await page.evaluate(async () => {
    const m = await import('/public/js/services/flowchart-options.js');
    return m.flowchartProperty('subgraph');
  })).toBeNull();
});
