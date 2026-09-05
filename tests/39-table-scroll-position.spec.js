const { test, expect } = require('@playwright/test');
const { loadFolder, showFilenames } = require('./helpers');

// A narrow viewport and plenty of columns, so the table scrolls sideways.
async function setupFiles(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const mk = (name, content) => ({ kind: 'file', name,
        getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }) });
      return { kind: 'directory', name: 'root', values: async function* () {
        for (let i = 1; i <= 12; i++) {
          yield mk(`note-${String(i).padStart(2, '0')}.md`,
            `# Note ${i}\n\nbody ${i % 2 ? '#odd' : '#even'} #work/project`);
        }
      } };
    };
  });
}

test('the table keeps its horizontal scroll position when it re-renders', async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 700 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  const scroller = page.locator('.list-table');
  const scrollLeft = () => scroller.evaluate(el => el.scrollLeft);

  // renderFiles wraps its work in a view transition and flags it on <html>. Setting or
  // reading the scroll position mid-transition races the render that is still to come.
  const settled = () => expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('file-list-transitioning')))
    .toBe(false);

  // read the position immediately before each action, since Playwright may scroll a
  // target into view before clicking it
  const survives = async (label, action) => {
    await settled();
    await page.evaluate(() => { const t = document.querySelector('.list-table'); t.scrollLeft = Math.round((t.scrollWidth - t.clientWidth) / 2); });
    await expect.poll(scrollLeft).toBeGreaterThan(0);
    const before = await scrollLeft();

    await action();
    await settled();

    expect(await scrollLeft(), `${label} lost the scroll position`).toBe(before);

    // The header and the top scrollbar have to come along with it. The scrollbar is
    // driven by a scroll event, which lands after the render itself, so poll for it.
    await expect
      .poll(() => page.evaluate(() => document.getElementById('top-scrollbar-container').scrollLeft))
      .toBe(before);
    expect(await page.evaluate(() => {
      const h = [...document.querySelectorAll('.note-table-header .note-table-cell-header')].slice(0, 3)
        .map(c => Math.round(c.getBoundingClientRect().left));
      const b = [...document.querySelector('.note-table').children].slice(0, 3)
        .map(c => Math.round(c.getBoundingClientRect().left));
      return JSON.stringify(h) === JSON.stringify(b);
    })).toBe(true);
  };

  // searching and filtering both go through the full-render path, which replaces the
  // scroll container outright
  await survives('search', async () => {
    await page.fill('#searchbox', 'Note 1');
    await page.press('#searchbox', 'Enter');
  });

  await survives('clearing the search', async () => {
    await page.fill('#searchbox', '');
    await page.press('#searchbox', 'Enter');
  });

  // clicked through the DOM rather than with locator.click(), which would scroll the
  // target into view first and so move the very position under test
  await survives('tag filter', async () => {
    await page.locator('.note-table-cell[data-prop="tags"] [data-action="tag-filter"]').first().evaluate(el => el.click());
  });

  // sorting goes through the partial path, which replaces only the rows
  await survives('sort', async () => {
    await page.locator('[data-action="sort-object"]').first().evaluate(el => el.click());
  });
});
