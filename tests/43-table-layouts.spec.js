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

const layoutName = page => page.locator('#layout-menu-btn');
const menu = page => page.locator('#layout-menu');
const pickerRows = page => page.locator('#column-picker-list .info-modal-row');

async function openPicker(page) {
  await page.click('[data-action="open-column-picker"]');
  await expect(page.locator('#modal-columns')).toBeVisible();
}

test('a folder with no saved layout shows the app defaults and writes nothing', async ({ page }) => {
  await openTable(page);

  await expect(layoutName(page)).toContainText('app defaults');
  expect(await page.evaluate(() => window.__layoutsFileContent)).toBe('');
});

test('dismissing the column picker unchanged does not create a layout', async ({ page }) => {
  await openTable(page);
  await openPicker(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-columns')).toBeHidden();

  // The write is fire-and-forget, so give it a moment to have happened if it were going to.
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__layoutsFileContent)).toBe('');
  await expect(layoutName(page)).toContainText('app defaults');
});

test('hiding a column creates a layout and writes every column to it', async ({ page }) => {
  await openTable(page);
  await openPicker(page);

  const tagsToggle = pickerRows(page).filter({ hasText: 'tags' }).locator('input.toggle');
  await tagsToggle.uncheck();
  await page.keyboard.press('Escape');

  await expect(layoutName(page)).toContainText('untitled');

  const doc = await layoutsFile(page);
  expect(doc.active).toBe('untitled');
  expect(doc.layoutVersion).toBe(1);

  const columns = doc.layouts.untitled.columns;
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

  // Make a layout by hiding a column, so there is something to switch away from and back to.
  await openPicker(page);
  await pickerRows(page).filter({ hasText: 'tags' }).locator('input.toggle').uncheck();
  await page.keyboard.press('Escape');
  await expect(layoutName(page)).toContainText('untitled');
  await expect(page.locator('.note-table-cell-header[data-property="tags"]')).toHaveCount(0);

  await layoutName(page).click();
  await expect(menu(page)).toBeVisible();

  // Both entries are listed, with the active one marked.
  await expect(menu(page).locator('[data-action="layout-select"]')).toHaveCount(2);
  await expect(menu(page).locator('[data-layout="untitled"]')).toHaveAttribute('aria-checked', 'true');

  await menu(page).locator('[data-layout=""]').click();

  await expect(layoutName(page)).toContainText('app defaults');
  await expect(page.locator('.note-table-cell-header[data-property="tags"]')).toHaveCount(1);

  const doc = await layoutsFile(page);
  expect(doc.active).toBe(null);
  expect(Object.keys(doc.layouts)).toEqual(['untitled']);   // switching away does not delete it
});

test('rename and delete act on the active layout', async ({ page }) => {
  await openTable(page);

  await openPicker(page);
  await pickerRows(page).filter({ hasText: 'tags' }).locator('input.toggle').uncheck();
  await page.keyboard.press('Escape');
  await expect(layoutName(page)).toContainText('untitled');

  // rename
  await layoutName(page).click();
  await menu(page).locator('[data-action="layout-rename"]').click();
  await expect(page.locator('#modal-layout-name')).toBeVisible();
  await page.fill('#layout-name-input', 'review');
  await page.click('[data-action="layout-name-confirm"]');

  await expect(layoutName(page)).toContainText('review');
  expect(Object.keys((await layoutsFile(page)).layouts)).toEqual(['review']);

  // delete, which asks first and then hands back to the app defaults
  await layoutName(page).click();
  await menu(page).locator('[data-action="layout-delete"]').click();
  await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
  await page.click('[data-action="warning-proceed"]');

  await expect(layoutName(page)).toContainText('app defaults');
  expect((await layoutsFile(page)).layouts).toEqual({});

  // Deleting the record of an arrangement does not disturb the arrangement.
  await expect(page.locator('.note-table-cell-header[data-property="tags"]')).toHaveCount(0);
});

test('rename and delete are disabled on the app defaults', async ({ page }) => {
  await openTable(page);
  await layoutName(page).click();

  await expect(menu(page).locator('[data-action="layout-rename"]')).toBeDisabled();
  await expect(menu(page).locator('[data-action="layout-delete"]')).toBeDisabled();
  await expect(menu(page).locator('[data-action="layout-save-as"]')).toBeEnabled();
});

test('a duplicate layout name is refused rather than silently replacing one', async ({ page }) => {
  await openTable(page);

  await layoutName(page).click();
  await menu(page).locator('[data-action="layout-save-as"]').click();
  await page.fill('#layout-name-input', 'wide');
  await page.click('[data-action="layout-name-confirm"]');
  await expect(layoutName(page)).toContainText('wide');

  await layoutName(page).click();
  await menu(page).locator('[data-action="layout-save-as"]').click();
  await page.fill('#layout-name-input', 'wide');
  await page.click('[data-action="layout-name-confirm"]');

  await expect(page.locator('#layout-name-error')).toBeVisible();
  await expect(page.locator('#modal-layout-name')).toBeVisible();   // still open, nothing saved
  expect(Object.keys((await layoutsFile(page)).layouts)).toEqual(['wide']);
});
