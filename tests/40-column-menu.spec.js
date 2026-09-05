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
  await expect(menu(page)).toBeVisible();
}

test('the menu opens against the header cell it was launched from', async ({ page }) => {
  await openTable(page);
  const header = titleHeader(page);
  await openMenuFor(page, header);

  expect(await menu(page).getAttribute('data-property')).toBe('title');

  // hangs off the column's right edge, flush with the bottom of the header
  const offset = await page.evaluate(() => {
    const m = document.getElementById('column-menu').getBoundingClientRect();
    const c = [...document.querySelectorAll('.note-table-cell-header')]
      .find(el => el.textContent.includes('title')).getBoundingClientRect();
    return { dx: Math.round(m.right - c.right), dy: Math.round(m.top - c.bottom) };
  });
  expect(Math.abs(offset.dx)).toBeLessThanOrEqual(1);
  expect(Math.abs(offset.dy)).toBeLessThanOrEqual(1);

  // square where it meets the header, rounded elsewhere
  expect(await menu(page).evaluate(el => getComputedStyle(el).borderTopRightRadius)).toBe('0px');

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
  await expect(menu(page)).toBeHidden();   // acting closes it

  await openMenuFor(page, header);
  await page.locator('[data-action="column-sort-desc"]').click();
  await expect.poll(async () => (await firstTitle()).trim()).toBe('Zebra note');
  expect(await controls()).toEqual({ select: 'title', ascChecked: false });
});

test('the menu is dismissed by Escape, by clicking away, and by a re-render', async ({ page }) => {
  await openTable(page);
  const header = titleHeader(page);

  // Escape and click-away are the popover's own light dismiss, not our code
  await openMenuFor(page, header);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();

  await openMenuFor(page, header);
  await page.locator('#output').click({ position: { x: 5, y: 5 } });
  await expect(menu(page)).toBeHidden();

  // a full render rebuilds the header, so the cell the menu points at disappears
  await openMenuFor(page, header);
  await page.fill('#searchbox', 'Alpha');
  await page.press('#searchbox', 'Enter');
  await expect(menu(page)).toBeHidden();
});

test('the menu follows its column when the table is scrolled sideways', async ({ page }) => {
  // wide enough that the menu never needs an edge-of-viewport fallback, so alignment is
  // the only thing under test here
  await page.setViewportSize({ width: 900, height: 700 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  // The header is moved by a scroll-driven transform, and anchor positioning resolves
  // against the pre-transform box — hence the proxy the menu actually anchors to.
  for (const scrollLeft of [0, 100, 99999]) {
    await page.evaluate(x => { document.querySelector('.list-table').scrollLeft = x; }, scrollLeft);
    const header = page.locator('.note-table-cell-header').last();
    await openMenuFor(page, header);

    await expect.poll(() => page.evaluate(() => {
      const m = document.getElementById('column-menu').getBoundingClientRect();
      const prop = document.getElementById('column-menu').dataset.property;
      const c = [...document.querySelectorAll('.note-table-cell-header')]
        .find(el => el.querySelector(`[data-property="${prop}"]`)).getBoundingClientRect();
      return Math.round(m.right - c.right);
    })).toBe(0);

    await page.keyboard.press('Escape');
  }
});

test('on a narrow screen the menu becomes a sheet across the bottom', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 720 });   // under the 600px breakpoint
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  await openMenuFor(page, page.locator('.note-table-cell-header').first());

  // the sheet slides up from below, so wait for it to come to rest before measuring
  const gapBelow = () => page.evaluate(() => {
    const r = document.getElementById('column-menu').getBoundingClientRect();
    return Math.round(document.documentElement.clientHeight - r.bottom);
  });
  await expect.poll(gapBelow).toBe(0);

  const box = await page.evaluate(() => {
    const r = document.getElementById('column-menu').getBoundingClientRect();
    const doc = document.documentElement;
    return {
      left: Math.round(r.left),
      width: Math.round(r.width),
      gapBelow: Math.round(doc.clientHeight - r.bottom),
      viewportWidth: doc.clientWidth,
    };
  });

  expect(box.left).toBe(0);
  expect(box.gapBelow).toBe(0);   // sitting on the bottom edge

  // Not exactly clientWidth: the page sets scrollbar-gutter: stable, and the reserved
  // gutter is outside the box fixed insets resolve against but inside clientWidth.
  expect(box.width).toBeGreaterThan(box.viewportWidth - 20);
});

test('scrolling a column away clamps the menu on screen rather than throwing it off', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 620 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  // the first column, so scrolling right marches it off to the left
  await openMenuFor(page, page.locator('.note-table-cell-header').first());

  const geometry = () => page.evaluate(() => {
    const m = document.getElementById('column-menu').getBoundingClientRect();
    const prop = document.getElementById('column-menu').dataset.property;
    const c = [...document.querySelectorAll('.note-table-cell-header')]
      .find(el => el.querySelector(`[data-property="${prop}"]`)).getBoundingClientRect();
    return { menuLeft: Math.round(m.left), menuRight: Math.round(m.right),
             colRight: Math.round(c.right), width: Math.round(m.width) };
  });

  for (const scrollLeft of [0, 80, 120, 200, 260]) {
    await page.evaluate(x => { document.querySelector('.list-table').scrollLeft = x; }, scrollLeft);
    await expect.poll(async () => (await geometry()).menuLeft >= 0, {
      message: `menu ran off the left edge at scrollLeft ${scrollLeft}`,
    }).toBe(true);

    const g = await geometry();
    // right-aligned to its column while there is room for it, clamped to the edge once
    // there is not — never flipped to the column's left edge, which is further off screen
    expect(g.menuRight, `at scrollLeft ${scrollLeft}`)
      .toBe(g.colRight >= g.width ? g.colRight : g.width);
  }
});
