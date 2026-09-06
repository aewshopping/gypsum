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

// Two clicks on the header cell: the first selects the column, the second opens the menu.
async function openMenuFor(page, header) {
  await header.click();
  await header.click();
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

  // the three unbuilt options are present but inert; sort asc/desc and search are live
  await expect(menu(page).locator('button[disabled]')).toHaveCount(3);
  await expect(menu(page).locator('button:not([disabled])')).toHaveCount(3);
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
        .find(el => el.dataset.property === prop).getBoundingClientRect();
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
      .find(el => el.dataset.property === prop).getBoundingClientRect();
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

test('a header takes one click to select and a second to open its options', async ({ page }) => {
  await openTable(page);
  const header = titleHeader(page);

  await header.click();
  await expect(header).toHaveClass(/is-selected/);
  await expect(menu(page)).toBeHidden();      // selecting alone opens nothing

  await header.click();
  await expect(menu(page)).toBeVisible();
  await expect(header).toHaveClass(/is-selected/);   // and stays marked while open

  // clicking away drops the selection
  await page.locator('#output').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.note-table-cell-header.is-selected')).toHaveCount(0);
});

test('only the column driving the sort shows a chevron', async ({ page }) => {
  await openTable(page);

  const shown = () => page.evaluate(() =>
    [...document.querySelectorAll('.note-table-cell-header')]
      .filter(c => getComputedStyle(c.querySelector('.column-sort-indicator')).visibility === 'visible')
      .map(c => c.dataset.property));

  // the default sort owns the only chevron on screen
  expect(await shown()).toEqual(['lastModified']);

  // hovering must not reveal any others
  await titleHeader(page).hover();
  expect(await shown()).toEqual(['lastModified']);

  // selecting must not either
  await titleHeader(page).click();
  expect(await shown()).toEqual(['lastModified']);

  // sorting moves it, and it stays the only one
  await openMenuFor(page, titleHeader(page));
  await page.locator('[data-action="column-sort-asc"]').click();
  await expect.poll(shown).toEqual(['title']);
});

test('hovering a header still highlights its column', async ({ page }) => {
  await openTable(page);

  // data-property moved from the chevron onto the header cell, which is what the column
  // highlight reads — easy to break silently
  const backgrounds = () => page.evaluate(() => ({
    tags: getComputedStyle(document.querySelector('.note-table-cell[data-prop="tags"]')).backgroundColor,
    title: getComputedStyle(document.querySelector('.note-table-cell[data-prop="title"]')).backgroundColor,
  }));

  const before = await backgrounds();
  await page.locator('.note-table-cell-header', { hasText: 'tags' }).hover();

  await expect.poll(async () => (await backgrounds()).tags).not.toBe(before.tags);
  expect((await backgrounds()).title).toBe(before.title);   // only the hovered column
});

test('the chevron points down for descending and up for ascending', async ({ page }) => {
  await openTable(page);

  const chevron = () => page.evaluate(() => {
    const c = [...document.querySelectorAll('.note-table-cell-header')].find(el => el.dataset.sorted);
    return { direction: c.dataset.sorted,
             rotate: getComputedStyle(c.querySelector('.column-sort-indicator')).rotate };
  });

  // the default sort is descending, and the glyph is drawn pointing down
  expect(await chevron()).toEqual({ direction: 'desc', rotate: 'none' });

  await openMenuFor(page, titleHeader(page));
  await page.locator('[data-action="column-sort-asc"]').click();
  await expect.poll(chevron).toEqual({ direction: 'asc', rotate: '180deg' });

  await openMenuFor(page, titleHeader(page));
  await page.locator('[data-action="column-sort-desc"]').click();
  await expect.poll(chevron).toEqual({ direction: 'desc', rotate: 'none' });
});

test('search column primes the search box for that property', async ({ page }) => {
  await openTable(page);

  await openMenuFor(page, page.locator('.note-table-cell-header', { hasText: 'tags' }));
  await page.locator('[data-action="column-search"]').click();

  expect(await page.evaluate(() => {
    const sb = document.getElementById('searchbox');
    return { value: sb.value, focused: document.activeElement === sb, caret: sb.selectionStart };
  })).toEqual({ value: 'tags:', focused: true, caret: 5 });

  // acting closes the menu and drops the selection, like the sort items
  await expect(menu(page)).toBeHidden();
  await expect(page.locator('.note-table-cell-header.is-selected')).toHaveCount(0);

  // and the value typed after it filters on that property, not across all of them
  await page.keyboard.type('project');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll('#filter-box *')].some(e => e.textContent.includes('tags:project'))
  )).toBe(true);
});
