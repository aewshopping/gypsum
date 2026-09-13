const { test, expect } = require('@playwright/test');
const { loadFolder } = require('./helpers');

/**
 * A view transition captures the whole page twice and then animates every named group for a
 * second. It is worth that when the rows move; it is pure cost when they do not — which is every
 * cell edit and every autosave, since neither re-sorts and neither changes the page.
 *
 * These tests are about when one runs at all, so they count calls rather than watching pixels.
 */
async function setupFiles(page) {
  await page.addInitScript(() => {
    window.__files = {};
    for (let i = 0; i < 6; i++) {
      window.__files[`note-${i}.md`] =
        `---\nstatus: ${['draft', 'live', 'done'][i % 3]}\nnote: text ${i}\n---\n# Note ${i}\n\nBody.\n`;
    }
    window.__saved = {};

    const mk = (name) => ({
      kind: 'file', name,
      getFile: async () => ({
        name, size: window.__files[name].length, lastModified: Date.now(),
        text: async () => window.__files[name],
      }),
      createWritable: async () => ({
        write: async (c) => { window.__files[name] = c; }, close: async () => {},
      }),
    });

    const gypsumDir = {
      getFileHandle: async (name, options) => {
        if (!(name in window.__saved)) {
          if (!options?.create) throw new Error(`NotFoundError: ${name}`);
          window.__saved[name] = '';
        }
        return {
          getFile: async () => ({ text: async () => window.__saved[name] }),
          createWritable: async () => ({
            write: async (c) => { window.__saved[name] = c; }, close: async () => {},
          }),
        };
      },
      removeEntry: async (name) => { delete window.__saved[name]; },
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { for (const n of Object.keys(window.__files)) yield mk(n); },
      getDirectoryHandle: async (name) => {
        if (name === '.gypsum') return gypsumDir;
        throw new Error(`no ${name}`);
      },
    });
  });
}

async function openTable(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

/** Counts view transitions from here on, without stopping them happening. */
async function countTransitions(page) {
  await page.evaluate(() => {
    window.__vt = 0;
    const real = document.startViewTransition.bind(document);
    document.startViewTransition = (callback) => { window.__vt++; return real(callback); };
  });
}

const transitions = (page) => page.evaluate(() => window.__vt);

const cellFor = (page, title, prop) => page.locator('.note-table').filter({ hasText: title }).first()
  .locator(`.note-table-cell[data-prop="${prop}"]`);

/** Sorts by a property through the controls above the table, which a wide table pushes offscreen. */
const sortBy = (page, property) => page.evaluate((property) => {
  const select = document.getElementById('sort-select');
  select.value = property;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}, property);

test('editing a cell draws the same rows, so no view transition runs', async ({ page }) => {
  await openTable(page);
  await countTransitions(page);

  const cell = cellFor(page, 'Note 0', 'note');
  await cell.click();
  await cell.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('edited');
  await page.keyboard.press('Escape');

  await expect.poll(() => page.evaluate(() => window.__files['note-0.md'])).toContain('note: edited');
  await expect(cellFor(page, 'Note 0', 'note')).toHaveText('edited');

  expect(await transitions(page)).toBe(0);
});

test('a sort moves the rows, so it still runs one', async ({ page }) => {
  await openTable(page);
  await countTransitions(page);

  await sortBy(page, 'status');

  await expect.poll(() => transitions(page)).toBe(1);
});

test('changing the page runs one', async ({ page }) => {
  await openTable(page);
  await page.evaluate(async () => {
    const { setPaginationSize } = await import('/public/js/constants.js');
    setPaginationSize(2);
  });
  await sortBy(page, 'title');          // any re-render picks up the new page size
  await countTransitions(page);

  await page.locator('[data-action="change-page"]').nth(1).click();

  await expect.poll(() => transitions(page)).toBe(1);
});

test('a render that changes nothing at all runs none', async ({ page }) => {
  await openTable(page);
  await countTransitions(page);

  await page.evaluate(async () => {
    const { renderFiles } = await import('/public/js/ui/ui-functions-render/a-render-all-files.js');
    renderFiles(true, true);
    renderFiles(true, true);
  });

  expect(await transitions(page)).toBe(0);
});
