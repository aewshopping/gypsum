const { test, expect } = require('@playwright/test');
const { setupMockFilesLongName, loadFolder } = require('./helpers');

// Nothing may make the page wider than the screen. On mobile the layout viewport inflates to the
// document's scroll width as soon as something does, and every percentage- and viewport-sized box
// — the file modal included — then sizes itself against that inflated width instead of the screen.

// The config sets no viewport, so this spec declares its own.
test.use({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });

const SIDEBAR_WIDTH = 156; // min(240px, 40vw) at 390px

/** How many pixels the page can be scrolled sideways. Must always be 0. @returns {Promise<number>} */
function overflowPx(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return de.scrollWidth - de.clientWidth;
  });
}

/** Opens the panel and waits for the slide-in to finish, so measurements are taken at rest. */
async function openPanel(page) {
  await page.locator('#btn-recent-toggle').click();
  await expect.poll(() => page.locator('#sidebar-recent')
    .evaluate(el => Math.round(el.getBoundingClientRect().left))).toBe(0);
}

test('every view, and the open note, fit the screen with the panel shut and open', async ({ page }) => {
  await setupMockFilesLongName(page);
  await page.goto('/');
  await loadFolder(page);
  await expect(page.locator('.note-grid').first()).toBeVisible();

  for (const view of ['cards', 'peek', 'list']) {
    await page.selectOption('#view-select', view);
    expect(await overflowPx(page), `${view}, panel shut`).toBe(0);
  }

  await page.selectOption('#view-select', 'cards');
  await openPanel(page);
  expect(await overflowPx(page), 'panel open').toBe(0);

  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await expect.poll(() => page.locator('#modal-content-text').innerHTML()).not.toBe('');

  const edges = await page.locator('#moving-file-content-container').evaluate(el => {
    const box = el.getBoundingClientRect();
    return { left: Math.round(box.left), right: Math.round(box.right), screen: document.documentElement.clientWidth };
  });

  expect(edges.right, 'modal right edge').toBe(edges.screen);
  expect(edges.left, 'modal left edge sits against the panel').toBe(SIDEBAR_WIDTH);
});
