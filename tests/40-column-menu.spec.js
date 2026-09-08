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

// Somewhere empty to click. Not the top-left of #output any more: the table's control row
// holds that corner, so a click there presses a button. The reserve .list-table keeps below
// its last row for expanding cells is empty by construction, which is what this aims at.
async function clickAway(page) {
  const table = page.locator('.list-table');
  const { height } = await table.boundingBox();
  await table.click({ position: { x: 5, y: height - 10 } });
}

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

  // "hide column" is present but inert; everything else in the menu is live
  await expect(menu(page).locator('button[disabled]')).toHaveCount(1);
  await expect(menu(page).locator('button:not([disabled])')).toHaveCount(5);
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
  await clickAway(page);
  await expect(menu(page)).toBeHidden();

  // a full render rebuilds the header, so the cell the menu points at disappears
  await openMenuFor(page, header);
  await page.fill('#searchbox', 'Alpha');
  await page.press('#searchbox', 'Enter');
  await expect(menu(page)).toBeHidden();
});

test('the menu follows its column when the table is scrolled sideways', async ({ page }) => {
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

    // The header follows the table through a scroll-driven animation, so let it land before
    // measuring anything against it.
    await expect.poll(() => page.evaluate(() => {
      const h = document.querySelector('.note-table-cell-header[data-property="filename"]');
      const c = document.querySelector('.list-table .note-table-cell[data-prop="filename"]');
      return Math.round(h.getBoundingClientRect().left - c.getBoundingClientRect().left);
    })).toBe(0);

    // Whichever column is on screen at this offset. It used to be the last one at every
    // offset, which only worked because the header strip was a scroll container and the
    // click scrolled it — the very drift the strip's overflow: clip now prevents. Reaching
    // an off-screen column means scrolling the table, which is what these offsets do.
    const prop = await page.evaluate(() => {
      const t = document.querySelector('.list-table').getBoundingClientRect();
      return [...document.querySelectorAll('.note-table-cell-header')]
        .find(h => { const r = h.getBoundingClientRect(); return r.left >= t.left && r.right <= t.right; })
        ?.dataset.property;
    });
    const header = page.locator(`.note-table-cell-header[data-property="${prop}"]`);
    await openMenuFor(page, header);

    await expect.poll(() => page.evaluate(() => {
      const m = document.getElementById('column-menu').getBoundingClientRect();
      const prop = document.getElementById('column-menu').dataset.property;
      const c = [...document.querySelectorAll('.note-table-cell-header')]
        .find(el => el.dataset.property === prop).getBoundingClientRect();
      return Math.abs(Math.round(m.right - c.right));   // abs: Math.round(-0.4) is -0, and toBe is Object.is
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

test('a column scrolled out of view takes its menu with it', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 620 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  // the first column, so scrolling right marches it off to the left
  await openMenuFor(page, page.locator('.note-table-cell-header').first());

  const edges = () => page.evaluate(() => {
    const m = document.getElementById('column-menu').getBoundingClientRect();
    const prop = document.getElementById('column-menu').dataset.property;
    const c = [...document.querySelectorAll('.note-table-cell-header')]
      .find(el => el.dataset.property === prop).getBoundingClientRect();
    return { menuLeft: Math.round(m.left), menuRight: Math.round(m.right), colRight: Math.round(c.right) };
  });

  // Vertical scroll too: the header is sticky, and this combination was what first showed
  // the menu stranding itself on the left edge with its column long gone.
  await page.evaluate(() => { document.scrollingElement.scrollTop = 400; });

  for (const scrollLeft of [0, 200, 400]) {
    await page.evaluate(x => { document.querySelector('.list-table').scrollLeft = x; }, scrollLeft);
    await expect.poll(async () => {
      const e = await edges();
      return Math.abs(e.menuRight - e.colRight);   // abs, for the same -0 reason as above
    }, { message: `menu left its column at scrollLeft ${scrollLeft}` }).toBe(0);
  }

  // And it is genuinely off the left edge by now rather than pinned to it — the clamp this
  // replaced held menuLeft at exactly 0 with the column long gone.
  //
  // Polled rather than read once: the menu and its column move together, so the alignment
  // check above is satisfied even on a frame where neither has taken the scroll yet. Under
  // load that frame is what the read used to land on, with the menu still where it opened.
  await expect.poll(async () => (await edges()).menuLeft).toBeLessThan(0);
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
  await clickAway(page);
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

  // The glyph is a right-pointing arrow turned a quarter each way: down for descending, up
  // for ascending, matching the sort direction control that sits above the table.
  expect(await chevron()).toEqual({ direction: 'desc', rotate: '90deg' });

  await openMenuFor(page, titleHeader(page));
  await page.locator('[data-action="column-sort-asc"]').click();
  await expect.poll(chevron).toEqual({ direction: 'asc', rotate: '-90deg' });

  await openMenuFor(page, titleHeader(page));
  await page.locator('[data-action="column-sort-desc"]').click();
  await expect.poll(chevron).toEqual({ direction: 'desc', rotate: '90deg' });
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

test('the header tooltip says what the next click will do', async ({ page }) => {
  await openTable(page);
  const header = titleHeader(page);
  const tip = () => header.getAttribute('data-tip');

  expect(await tip()).toBe('highlight column');

  await header.click();                      // selects the column
  expect(await tip()).toBe('column options');

  await header.click();                      // opens the menu, still selected
  await expect(menu(page)).toBeVisible();
  expect(await tip()).toBe('column options');

  // selecting a different column hands the idle tip back
  const other = page.locator('.note-table-cell-header', { hasText: 'filename' });
  await other.click();
  expect(await tip()).toBe('highlight column');
  expect(await other.getAttribute('data-tip')).toBe('column options');
});

test('opening the menu puts focus on its first item, so it can be tabbed through', async ({ page }) => {
  await openTable(page);
  await openMenuFor(page, titleHeader(page));

  const focused = () => page.evaluate(() => document.activeElement?.textContent);
  expect(await focused()).toBe('sort A-Z');

  await page.keyboard.press('Tab');
  expect(await focused()).toBe('sort Z-A');
  await page.keyboard.press('Tab');
  expect(await focused()).toBe('search column');
  await page.keyboard.press('Tab');
  expect(await focused()).toBe('resize column');
});

test('tabbing along the headers scrolls the table, keeping them over their columns', async ({ page }) => {
  // Narrow enough that the last columns start off screen, which is what triggers it.
  await page.setViewportSize({ width: 800, height: 700 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  // Every header cell against the column it belongs to, plus the strip's own scroll offset.
  // The strip used to be overflow: hidden, so focusing an off-screen header had the browser
  // scroll THAT instead of the table, sliding the whole header row off its columns.
  const alignment = () => page.evaluate(() => ({
    drift: [...document.querySelectorAll('.note-table-cell-header')].map(h => {
      const c = document.querySelector(`.list-table .note-table-cell[data-prop="${h.dataset.property}"]`);
      // `|| 0` because Math.round of a hair below zero is -0, which toEqual counts as a
      // different value from 0 — an alignment of -0 is still an alignment.
      return Math.round(h.getBoundingClientRect().left - c.getBoundingClientRect().left) || 0;
    }),
    stripScrollLeft: document.querySelector('.note-table-header-strip').scrollLeft,
    focused: document.activeElement?.dataset?.property ?? null,
    focusedOnScreen: (() => {
      const c = document.activeElement?.closest?.('.note-table-cell-header')?.getBoundingClientRect();
      if (!c) return null;
      const t = document.querySelector('.list-table').getBoundingClientRect();
      return c.left >= t.left - 1 && c.right <= t.right + 1;
    })(),
  }));

  // Sized to the columns actually on screen rather than hard-coded, so adding one to the table
  // is not a failure here — what matters is that every header sits over its own column.
  const inLine = Array(await page.locator('.note-table-cell-header').count()).fill(0);

  await page.locator('#searchbox').focus();
  const seen = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const state = await alignment();
    if (!state.focused) continue;
    seen.push(state.focused);

    // Polled: the header tracks the table through a scroll-driven animation, which settles on
    // the next frame rather than with the assignment to scrollLeft. Both assertions in one
    // poll — the header is in line with its columns, and the focused one is on screen,
    // because the table is what scrolled to reveal it.
    await expect.poll(async () => {
      const { drift, focusedOnScreen } = await alignment();
      return { drift, focusedOnScreen };
    }, { message: `header out of line, or off screen, when ${state.focused} took focus` })
      .toEqual({ drift: inLine, focusedOnScreen: true });

    expect(state.stripScrollLeft).toBe(0);
  }

  // and it really did walk past the columns that start off screen
  expect(seen).toContain('lastModified');
  expect(seen).toContain('sizeInBytes');

  // Shift-Tab back brings the earlier columns back, still in line
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Shift+Tab');
    if ((await alignment()).focused)
      await expect.poll(async () => (await alignment()).drift).toEqual(inLine);
  }
});

test('a header cell is reachable by keyboard, and Enter does what a click does', async ({ page }) => {
  await openTable(page);

  // a real <button>, which is what puts it in the tab order and makes Enter fire a click
  expect(await titleHeader(page).evaluate(el => el.tagName)).toBe('BUTTON');

  // tab in from the search box, forward only, stopping at the first header cell
  await page.locator('#searchbox').focus();
  const focusedProp = () => page.evaluate(() => document.activeElement?.dataset?.property ?? null);
  for (let i = 0; i < 10 && !(await focusedProp()); i++) await page.keyboard.press('Tab');
  expect(await focusedProp()).toBe('internalId');   // the file column leads the table

  // Tab walks along the columns
  await page.keyboard.press('Tab');
  expect(await focusedProp()).toBe('filename');
  await page.keyboard.press('Tab');
  expect(await focusedProp()).toBe('title');

  // first Enter selects, exactly as a first click does
  await page.keyboard.press('Enter');
  await expect(titleHeader(page)).toHaveClass(/is-selected/);
  await expect(menu(page)).toBeHidden();
  expect(await titleHeader(page).getAttribute('data-tip')).toBe('column options');

  // second Enter opens the menu, and focus carries into it
  await page.keyboard.press('Enter');
  await expect(menu(page)).toBeVisible();
  expect(await menu(page).getAttribute('data-property')).toBe('title');
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('sort A-Z');

  // Escape closes it and hands focus back to the column it came from
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  expect(await focusedProp()).toBe('title');
});
