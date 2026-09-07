const { test, expect } = require('@playwright/test');
const { loadFolder } = require('./helpers');

// One note carries a front matter key the app knows nothing about. The picker's whole point is
// that its rows come from the loaded folder, so a property like this has to appear.
async function setupFiles(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const mk = (n, c) => ({ kind: 'file', name: n,
        getFile: async () => ({ name: n, size: c.length, lastModified: Date.now(), text: async () => c }) });
      return { kind: 'directory', name: 'root', values: async function* () {
        yield mk('roadmap.md', '---\nstatus: draft\n---\n# Roadmap\n\nWhere this is going #work/planning');
        yield mk('retro.md', '# Retro\n\nWhat went well #work/project');
      } };
    };
  });
}

async function openTable(page) {
  await page.setViewportSize({ width: 1000, height: 900 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const dialog = page => page.locator('#modal-columns');
const rows = page => page.locator('#column-picker-list .info-modal-row');

// A <dialog> is display:none until opened, and .info-modal-scroll carries a display of its own.
// Without the [open] guard on that rule the picker would sit on the page permanently.
test('the picker is not on the page until it is opened', async ({ page }) => {
  await page.goto('/');
  await expect(dialog(page)).not.toBeVisible();
});

test('the button to open the picker belongs to the table view alone', async ({ page }) => {
  await openTable(page);
  await expect(page.locator('[data-action="open-column-picker"]')).toBeVisible();

  await page.selectOption('#view-select', 'cards');
  await expect(page.locator('[data-action="open-column-picker"]')).toHaveCount(0);

  await page.selectOption('#view-select', 'table');
  await expect(page.locator('[data-action="open-column-picker"]')).toBeVisible();
});

test('the picker lists the loaded folder\'s properties, in the table\'s column order', async ({ page }) => {
  await openTable(page);
  await page.click('[data-action="open-column-picker"]');
  await expect(dialog(page)).toBeVisible();

  // Sorted by display_order, labelled the friendly way where FILE_PROPERTIES gives a label,
  // and ending with the front matter key, which has no display_order and falls to the back.
  await expect(rows(page).locator('.info-modal-row-label')).toHaveText([
    'filename', 'internalId', 'title', 'tags', 'last modified', 'size',
    'links', 'color', 'filepath', 'preview', 'load error', 'status',
  ]);

  // handle is in hidden_always: a FileSystemFileHandle is not a column anyone can ask for
  await expect(rows(page).filter({ hasText: 'handle' })).toHaveCount(0);
});

test('a row is ticked when its property is currently a column', async ({ page }) => {
  await openTable(page);

  const shownColumns = () => page.evaluate(() =>
    [...document.querySelectorAll('.note-table-cell-header')].map(c => c.dataset.property));

  await page.click('[data-action="open-column-picker"]');
  await expect(dialog(page)).toBeVisible();

  const ticked = async () => {
    const labels = [];
    for (const row of await rows(page).all()) {
      if (await row.locator('input.toggle').isChecked()) {
        labels.push(await row.locator('.info-modal-row-label').innerText());
      }
    }
    return labels;
  };

  expect(await ticked()).toEqual(['filename', 'title', 'tags', 'last modified', 'size', 'status']);

  // the same set the table is actually showing, allowing for the labels the picker prefers
  expect(await shownColumns()).toEqual(
    ['filename', 'title', 'tags', 'lastModified', 'sizeInBytes', 'status']);
});

test('every row offers a drag grip', async ({ page }) => {
  await openTable(page);
  await page.click('[data-action="open-column-picker"]');
  await expect(dialog(page)).toBeVisible();

  await expect(rows(page).locator('.info-modal-row-grip')).toHaveCount(await rows(page).count());
});

test('Escape closes the picker', async ({ page }) => {
  await openTable(page);
  await page.click('[data-action="open-column-picker"]');
  await expect(dialog(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog(page)).not.toBeVisible();
});
