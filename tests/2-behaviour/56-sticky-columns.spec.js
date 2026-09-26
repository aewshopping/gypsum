const { test, expect } = require('@playwright/test');
const { loadFolder, setupMockDirectoryWithLayouts } = require('../helpers');

// Narrow, so the table has somewhere to scroll sideways to.
async function openTable(page) {
  await page.setViewportSize({ width: 700, height: 700 });
  await setupMockDirectoryWithLayouts(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const header = (page, prop) => page.locator(`.note-table-cell-header[data-property="${prop}"]`);
const cell = (page, prop) => page.locator(`.note-table`).first().locator(`.note-table-cell[data-prop="${prop}"]`);
const stuckHeaders = page => page.$$eval('.note-table-cell-header.is-sticky', els => els.map(e => e.dataset.property));
const layoutsFile = page => page.evaluate(() => JSON.parse(window.__layoutsFileContent || '{}'));

async function stickTo(page, prop) {
  await header(page, prop).click();
  await header(page, prop).click();
  await page.click('[data-action="column-stick"]');
}

/** Scrolls the table without anything else moving focus or the page. */
const scrollTable = (page, x) => page.locator('.list-table').evaluate((el, left) => { el.scrollLeft = left; }, x);

/** Where an element is drawn, less where the table starts: its x within the visible table. */
const drawnAt = locator => locator.evaluate(el =>
  Math.round(el.getBoundingClientRect().left - document.querySelector('.table-wrapper').getBoundingClientRect().left));
/** Where a column sits in the unscrolled table. Read off the heading: the header is moved by a
    transform, which offsetLeft ignores, where a stuck cell's offsetLeft already includes its stick. */
const laidOutAt = (page, prop) => header(page, prop).evaluate(el => el.offsetLeft);

test('stuck columns, heading and cells alike, stay put while the table scrolls sideways', async ({ page }) => {
  await openTable(page);
  await stickTo(page, 'title');

  await scrollTable(page, 250);
  const scrolled = await page.locator('.list-table').evaluate(el => el.scrollLeft);
  expect(scrolled).toBe(250);

  // Stuck: drawn where the unscrolled table has them. The header is moved rather than scrolled,
  // so its stuck heading is moved back on the same timeline — the one part of this the browser
  // does not do natively.
  const title = await laidOutAt(page, 'title');
  for (const locator of [header(page, 'title'), cell(page, 'title')]) {
    await expect.poll(() => drawnAt(locator)).toBe(title);
  }

  // Not stuck: scrolled with the table, heading and cells together.
  const tags = await laidOutAt(page, 'tags');
  for (const locator of [header(page, 'tags'), cell(page, 'tags')]) {
    await expect.poll(() => drawnAt(locator)).toBe(tags - scrolled);
  }
});

test('the count sticks whatever is first, so it follows the arrangement', async ({ page }) => {
  await openTable(page);
  await stickTo(page, 'title');
  expect(await stuckHeaders(page)).toEqual(['internalId', 'filename', 'title']);

  // Hiding a stuck column hands its place to the next one along.
  await header(page, 'filename').click();
  await header(page, 'filename').click();
  await page.click('[data-action="column-hide"]');
  expect(await stuckHeaders(page)).toEqual(['internalId', 'title', 'tags']);
});

test('focus reaches a cell under the stuck columns by scrolling it clear, and never scrolls for a stuck one', async ({ page }) => {
  await openTable(page);
  await stickTo(page, 'title');
  await scrollTable(page, 250);

  // Focusing a stuck cell must not scroll: it is on screen already, whatever the browser thinks.
  await cell(page, 'title').evaluate(el => el.focus());
  expect(await page.locator('.list-table').evaluate(el => el.scrollLeft)).toBe(250);

  // tags is underneath the stuck columns, which the browser counts as on screen.
  await cell(page, 'tags').evaluate(el => el.focus());
  const paneRight = await cell(page, 'title').evaluate(el => Math.round(el.getBoundingClientRect().right));
  await expect.poll(() => cell(page, 'tags').evaluate(el => Math.round(el.getBoundingClientRect().left))).toBe(paneRight);
});

test('the count is saved with the layout and goes back to none under the defaults', async ({ page }) => {
  await openTable(page);
  await stickTo(page, 'title');

  await page.locator('#layout-name').click();
  await page.locator('[data-action="layout-save-as"]').click();
  await page.keyboard.type('stuck');
  await page.keyboard.press('Enter');
  await page.locator('[data-action="close-layouts-modal"]').click();

  expect((await layoutsFile(page)).layouts.stuck.stickyColumns).toBe(3);

  await header(page, 'title').click();
  await header(page, 'title').click();
  await page.click('[data-action="column-unstick"]');
  expect(await stuckHeaders(page)).toEqual([]);

  // Reading the layout back puts the count back.
  await page.evaluate(async () => {
    const { applyActiveLayout } = await import('/public/js/table-layouts/layout-file.js');
    const { renderFiles } = await import('/public/js/ui/ui-functions-render/a-render-all-files.js');
    await applyActiveLayout();
    renderFiles();
  });
  expect(await stuckHeaders(page)).toEqual(['internalId', 'filename', 'title']);

  await page.evaluate(async () => {
    const { setActiveLayout } = await import('/public/js/table-layouts/layout-file.js');
    const { renderFiles } = await import('/public/js/ui/ui-functions-render/a-render-all-files.js');
    await setActiveLayout(null);
    renderFiles();
  });
  expect(await stuckHeaders(page)).toEqual([]);
});
