const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder } = require('./helpers');

// --modal-footer-height sizes the editor toolbar band. Whatever it is set to, the toolbar must not
// hang out of the modal shell: the shell would become scrollable and a Page Up in the text would
// chain into it and drag the header (save, history, maximise, close) out of view.

/** Sets the footer height on the modal, as editing the CSS variable would. */
async function setFooterHeight(page, height) {
  await page.evaluate((h) => {
    document.getElementById('file-content-modal').style.setProperty('--modal-footer-height', h);
  }, height);
}

/**
 * Two readings of the same fault, in pixels. `hangingOut` is how far the toolbar reaches past the
 * shell; `scrolled` is how far a chained keyboard scroll can then shift the shell. Both must be 0.
 * @returns {Promise<{hangingOut: number, scrolled: number}>}
 */
function shellOverflow(page) {
  return page.evaluate(() => {
    const shell = document.getElementById('moving-file-content-container');
    shell.scrollTop = 500; // what a chained keyboard scroll would do
    const scrolled = shell.scrollTop;
    shell.scrollTop = 0;
    return { hangingOut: shell.scrollHeight - shell.clientHeight, scrolled };
  });
}

/** Top of the modal header, as the viewport sees it. @returns {Promise<number>} */
function headerTop(page) {
  return page.locator('#file-content-header').evaluate(el => Math.round(el.getBoundingClientRect().top));
}

test('no footer height lets the editor toolbar band scroll the modal', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();

  const restingTop = await headerTop(page);

  // 0px and 100px bracket the range; the editor buttons are parked with a transform while
  // the render toggle is off, which is its own source of overflow, so both states are checked.
  for (const height of ['0px', '100px']) {
    for (const txtMode of [false, true]) {
      await page.evaluate((txt) => {
        const t = document.getElementById('render_toggle');
        if (t.checked !== txt) t.click();
      }, txtMode);
      await setFooterHeight(page, height);

      const where = `${height}, txt mode: ${txtMode}`;
      expect(await shellOverflow(page), where).toEqual({ hangingOut: 0, scrolled: 0 });
      expect(await headerTop(page), where).toBe(restingTop);
    }
  }
});
