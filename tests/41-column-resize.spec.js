const { test, expect } = require('@playwright/test');
const { loadFolder, showFilenames } = require('./helpers');

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

async function openTable(page, width = 1000) {
  await page.setViewportSize({ width, height: 700 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const bar = page => page.locator('#column-resizer');
const titleHeader = page => page.locator('.note-table-cell-header', { hasText: 'title' });

/** Two clicks on the header cell open its menu; the third click picks "resize column". */
async function activateResizer(page, header) {
  await header.click();
  await header.click();
  await expect(page.locator('#column-menu')).toBeVisible();
  await page.locator('[data-action="column-resize"]').click();
  await expect(bar(page)).toBeVisible();
}

/** The header cell's width, which the body cells share via the same grid tracks. */
const titleWidth = page => page.evaluate(() =>
  [...document.querySelectorAll('.note-table-cell-header')]
    .find(el => el.dataset.property === 'title').getBoundingClientRect().width);

const barBox = page => page.evaluate(() => {
  const b = document.getElementById('column-resizer').getBoundingClientRect();
  return { left: b.left, top: b.top, width: b.width, height: b.height };
});

test('dragging widens the column, and the release hides the resizer', async ({ page }) => {
  await openTable(page);
  await activateResizer(page, titleHeader(page));

  const startWidth = await titleWidth(page);
  const b = await barBox(page);
  const x = b.left + b.width / 2;
  const y = b.top + b.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y, { steps: 10 });

  // it tracks the pointer mid-drag, and is still on screen
  await expect(bar(page)).toBeVisible();
  expect(await titleWidth(page)).toBeCloseTo(startWidth + 100, 0);

  // the body cells moved with it — one grid, one set of tracks
  const cellWidth = await page.evaluate(() =>
    document.querySelector('.list-table .note-table-cell[data-prop="title"]').getBoundingClientRect().width);
  expect(cellWidth).toBeCloseTo(startWidth + 100, 0);

  await page.mouse.up();
  await expect(bar(page)).toBeHidden();
  expect(await titleWidth(page)).toBeCloseTo(startWidth + 100, 0);
});

test('a dragged width survives a re-render', async ({ page }) => {
  await openTable(page);
  await activateResizer(page, titleHeader(page));

  const startWidth = await titleWidth(page);
  const b = await barBox(page);
  await page.mouse.move(b.left + b.width / 2, b.top + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.left + b.width / 2 + 80, b.top + b.height / 2, { steps: 5 });
  await page.mouse.up();

  const dragged = await titleWidth(page);
  expect(dragged).toBeCloseTo(startWidth + 80, 0);

  // sorting re-renders and rebuilds the header from the schema defaults
  const header = titleHeader(page);
  await header.click();
  await header.click();
  await page.locator('[data-action="column-sort-desc"]').click();
  await expect.poll(() => titleWidth(page)).toBeCloseTo(dragged, 0);

  // and so does switching away and back
  await page.selectOption('#view-select', 'cards');
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
  await expect.poll(() => titleWidth(page)).toBeCloseTo(dragged, 0);
});
