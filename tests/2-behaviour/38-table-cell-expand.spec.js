const { test, expect } = require('@playwright/test');
const { loadFolder, showFilenames } = require('../helpers');

// Titles long enough that a cell cannot show them at its column width.
async function setupLongTitles(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const mk = (name, content) => ({ kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }) });
      return { kind: 'directory', name: 'root', values: async function* () {
        for (let i = 1; i <= 30; i++) {
          yield mk(`note-${String(i).padStart(2, '0')}.md`,
            `---\nnote: a front matter value long enough that its cell cannot show all of it\n---\n`
            + `# Note ${i} with a deliberately long title that will not fit inside one table cell\n\nbody #work/project`);
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

// A front matter property rather than the title: only what a note's front matter holds can be
// written back, so those are the only cells that take a caret. See plans/completed/table-cell-editors.md §5.2.
test('an expanded cell can be typed into, without the app stealing the keys', async ({ page }) => {
  await openTable(page);
  const cell = page.locator('.note-table .note-table-cell[data-prop="note"]').nth(2);

  await cell.click(); await cell.click();
  await expect(cell).toHaveAttribute('contenteditable', 'plaintext-only');
  expect(await cell.evaluate(el => document.activeElement === el)).toBe(true);

  const before = (await cell.textContent()).length;
  await page.keyboard.type('ABC');
  expect((await cell.textContent()).length).toBe(before + 3);

  // arrow keys move the caret rather than moving focus to the next cell
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  expect(await cell.evaluate(el => document.activeElement === el)).toBe(true);

  // and the bare-key shortcuts stay out of the way: these are text, not commands
  await page.keyboard.type('/#?');
  expect(await cell.textContent()).toContain('/#?');
  expect(await page.evaluate(() => document.activeElement === document.getElementById('searchbox'))).toBe(false);
  expect(await page.evaluate(() => !!document.querySelector('dialog[open]'))).toBe(false);

  // collapsing gives up editability again
  await page.keyboard.press('Escape');
  await expect(page.locator('.note-table-cell[contenteditable]')).toHaveCount(0);
});

// ---------------------------------------------------------------- the selected cell's right edge

// A [[link]] is an anchor, and an anchor takes every press on it — so a cell whose one value is a
// link had nowhere left to press to open it once the first press had selected it. The selected cell
// gives its right edge back; see note-table-cell.css.
async function setupLinkCells(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const mk = (name, content) => ({ kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }) });
      return { kind: 'directory', name: 'root', values: async function* () {
        // The value is one link, wider than the column it lands in.
        yield mk('alpha.md', '---\nref: "[[a-deliberately-long-target-name.md]]"\n---\n# Alpha\n');
        yield mk('a-deliberately-long-target-name.md', '# Target\n');
      } };
    };
  });
}

async function openLinkTable(page) {
  // Wide enough that the 'ref' column, which the table appends after its own, is on screen: these
  // tests press real coordinates, so the cell has to be somewhere the mouse can reach.
  await page.setViewportSize({ width: 1500, height: 650 });
  await setupLinkCells(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const refCell = page => page.locator('.note-table').filter({ hasText: 'Alpha' }).first()
  .locator('.note-table-cell[data-prop="ref"]');

/** Presses a cell that many px in from its right edge, at mid height. */
async function pressFromRight(page, cell, fromRight) {
  await cell.scrollIntoViewIfNeeded();
  const box = await cell.boundingBox();
  await page.mouse.click(box.x + box.width - fromRight, box.y + box.height / 2);
}

test('the right edge of a selected cell opens it, even when a link covers the cell', async ({ page }) => {
  await openLinkTable(page);
  const cell = refCell(page);

  // The anchor really does span the cell: a press 4px from the right lands on it, not on the cell.
  await cell.scrollIntoViewIfNeeded();
  const atEdge = await cell.evaluate(el => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.right - 4, r.top + r.height / 2).tagName;
  });
  expect(atEdge).toBe('A');

  await pressFromRight(page, cell, 4);          // first press selects, wherever it lands
  await expect(cell).toHaveClass(/is-selected/);
  await expect(cell).not.toHaveClass(/is-expanded/);

  await pressFromRight(page, cell, 4);          // second press, on the band, opens it
  await expect(cell).toHaveClass(/is-expanded/);
});

test('the strip belongs to the selected cell only, and costs no column width', async ({ page }) => {
  await openLinkTable(page);
  const cell = refCell(page);

  // The strip is cleared with padding, so the cell's own width is never touched — only where its
  // text stops moves. An unselected cell reserves nothing.
  const pad = () => cell.evaluate(el => parseFloat(getComputedStyle(el).paddingRight));
  const outerWidth = () => cell.evaluate(el => Math.round(el.getBoundingClientRect().width));

  const restingPad = await pad();
  const restingWidth = await outerWidth();

  await pressFromRight(page, cell, 4);
  await expect(cell).toHaveClass(/is-selected/);
  expect(await pad()).toBeGreaterThan(restingPad);
  expect(await outerWidth()).toBe(restingWidth);  // no column width given up

  await pressFromRight(page, cell, 4);
  await expect(cell).toHaveClass(/is-expanded/);
  expect(await pad()).toBe(restingPad);           // an open cell is read in full
});

test('the band does not take the link away', async ({ page }) => {
  await openLinkTable(page);
  const link = refCell(page).locator('a.internal-link');

  await link.click();                            // first press selects
  await expect(page.locator('#file-content-modal')).not.toBeVisible();
  await link.click();                            // second follows, as before
  await expect(page.locator('#file-content-modal')).toBeVisible();
});

test('the band spans the cell whatever the row height is', async ({ page }) => {
  await openLinkTable(page);
  // Row height is set from two custom properties; nothing about the band may depend on them.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--table-line-height', '4');
    document.documentElement.style.setProperty('--table-cell-padding', '20px');
  });
  const cell = refCell(page);
  await pressFromRight(page, cell, 4);
  await expect(cell).toHaveClass(/is-selected/);

  const spans = await cell.evaluate(el => {
    const r = el.getBoundingClientRect();
    const hit = y => document.elementFromPoint(r.right - 4, y) === el;
    return { tall: r.height > 60, top: hit(r.top + 3), middle: hit(r.top + r.height / 2), bottom: hit(r.bottom - 3) };
  });
  expect(spans).toEqual({ tall: true, top: true, middle: true, bottom: true });

  await pressFromRight(page, cell, 4);
  await expect(cell).toHaveClass(/is-expanded/);
});
