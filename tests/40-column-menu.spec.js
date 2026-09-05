const { test, expect } = require('@playwright/test');
const { loadFolder, showFilenames } = require('./helpers');

// Titles that sort into an obvious, non-alphabetical-by-filename order.
async function setupFiles(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const mk = (n, c) => ({ kind: 'file', name: n,
        getFile: async () => ({ name: n, size: c.length, lastModified: Date.now(), text: async () => c }) });
      const titles = ['Zebra note', 'Alpha note', 'Mango note', 'Delta note'];
      return { kind: 'directory', name: 'root', values: async function* () {
        for (let i = 0; i < titles.length; i++) yield mk(`note-${i}.md`, `# ${titles[i]}\n\nbody #work/project`);
      } };
    };
  });
}

async function openTable(page) {
  await page.setViewportSize({ width: 1000, height: 700 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const menu = page => page.locator('#column-menu');
const titleHeader = page => page.locator('.note-table-cell-header', { hasText: 'title' });

// The trigger is revealed on hover, which on touch means the first tap.
async function openMenuFor(page, header) {
  await header.hover();
  await header.locator('.column-menu-trigger').click();
  await expect(menu(page)).toHaveClass(/visible/);
}

test('the menu opens against the header cell it was launched from', async ({ page }) => {
  await openTable(page);
  const header = titleHeader(page);
  await openMenuFor(page, header);

  expect(await menu(page).getAttribute('data-property')).toBe('title');

  // anchored to the cell: aligned to its left edge, sitting just under its bottom
  const offset = await page.evaluate(() => {
    const m = document.getElementById('column-menu').getBoundingClientRect();
    const c = [...document.querySelectorAll('.note-table-cell-header')]
      .find(el => el.textContent.includes('title')).getBoundingClientRect();
    return { dx: Math.round(m.left - c.left), dy: Math.round(m.top - c.bottom) };
  });
  expect(Math.abs(offset.dx)).toBeLessThanOrEqual(2);
  expect(offset.dy).toBeGreaterThanOrEqual(0);
  expect(offset.dy).toBeLessThanOrEqual(6);

  // and it paints above the sticky header rather than behind it
  expect(await page.evaluate(() => {
    const m = document.getElementById('column-menu').getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(m.left + 20), Math.round(m.top + 10));
    return !!el?.closest('#column-menu');
  })).toBe(true);

  // the three unbuilt options are present but inert
  await expect(menu(page).locator('button[disabled]')).toHaveCount(3);
  await expect(menu(page).locator('button:not([disabled])')).toHaveCount(2);
});

test('sorting from the menu also updates the sort dropdown and direction', async ({ page }) => {
  await openTable(page);
  const header = titleHeader(page);
  const firstTitle = () => page.locator('.note-table .note-table-cell[data-prop="title"]').first().textContent();
  const controls = () => page.evaluate(() => ({
    select: document.getElementById('sort-select').value,
    ascChecked: document.getElementById('sort-direction').checked,
  }));

  await openMenuFor(page, header);
  await page.locator('[data-action="column-sort-asc"]').click();
  await expect.poll(async () => (await firstTitle()).trim()).toBe('Alpha note');
  // the regression this change exists to fix: the controls used to stay on lastModified
  expect(await controls()).toEqual({ select: 'title', ascChecked: true });
  await expect(menu(page)).not.toHaveClass(/visible/);   // acting closes it

  await openMenuFor(page, header);
  await page.locator('[data-action="column-sort-desc"]').click();
  await expect.poll(async () => (await firstTitle()).trim()).toBe('Zebra note');
  expect(await controls()).toEqual({ select: 'title', ascChecked: false });
});

test('the menu is dismissed by Escape, by clicking away, and by a re-render', async ({ page }) => {
  await openTable(page);
  const header = titleHeader(page);

  await openMenuFor(page, header);
  await page.keyboard.press('Escape');
  await expect(menu(page)).not.toHaveClass(/visible/);

  await openMenuFor(page, header);
  await page.locator('#output').click({ position: { x: 5, y: 5 } });
  await expect(menu(page)).not.toHaveClass(/visible/);

  // a full render rebuilds the header, so the cell the menu anchors to disappears
  await openMenuFor(page, header);
  await page.fill('#searchbox', 'Alpha');
  await page.press('#searchbox', 'Enter');
  await expect(menu(page)).not.toHaveClass(/visible/);

  // and the anchor-name is released rather than left on a detached cell
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('.note-table-cell-header')]
      .some(c => c.style.getPropertyValue('anchor-name')))).toBe(false);
});
