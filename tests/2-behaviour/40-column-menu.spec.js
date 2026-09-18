const { test, expect } = require('@playwright/test');
const { loadFolder, showFilenames } = require('../helpers');

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

// How far the menu sits from the column edge it hangs off, which is 0 while the two are still
// together. Either edge counts: the menu normally hangs from its column's right edge, but a
// column too narrow to hold it flips to the left edge and opens rightwards — see @position-try
// --column-menu-flip-left in column-menu.css. The first column is 90px against a 151px menu, so
// it is permanently flipped, at every scroll offset.
const menuGap = page => page.evaluate(() => {
  const m = document.getElementById('column-menu').getBoundingClientRect();
  const prop = document.getElementById('column-menu').dataset.property;
  const c = [...document.querySelectorAll('.note-table-cell-header')]
    .find(el => el.dataset.property === prop).getBoundingClientRect();
  // abs: Math.round(-0.4) is -0, and toBe is Object.is
  return Math.min(Math.abs(Math.round(m.right - c.right)),
                  Math.abs(Math.round(m.left - c.left)));
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

test('the sort items are named after the ends of the column\'s own sort', async ({ page }) => {
  await openTable(page);
  // wide enough to reach the last column without scrolling: the header is moved by a scroll-driven
  // transform, so a click that has to scroll first lands where the header used to be
  await page.setViewportSize({ width: 1700, height: 700 });
  const headerFor = prop => page.locator(`.note-table-cell-header[data-property="${prop}"]`);
  const labels = () => page.evaluate(() => [
    document.querySelector('[data-action="column-sort-asc"]').textContent,
    document.querySelector('[data-action="column-sort-desc"]').textContent,
  ]);

  await openMenuFor(page, headerFor('title'));
  expect(await labels()).toEqual(['sort A to Z', 'sort Z to A']);

  // A date sorts old to new, and a list by how many items a row holds — neither has an A or a Z
  // in it, which is what the wording used to claim.
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await openMenuFor(page, headerFor('lastModified'));
  expect(await labels()).toEqual(['sort old to new', 'sort new to old']);

  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await openMenuFor(page, headerFor('tags'));
  expect(await labels()).toEqual(['sort few to many', 'sort many to few']);

  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await openMenuFor(page, headerFor('sizeInBytes'));
  expect(await labels()).toEqual(['sort low to high', 'sort high to low']);
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

// ---------------------------------------------------------------- auto-size

// A fixture with a list column whose whole line is much wider than any one item in it, which is
// what the two measurements have to be told apart by.
async function setupListFiles(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const mk = (n, c) => ({ kind: 'file', name: n,
        getFile: async () => ({ name: n, size: c.length, lastModified: Date.now(), text: async () => c }) });
      return { kind: 'directory', name: 'root', values: async function* () {
        yield mk('a.md', '---\npeople:\n  - John Smith\n  - Ada Lovelace\n  - Sam Patel\n  - Kim Lee\n  - Alex Fry\n---\n# Alpha\n');
        yield mk('b.md', '---\npeople:\n  - Bartholomew Cubbins-Wentworth\n  - Jo\n---\n# Beta\n');
      } };
    };
  });
}

async function openListTable(page) {
  await page.setViewportSize({ width: 1400, height: 700 });
  await setupListFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const columnWidth = (page, property) => page.locator(`.note-table-cell-header[data-property="${property}"]`)
  .evaluate(el => Math.round(el.getBoundingClientRect().width));

async function autoSize(page, property) {
  const header = page.locator(`.note-table-cell-header[data-property="${property}"]`);
  await openMenuFor(page, header);
  await page.locator('[data-action="column-auto-size"]').click();
  await expect(menu(page)).toBeHidden();
}

// A list cell is one comma-joined line, so its max-content is every item in the busiest row added
// together — a number with no natural bound. An item is the unit a list is read in.
test('auto-size fits a list column to its widest item, not its whole line', async ({ page }) => {
  await openListTable(page);

  const measured = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.list-table .note-table-cell[data-list][data-prop="people"]')];
    const line = Math.max(...cells.map(c => {
      const r = new Range(); r.selectNodeContents(c); return r.getBoundingClientRect().width;
    }));
    const h = CSS.highlights.get('list-item');
    const item = Math.max(...[...h]
      .filter(r => cells.includes(r.startContainer.parentElement))
      .map(r => r.getBoundingClientRect().width));
    return { line: Math.round(line), item: Math.round(item) };
  });
  // the fixture is only meaningful if the two differ by a lot
  expect(measured.line).toBeGreaterThan(measured.item * 1.5);

  await autoSize(page, 'people');
  const width = await columnWidth(page, 'people');

  expect(width).toBeGreaterThanOrEqual(measured.item);   // the widest item is not clipped
  expect(width).toBeLessThan(measured.line);             // and the whole line was not fitted
});
