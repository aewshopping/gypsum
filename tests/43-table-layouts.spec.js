const { test, expect } = require('@playwright/test');
const { loadFolder, setupMockDirectoryWithLayouts } = require('./helpers');

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

const layoutName = page => page.locator('.table-controls [data-action="open-layouts-modal"]');
const saveBtn = page => page.locator('.table-controls [data-action="layout-save"]');
const modal = page => page.locator('#modal-layouts');
const layoutRows = page => page.locator('#layout-list .layout-row');
const pickerRows = page => page.locator('#column-picker-list .info-modal-row');

async function openLayouts(page) {
  await layoutName(page).click();
  await expect(modal(page)).toBeVisible();
}

/** Renames the row currently in edit mode by typing over it and committing with Enter. */
async function typeName(page, name) {
  const input = page.locator('#layout-list .layout-row-input:not([hidden])');
  await expect(input).toBeFocused();
  await input.fill(name);
  await input.press('Enter');
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
  expect(doc.layoutVersion).toBe(1);

  const columns = doc.layouts.review.columns;
  // Hidden columns are written too, with their place and width, so switching one back on
  // returns it where it was.
  expect(columns.find(c => c.name === 'tags').visible).toBe(false);
  expect(columns.find(c => c.name === 'title').visible).toBe(true);

  // Every column carries all of its metrics, none inferred.
  for (const column of columns) {
    expect(typeof column.label).toBe('string');
    expect(Number.isFinite(column.width)).toBe(true);
    expect(typeof column.visible).toBe('boolean');
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
  await saveBtn(page).click();
  await page.waitForTimeout(150);

  const doc = await layoutsFile(page);
  expect(Object.keys(doc.layouts)).toEqual(['review']);   // saved over, not saved as another
  expect(doc.layouts.review.columns.find(c => c.name === 'tags').visible).toBe(false);
});

test('unsaved column changes are discarded when the layout is reloaded', async ({ page }) => {
  await openTable(page);
  await saveAsNew(page, 'review');
  await hideTags(page);

  // Switching away and back re-reads the layout, which never saw the change.
  await openLayouts(page);
  await modal(page).locator('.layout-row-name[data-layout=""]').click();
  await expect(layoutName(page)).toContainText('default');

  await openLayouts(page);
  await modal(page).locator('.layout-row-name[data-layout="review"]').click();
  await expect(layoutName(page)).toContainText('review');

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

  // A column the layout hides stays hidden; one it never mentions is appended, still visible.
  await expect(page.locator('.note-table-cell-header[data-property="tags"]')).toHaveCount(0);
  await expect(page.locator('.note-table-cell-header[data-property="filename"]')).toHaveCount(1);
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

test('the menu switches layouts, and app defaults restores the schema order', async ({ page }) => {
  await openTable(page);

  // Make a layout to switch away from and back to.
  await hideTags(page);
  await saveAsNew(page, 'review');

  await openLayouts(page);

  // Both entries are listed, with the active one marked.
  await expect(layoutRows(page)).toHaveCount(2);
  await expect(modal(page).locator('.layout-row-name[data-layout="review"]'))
    .toHaveAttribute('aria-checked', 'true');

  await modal(page).locator('.layout-row-name[data-layout=""]').click();

  await expect(layoutName(page)).toContainText('default');
  await expect(page.locator('.note-table-cell-header[data-property="tags"]')).toHaveCount(1);

  const doc = await layoutsFile(page);
  expect(doc.active).toBe(null);
  expect(Object.keys(doc.layouts)).toEqual(['review']);   // switching away does not delete it
});

test('rename and delete act on the active layout', async ({ page }) => {
  await openTable(page);

  await hideTags(page);
  await saveAsNew(page, 'draft');

  // rename, in the row itself
  await openLayouts(page);
  await modal(page).locator('[data-action="layout-edit-name"][data-layout="draft"]').click();
  await typeName(page, 'review');

  await expect(modal(page).locator('.layout-row-name[data-layout="review"]')).toBeVisible();
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

test('the defaults row carries no edit or delete icons', async ({ page }) => {
  await openTable(page);
  await saveAsNew(page, 'review');
  await openLayouts(page);

  // Nothing behind the defaults to rename or remove, so the icons are absent rather than disabled.
  const defaults = layoutRows(page).filter({ has: page.locator('[data-layout=""]') });
  await expect(defaults.locator('[data-action="layout-edit-name"]')).toHaveCount(0);
  await expect(defaults.locator('[data-action="layout-delete"]')).toHaveCount(0);

  // A saved layout has both.
  const saved = layoutRows(page).filter({ has: page.locator('[data-layout="review"]') });
  await expect(saved.locator('[data-action="layout-edit-name"]')).toHaveCount(1);
  await expect(saved.locator('[data-action="layout-delete"]')).toHaveCount(1);
});

test('save on the defaults makes a layout and hands over its name', async ({ page }) => {
  await openTable(page);
  await hideTags(page);

  // There is no layout to save over, so save creates one, opens the modal and puts the cursor in
  // the new name. The button still says "save".
  await expect(saveBtn(page)).toHaveText('save');
  await saveBtn(page).click();

  await expect(modal(page)).toBeVisible();
  const input = page.locator('#layout-list .layout-row-input:not([hidden])');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('layout-1');

  // The columns as they stood are what got saved.
  const doc = await layoutsFile(page);
  expect(doc.active).toBe('layout-1');
  expect(doc.layouts['layout-1'].columns.find(c => c.name === 'tags').visible).toBe(false);

  // Typing over the offered name renames it in place.
  await typeName(page, 'review');
  await expect(modal(page).locator('.layout-row-name[data-layout="review"]')).toBeVisible();
  expect(Object.keys((await layoutsFile(page)).layouts)).toEqual(['review']);
});

test('the offered name skips ones already taken', async ({ page }) => {
  await openTable(page);
  await saveAsNew(page, 'layout-1');

  await openLayouts(page);
  await modal(page).locator('[data-action="layout-save-as"]').click();

  await expect(page.locator('#layout-list .layout-row-input:not([hidden])')).toHaveValue('layout-2');
});

test('renaming to a name already taken leaves the layout alone', async ({ page }) => {
  await openTable(page);
  await saveAsNew(page, 'wide');
  await saveAsNew(page, 'review');

  await openLayouts(page);
  await modal(page).locator('[data-action="layout-edit-name"][data-layout="review"]').click();
  await typeName(page, 'wide');

  // The row goes back to what it was; neither layout is replaced.
  await expect(modal(page).locator('.layout-row-name[data-layout="review"]')).toBeVisible();
  expect(Object.keys((await layoutsFile(page)).layouts).sort()).toEqual(['review', 'wide']);
});

test('Escape abandons a rename without closing the modal', async ({ page }) => {
  await openTable(page);
  await saveAsNew(page, 'review');

  await openLayouts(page);
  await modal(page).locator('[data-action="layout-edit-name"][data-layout="review"]').click();
  const input = page.locator('#layout-list .layout-row-input:not([hidden])');
  await input.fill('something else');
  await input.press('Escape');

  await expect(modal(page)).toBeVisible();
  await expect(modal(page).locator('.layout-row-name[data-layout="review"]')).toBeVisible();
  expect(Object.keys((await layoutsFile(page)).layouts)).toEqual(['review']);
});
