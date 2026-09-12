const { test, expect } = require('@playwright/test');
const { loadFolder, showFilenames } = require('./helpers');

// Plenty of columns, so the table scrolls sideways at a narrow viewport.
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

async function openTable(page, width) {
  await page.setViewportSize({ width, height: 700 });
  await setupFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await showFilenames(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();

  // renderFiles wraps its work in a view transition and flags it on <html>. Measuring the
  // thumb mid-transition reads the snapshot rather than the element.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('file-list-transitioning')))
    .toBe(false);
}

test('dragging the thumb scrolls the table by the matching content distance', async ({ page }) => {
  await openTable(page, 620);

  const thumb = page.locator('#top-scrollbar-thumb');
  await expect(thumb).toBeVisible();

  const ratio = await page.evaluate(() => {
    const s = document.querySelector('.list-table');
    return s.clientWidth / s.scrollWidth;
  });
  expect(ratio).toBeLessThan(1); // the table has to overflow for any of this to mean anything

  // hover() rather than a bare mouse.move: it runs Playwright's actionability check, which
  // waits until the point actually hits the thumb. The view transition that brought the
  // table in leaves the page unhittable until it has finished. Measured afterwards, so the
  // box the drag is computed from is the one the pointer is now sitting on.
  await thumb.hover();
  const start = await thumb.boundingBox();

  const dragBy = 40;
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + dragBy, start.y + start.height / 2, { steps: 5 });
  await page.mouse.up();

  // The thumb moves in track pixels and the table in content pixels; the ratio is what
  // converts between them.
  await expect
    .poll(() => page.evaluate(() => document.querySelector('.list-table').scrollLeft))
    .toBeCloseTo(dragBy / ratio, -1);

  // And the thumb itself has followed the table, which is the animation's job, not the
  // drag handler's.
  const moved = await thumb.boundingBox();
  expect(Math.abs(moved.x - start.x - dragBy)).toBeLessThanOrEqual(1); // subpixel rounding
});

test('a table that fits shows no scrollbar track', async ({ page }) => {
  // Wide enough that every column is on screen at once.
  await openTable(page, 1600);

  await expect.poll(() => page.evaluate(() => {
    const s = document.querySelector('.list-table');
    return s.scrollWidth <= s.clientWidth;
  })).toBe(true);

  await expect(page.locator('#top-scrollbar-container')).toBeHidden();
});
