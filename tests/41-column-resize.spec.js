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

test('the resizer appears on the column edge, with its tooltip, and nothing else dismisses it', async ({ page }) => {
  await openTable(page);
  const header = titleHeader(page);
  await activateResizer(page, header);

  // the menu closed behind it
  await expect(page.locator('#column-menu')).toBeHidden();

  // centred on the cell's right edge, and exactly as tall as the cell
  const { bar: b, cell: c } = await page.evaluate(() => {
    const bb = document.getElementById('column-resizer').getBoundingClientRect();
    const cc = [...document.querySelectorAll('.note-table-cell-header')]
      .find(el => el.dataset.property === 'title').getBoundingClientRect();
    return { bar: { left: bb.left, top: bb.top, width: bb.width, height: bb.height }, cell: { right: cc.right, top: cc.top, height: cc.height } };
  });
  expect(Math.abs((b.left + b.width / 2) - c.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(b.top - c.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(b.height - c.height)).toBeLessThanOrEqual(1);
  expect(b.width).toBeGreaterThan(2);
  expect(b.width).toBeLessThanOrEqual(8);

  // the tooltip is up without anyone having hovered it
  await expect(page.locator('#tooltip')).toHaveClass(/visible/);
  await expect(page.locator('#tooltip')).toHaveText('drag to resize');

  // it paints above the sticky header rather than behind it
  expect(await page.evaluate(() => {
    const b = document.getElementById('column-resizer').getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    return el?.id === 'column-resizer';
  })).toBe(true);

  // Escape and a click elsewhere leave it exactly where it is — only a drag puts it away
  await page.keyboard.press('Escape');
  await expect(bar(page)).toBeVisible();
  await page.locator('#searchbox').click();
  await expect(bar(page)).toBeVisible();
});

test('the resizer stays glued to its column edge while the table scrolls sideways', async ({ page }) => {
  await openTable(page, 600);
  await activateResizer(page, titleHeader(page));

  const before = await barBox(page);
  await page.evaluate(() => { document.querySelector('.list-table').scrollLeft = 120; });
  await expect.poll(async () => Math.round((await barBox(page)).left)).not.toBe(Math.round(before.left));

  const after = await page.evaluate(() => {
    const b = document.getElementById('column-resizer').getBoundingClientRect();
    const c = [...document.querySelectorAll('.note-table-cell-header')]
      .find(el => el.dataset.property === 'title').getBoundingClientRect();
    return Math.abs((b.left + b.width / 2) - c.right);
  });
  expect(after).toBeLessThanOrEqual(1);
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

test('the resizer follows its column across a re-render, and goes when the column does', async ({ page }) => {
  await openTable(page);
  await activateResizer(page, titleHeader(page));
  const before = await barBox(page);

  // sorting rebuilds the header; the bar moves to the same column's new cell
  const header = titleHeader(page);
  await header.click();
  await header.click();
  await page.locator('[data-action="column-sort-desc"]').click();
  await expect(bar(page)).toBeVisible();
  await expect.poll(async () => Math.round((await barBox(page)).left)).toBe(Math.round(before.left));

  // a filter matching nothing takes the table away, and the bar with it
  await page.locator('#searchbox').fill('zzzznotathing');
  await page.locator('#searchbox').press('Enter');
  await expect(page.locator('.empty-state')).toBeVisible();
  await expect(bar(page)).toBeHidden();
});

test('the resizer does not outlive a switch to another view', async ({ page }) => {
  await openTable(page);
  await activateResizer(page, titleHeader(page));
  await expect(bar(page)).toBeVisible();

  await page.selectOption('#view-select', 'cards');
  await expect(bar(page)).toBeHidden();
});

test('a drag past the minimum clamps rather than collapsing the column', async ({ page }) => {
  await openTable(page);
  await activateResizer(page, titleHeader(page));

  const b = await barBox(page);
  const y = b.top + b.height / 2;
  await page.mouse.move(b.left + b.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(10, y, { steps: 10 });
  await page.mouse.up();

  expect(await titleWidth(page)).toBeCloseTo(48, 0); // MIN_COLUMN_WIDTH
});

test('a touch drag resizes the column on a phone-width screen', async ({ page }) => {
  await openTable(page, 400);

  // the menu is a bottom sheet here, but the route to the resizer is the same
  const header = titleHeader(page);
  await header.click();
  await header.click();
  await page.locator('[data-action="column-resize"]').click();
  await expect(bar(page)).toBeVisible();

  const startWidth = await titleWidth(page);
  const b = await barBox(page);

  await page.evaluate(({ x, y }) => {
    const el = document.getElementById('column-resizer');
    const ev = (type, clientX) => new PointerEvent(type, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX, clientY: y,
    });
    el.setPointerCapture = () => {}; // synthetic events carry no real capture target
    el.dispatchEvent(ev('pointerdown', x));
    el.dispatchEvent(ev('pointermove', x + 60));
    el.dispatchEvent(ev('pointerup', x + 60));
  }, { x: b.left + b.width / 2, y: b.top + b.height / 2 });

  expect(await titleWidth(page)).toBeCloseTo(startWidth + 60, 0);
  await expect(bar(page)).toBeHidden();
});
