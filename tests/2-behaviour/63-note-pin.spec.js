const { test, expect } = require('@playwright/test');
const { loadFolder, setupMockCellWritingFolder, chooseView, sortBy } = require('../helpers');

/**
 * Pinning a note to the top of the order — see plans/completed/note-pinning.md. Pins live in a Set rather than
 * on the file object, so nothing here touches a file and none of it is level 1.
 *
 * The folder holds Alpha (status draft), Beta (status live) and Gamma (no status).
 */

async function openCards(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setupMockCellWritingFolder(page);
  await page.goto('/');
  await loadFolder(page);
  await chooseView(page, 'cards');
  await sortBy(page, 'title', 'asc');
  await expect.poll(() => cardTitles(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
}

const cardTitles = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#output .note-grid [data-prop="title"]')].map(el => el.textContent));

const card = (page, title) => page.locator('#output .note-grid').filter({ hasText: title });

async function pressPin(item) {
  await item.hover();
  await item.locator('.note-pin').click();
}

test('pressing a pin moves the note to the top without opening it, and focus stays on its card', async ({ page }) => {
  await openCards(page);
  await pressPin(card(page, 'Gamma'));

  await expect.poll(() => cardTitles(page)).toEqual(['Gamma', 'Alpha', 'Beta']);
  await expect(card(page, 'Gamma').locator('.note-pin')).toHaveAttribute('data-pinned', '');
  await expect(card(page, 'Alpha').locator('.note-pin')).not.toHaveAttribute('data-pinned', '');
  await expect(page.locator('#file-content-modal')).not.toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() =>
    document.activeElement?.querySelector('[data-prop="title"]')?.textContent)).toBe('Gamma');
});

test('a later sort applies inside the pinned notes and inside the rest, and unpinning goes back', async ({ page }) => {
  await openCards(page);
  await pressPin(card(page, 'Gamma'));
  await pressPin(card(page, 'Beta'));
  await expect.poll(() => cardTitles(page)).toEqual(['Beta', 'Gamma', 'Alpha']);

  await sortBy(page, 'title', 'desc');
  await expect.poll(() => cardTitles(page)).toEqual(['Gamma', 'Beta', 'Alpha']);

  // A missing value still goes last — inside its own group. Gamma has no status.
  await sortBy(page, 'status', 'asc');
  await expect.poll(() => cardTitles(page)).toEqual(['Beta', 'Gamma', 'Alpha']);

  await sortBy(page, 'title', 'asc');
  await pressPin(card(page, 'Gamma'));
  await pressPin(card(page, 'Beta'));
  await expect.poll(() => cardTitles(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
});

test('a save does not unpin, and table and list view mark the pinned note', async ({ page }) => {
  await openCards(page);
  await pressPin(card(page, 'Gamma'));

  await chooseView(page, 'table');
  const rowTitles = () => page.evaluate(() => [...document.querySelectorAll('.note-table[data-vt-id]')]
    .map(row => row.querySelector('[data-prop="title"]').textContent));
  await expect.poll(rowTitles).toEqual(['Gamma', 'Alpha', 'Beta']);
  const gammaRow = page.locator('.note-table').filter({ hasText: 'Gamma' }).first();
  await expect(gammaRow.locator('[data-prop="internalId"] .pin-mark')).toHaveCount(1);
  await expect(page.locator('.note-table .pin-mark')).toHaveCount(1);

  // A write replaces the file object; the pin is keyed by id, so it survives. (Beta's front matter
  // does not read cleanly, so its cells are locked.)
  const status = gammaRow.locator('.note-table-cell[data-prop="status"]');
  await status.click();
  await status.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('done');
  await page.locator('#searchbox').click();
  await expect.poll(() => page.evaluate(() => window.__files['gamma.md'])).toContain('status: done');
  await expect.poll(rowTitles).toEqual(['Gamma', 'Alpha', 'Beta']);
  await expect(page.locator('.note-table .pin-mark')).toHaveCount(1);

  await chooseView(page, 'list');
  const entry = page.locator('.list-view > li').filter({ hasText: 'gamma.md' });
  await expect(entry.locator('summary [data-prop="filename"] + .pin-mark')).toHaveCount(1);
  await expect(page.locator('.list-view .pin-mark')).toHaveCount(1);
});

test('search view pins too, without opening the note', async ({ page }) => {
  await openCards(page);
  await chooseView(page, 'search');
  const searchTitles = () => page.evaluate(() =>
    [...document.querySelectorAll('#output .search-view-item .note-search p')].map(el => el.textContent));
  await expect.poll(searchTitles).toEqual(['Alpha', 'Beta', 'Gamma']);

  await pressPin(page.locator('#output .search-view-item').filter({ hasText: 'Gamma' }));
  await expect.poll(searchTitles).toEqual(['Gamma', 'Alpha', 'Beta']);
  await expect(page.locator('#file-content-modal')).not.toHaveAttribute('open', '');
});
