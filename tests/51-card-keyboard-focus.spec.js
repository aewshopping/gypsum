const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder } = require('./helpers');

/**
 * A card has no selected state of its own, so focus is the only thing saying "you are here".
 *
 * Restoring focus after a re-render is programmatic, and a programmatic focus that follows a mouse
 * click is never :focus-visible — so filtering with the pointer took the mark off the card the
 * keyboard was on, while the keyboard kept navigating from it. Both card views draw the same card,
 * so both are checked here.
 */
const cardState = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el?.classList?.contains('note-grid')) return { card: false, what: el?.tagName ?? 'none' };
  const style = getComputedStyle(el);
  return { card: true, id: el.dataset.vtId, style: style.outlineStyle, width: style.outlineWidth };
});

for (const view of ['cards', 'peek']) {
  test(`the focused card keeps its mark through a filter in ${view} view`, async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFolder(page);
    await page.selectOption('#view-select', view);
    await expect(page.locator('.note-grid').first()).toBeVisible();

    await page.locator('.note-grid.keyboard-navigable').first().focus();
    await page.keyboard.press('ArrowRight');
    expect(await cardState(page)).toMatchObject({ card: true, style: 'solid', width: '3px' });

    // filtered with the pointer, which is what used to take the mark away
    await page.locator('[data-action="tag-filter"]').first().click();
    await page.waitForTimeout(1200);

    expect(await cardState(page)).toMatchObject({ card: true, style: 'solid', width: '3px' });
  });
}

test('a table cell keeps the ring for the keyboard alone', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  // A cell wears the selection outline as well, so ringing every clicked one would say the same
  // thing twice — the ring stays :focus-visible there, which a click is not. One mark, 2px, inset.
  const cell = page.locator('.note-table-cell[data-prop="title"]').first();
  await cell.click();

  await expect(cell).toHaveClass(/is-selected/);
  expect(await cell.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');

  // and it is the selection that the arrow keys carry, so there is still one mark afterwards
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.note-table-cell.is-selected')).toHaveCount(1);
  expect(await page.evaluate(() => getComputedStyle(
    document.querySelector('.note-table-cell.is-selected')).outlineWidth)).toBe('2px');
});
