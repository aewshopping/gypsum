const { test, expect } = require('@playwright/test');
const { loadFolder, showFilenames } = require('./helpers');

// Titles long enough that a cell cannot show them at its column width.
async function setupLongTitles(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const mk = (name, content) => ({ kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }) });
      return { kind: 'directory', name: 'root', values: async function* () {
        for (let i = 1; i <= 30; i++) {
          yield mk(`note-${String(i).padStart(2, '0')}.md`,
            `# Note ${i} with a deliberately long title that will not fit inside one table cell\n\nbody #work/project`);
        }
      } };
    };
  });
}

async function openTable(page) {
  await page.setViewportSize({ width: 1100, height: 650 });
  await setupLongTitles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const boxOf = locator => locator.evaluate(el => {
  const r = el.getBoundingClientRect();
  return {
    width: Math.round(r.width),
    height: Math.round(r.height),
    rowHeight: Math.round(el.parentElement.getBoundingClientRect().height),
    neighbourWidth: Math.round(el.nextElementSibling.getBoundingClientRect().width),
  };
});

test('a cell expands on the second click, downward and within its own column', async ({ page }) => {
  await openTable(page);
  const cell = page.locator('.note-table .note-table-cell[data-prop="title"]').nth(2);
  const collapsed = await boxOf(cell);

  await cell.click();
  await expect(cell).toHaveClass(/is-selected/);
  expect(await boxOf(cell)).toEqual(collapsed);   // selecting alone changes no geometry

  await cell.click();
  await expect(cell).toHaveClass(/is-expanded/);
  const expanded = await boxOf(cell);

  expect(expanded.height).toBeGreaterThan(collapsed.height);  // grew vertically
  expect(expanded.width).toBe(collapsed.width);               // but not horizontally
  expect(expanded.rowHeight).toBe(collapsed.rowHeight);       // the row did not grow with it
  expect(expanded.neighbourWidth).toBe(collapsed.neighbourWidth); // siblings did not shift

  await cell.click();
  await expect(cell).toHaveClass(/is-selected/);
  expect(await boxOf(cell)).toEqual(collapsed);
});

test('an expanded cell is dismissed by clicking away and by Escape', async ({ page }) => {
  await openTable(page);
  const cell = page.locator('.note-table .note-table-cell[data-prop="title"]').nth(2);

  await cell.click(); await cell.click();
  await expect(cell).toHaveClass(/is-expanded/);
  await page.locator('.note-table-header').click();
  await expect(page.locator('.note-table-cell.is-expanded')).toHaveCount(0);
  await expect(page.locator('.note-table-cell.is-selected')).toHaveCount(0);

  await cell.click(); await cell.click();
  await expect(cell).toHaveClass(/is-expanded/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.note-table-cell.is-expanded')).toHaveCount(0);
});

test('a cell with no room below flips upward, and the header stays above it', async ({ page }) => {
  await openTable(page);

  // the last row would otherwise push the expanded cell past the table's bottom edge,
  // extending its scrollable area and raising a vertical scrollbar
  const scrollBefore = await page.evaluate(() => document.querySelector('.list-table').scrollHeight);
  const lastCell = page.locator('.note-table .note-table-cell[data-prop="title"]').last();
  await lastCell.click(); await lastCell.click();

  await expect(lastCell).toHaveClass(/flip-up/);
  expect(await page.evaluate(() => document.querySelector('.list-table').scrollHeight)).toBe(scrollBefore);

  // and an expanded cell must pass under the sticky header, not over it
  const midCell = page.locator('.note-table .note-table-cell[data-prop="title"]').nth(8);
  await midCell.click(); await midCell.click();
  await page.evaluate(() => {
    const c = document.querySelector('.note-table-cell.is-expanded');
    document.scrollingElement.scrollTop = c.getBoundingClientRect().top + window.scrollY - 60;
  });
  await expect.poll(() => page.evaluate(() => {
    const c = document.querySelector('.note-table-cell.is-expanded').getBoundingClientRect();
    const chrome = document.querySelector('.table-chrome');
    const ch = chrome.getBoundingClientRect();
    if (!(c.top < ch.bottom && c.bottom > ch.top)) return 'no-overlap';
    const el = document.elementFromPoint(Math.round(c.left + 20), Math.round(ch.bottom - 4));
    return chrome.contains(el) ? 'header-on-top' : 'cell-on-top';
  })).toBe('header-on-top');
});
