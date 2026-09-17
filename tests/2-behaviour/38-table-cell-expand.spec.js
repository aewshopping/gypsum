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
