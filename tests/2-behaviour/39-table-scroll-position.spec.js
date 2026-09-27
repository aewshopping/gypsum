const { test, expect } = require('@playwright/test');
const { loadFolder, showFilenames } = require('../helpers');

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
    await page.evaluate(v => { window.__expectedScroll = v; }, before);

    await action();
    await settled();

    // Poll rather than read once: typing into the search box fires a render per keystroke,
    // so a single read can land mid-flight between one render and the next.
    await expect.poll(scrollLeft, { message: `${label} lost the scroll position` }).toBe(before);

    // The header and the top scrollbar have to come along with it. The thumb has no scroll
    // position of its own — it is placed by an animation on the table's scroll timeline — so
    // read where it sits in its track and convert that back to the table's offset. Polled
    // because a scroll-driven animation settles on a frame boundary.
    await expect
      .poll(() => page.evaluate(() => {
        const track = document.getElementById('top-scrollbar-container').getBoundingClientRect();
        const thumb = document.getElementById('top-scrollbar-thumb').getBoundingClientRect();
        const scroller = document.querySelector('.list-table');
        const travel = track.width - thumb.width;
        const shown = (thumb.left - track.left) / travel
                      * (scroller.scrollWidth - scroller.clientWidth);
        return Math.abs(shown - window.__expectedScroll);
      }), { message: `${label} lost the top scrollbar` })
      .toBeLessThanOrEqual(1); // the thumb sits on a subpixel transform
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

  // sorting goes through the partial path, which replaces only the rows. Three clicks now:
  // the header cell selects, opens the column menu, then the menu item does the sorting.
  await survives('sort', async () => {
    await page.locator('.note-table-cell-header').first().evaluate(el => { el.click(); el.click(); });
    await page.locator('[data-action="column-sort-asc"]').evaluate(el => el.click());
  });
});


// The vertical case, and a different mechanism: the table has no vertical scroll container of its
// own — .list-table is overflow-x with no height, so the document scrolls — and the table's open
// control is the app's only <a href="#"> outside a note's body. Following the empty fragment is
// defined as scrolling to the top of the document, so opening a note from a row below the fold
// snapped the whole page up, with or without a view transition.
test('opening a note from a row below the fold keeps the page where it was', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 400 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  // Down to the last row, which is well past the fold at this height.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);

  // Clicked through the DOM: locator.click() scrolls the target into view first, which would
  // move the very position under test.
  await page.locator('.note-table').last()
    .locator('a[data-action="open-file-content-modal"]')
    .evaluate(el => el.click());

  // The note really opened, so a click that missed fails here rather than passing on a no-op.
  await expect(page.locator('#file-content-modal')).toHaveAttribute('open', '');

  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  // location.hash is '' either way — a bare '#' is an empty fragment — so the URL is what says
  // whether the anchor was followed, and with it the dead step it used to add to the Back button.
  expect(page.url()).not.toContain('#');
});

// The top scrollbar is drawn rather than real, so the track pressing a page either side of the
// thumb is written out rather than free — and it went missing once, with no track to press.
test('pressing the top scrollbar track beside the thumb pages the table towards the press', async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 700 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('#top-scrollbar-container[data-scrollable]')).toBeVisible();

  const scroller = page.locator('.list-table');
  const scrollLeft = () => scroller.evaluate(el => el.scrollLeft);
  const track = page.locator('#top-scrollbar-container');
  const box = await track.boundingBox();

  await track.hover({ position: { x: box.width - 4, y: box.height / 2 } });
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(scrollLeft).toBeGreaterThan(0);
  const after = await scrollLeft();

  await track.click({ position: { x: 2, y: box.height / 2 } });
  await expect.poll(scrollLeft).toBeLessThan(after);
});
