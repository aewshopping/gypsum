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

  await page.locator('[data-action="change-page"][data-page="2"]').click();

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

// ---------------------------------------------------------------- one render, one page

/** Counts full rewrites of #output from here on. */
async function countRenders(page) {
  await page.evaluate(() => {
    window.__renders = 0;
    new MutationObserver(() => { window.__renders++; })
      .observe(document.getElementById('output'), { childList: true });
  });
}

test('an edit with a filter active renders once and stays on the page', async ({ page }) => {
  await openTable(page);
  await page.evaluate(async () => {
    const { setPaginationSize } = await import('/public/js/constants.js');
    setPaginationSize(2);
  });

  // every note holds 'text' in its note property, so the filter leaves three pages of two
  await page.fill('#searchbox', 'text');
  await page.press('#searchbox', 'Enter');
  await expect(page.locator('[data-action="change-page"][data-page="2"]')).toBeVisible();

  // moved through the app's own state rather than by clicking, so the page change's own
  // transition is finished and gone before the edit being measured starts
  await page.evaluate(async () => {
    const { appState } = await import('/public/js/services/store.js');
    const { renderFiles } = await import('/public/js/ui/ui-functions-render/a-render-all-files.js');
    appState.paginationState.currentPage = 2;
    renderFiles(true, true);
  });
  await page.waitForTimeout(1500);

  await countRenders(page);
  await countTransitions(page);

  const cell = page.locator('.note-table[data-vt-id] [data-prop="note"]').first();
  const before = await cell.textContent();
  await cell.click();
  await cell.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await page.keyboard.press('Escape');

  await expect.poll(() => page.evaluate(() => Object.values(window.__files).join('|')))
    .toContain(`${before} more`);
  await page.waitForTimeout(500);

  const after = await page.evaluate(async () => {
    const { appState } = await import('/public/js/services/store.js');
    return { renders: window.__renders, vt: window.__vt, page: appState.paginationState.currentPage };
  });

  expect(after.renders).toBe(1);   // was two: one here, one inside processSeachResults
  expect(after.vt).toBe(0);
  expect(after.page).toBe(2);      // was reset to 1, because that second render kept no page
});

// ---------------------------------------------------------------- no waiting for an idle moment

test('a cell edit refreshes without waiting for an idle callback', async ({ page }) => {
  await openTable(page);

  // An idle callback can wait up to its two-second timeout on a busy thread. Starving it outright
  // is how to tell "we no longer wait for one" from "one happened to fire quickly".
  await page.evaluate(() => {
    window.__idleCalls = 0;
    window.requestIdleCallback = () => { window.__idleCalls++; return 0; };   // never fires
    window.cancelIdleCallback = () => {};
  });

  const cell = cellFor(page, 'Note 0', 'note');
  await cell.click();
  await cell.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('written and shown');
  await page.keyboard.press('Escape');

  await expect(cellFor(page, 'Note 0', 'note')).toHaveText('written and shown', { timeout: 2000 });
  expect(await page.evaluate(() => window.__idleCalls)).toBe(0);
});

// ---------------------------------------------------------------- rows only, where that is enough

test('a cell edit replaces the rows and leaves the header alone', async ({ page }) => {
  await openTable(page);

  // marks on the nodes a full render would throw away
  await page.evaluate(() => {
    document.querySelector('.note-table-header').dataset.kept = 'header';
    document.querySelector('.note-table[data-vt-id]').dataset.kept = 'row';
  });

  const cell = cellFor(page, 'Note 0', 'note');
  await cell.click();
  await cell.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('rows only');
  await page.keyboard.press('Escape');

  await expect(cellFor(page, 'Note 0', 'note')).toHaveText('rows only');

  await expect(page.locator('.note-table-header[data-kept="header"]')).toHaveCount(1);
  await expect(page.locator('.note-table[data-kept="row"]')).toHaveCount(0);
});

test('a note that gains a front matter key gets the column drawn', async ({ page }) => {
  await openTable(page);
  await expect(page.locator('.note-table-cell-header[data-property="brandnew"]')).toHaveCount(0);

  // the case the rows-only path cannot serve: the note modal's autosave can add a key, and the
  // header has no column for it. Driven at the refresh itself, which is the seam that decides.
  await page.evaluate(async () => {
    window.__files['note-0.md'] =
      '---\nstatus: draft\nnote: text 0\nbrandnew: yes\n---\n# Note 0\n\nBody.\n';
    const { refreshFileNow } = await import('/public/js/editing/refresh-file-state.js');
    await refreshFileNow({ filepath: 'note-0.md', filename: 'note-0.md' });
  });

  await expect(page.locator('.note-table-cell-header[data-property="brandnew"]')).toHaveCount(1);
  await expect(cellFor(page, 'Note 0', 'brandnew')).toHaveText('yes');
});

// ---------------------------------------------------------------- the settings toggle

/** Turns "Animate view changes" off through the settings modal, the way a user would. */
async function turnAnimationsOff(page) {
  await page.click('[data-action="open-settings-modal"]');
  await expect(page.locator('#view-transitions-enabled')).toBeVisible();
  await page.locator('#view-transitions-enabled').uncheck();
  await page.click('[data-action="close-settings-modal"]');
  await expect(page.locator('#view-transitions-enabled')).not.toBeVisible();
}

test('with animations off, a sort starts no transition at all', async ({ page }) => {
  await openTable(page);
  await turnAnimationsOff(page);
  await countTransitions(page);

  const order = () => page.evaluate(() =>
    [...document.querySelectorAll('.note-table[data-vt-id]')].map(row => row.dataset.vtId).join());
  const before = await order();

  await sortBy(page, 'status');

  // the rows moved, which is what would animate with the setting on — and the sort still happened,
  // which is the other half of "skipped" meaning skipped rather than cancelled
  await expect.poll(order).not.toBe(before);
  expect(await transitions(page)).toBe(0);
});

test('with animations off, opening and closing a note starts none', async ({ page }) => {
  await openTable(page);
  await turnAnimationsOff(page);
  await countTransitions(page);

  await page.locator('[data-action="open-file-content-modal"]').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  expect(await transitions(page)).toBe(0);

  await page.click('[data-action="close-file-content-modal"]');
  await expect(page.locator('#file-content-modal')).not.toBeVisible();
  expect(await transitions(page)).toBe(0);
});

test('with animations on, opening a note still animates', async ({ page }) => {
  await openTable(page);
  await countTransitions(page);

  await page.locator('[data-action="open-file-content-modal"]').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();

  expect(await transitions(page)).toBe(1);
});
