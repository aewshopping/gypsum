const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder } = require('./helpers');

// --modal-footer-height sizes the editor toolbar band. Whatever it is set to, the toolbar must not
// hang out of the modal shell: the shell would become scrollable and a Page Up in the text would
// chain into it and drag the header (save, history, maximise, close) out of view.

const FOOTER_HEIGHTS = ['0px', '10px', '40px', '100px'];

async function openModal(page, filename) {
  await loadFolder(page);
  const card = filename
    ? page.locator('.note-grid', { hasText: filename })
    : page.locator('.note-grid').first();
  await card.click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
}

/** Turns the strip mode setting on. */
function enableStripMode(page) {
  return page.evaluate(() => document.getElementById('footer-strip-mode').click());
}

/** How the band and the toolbar inside it are painted. */
function bandStyles(page) {
  return page.evaluate(() => {
    const footer = document.getElementById('file-content-footer');
    const header = document.getElementById('file-content-header');
    const toolbar = document.querySelector('.content-editable-controls');
    return {
      footerBackground: getComputedStyle(footer).backgroundColor,
      headerBackground: getComputedStyle(header).backgroundColor,
      toolbarBackground: getComputedStyle(toolbar).backgroundColor,
      toolbarBlur: getComputedStyle(toolbar).backdropFilter,
      toolbarAboveBand: Math.round(
        footer.getBoundingClientRect().top - toolbar.getBoundingClientRect().top),
    };
  });
}

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

test.describe('the editor toolbar band cannot scroll the modal', () => {

  for (const height of FOOTER_HEIGHTS) {
    test(`shell stays put at a footer height of ${height}`, async ({ page }) => {
      await setupMockFiles(page);
      await page.goto('/');
      await openModal(page);
      const restingTop = await headerTop(page);

      for (const txtMode of [false, true]) {
        // The editor buttons are parked with a transform while the render toggle is off, which is
        // its own source of overflow, so both states have to be checked.
        await page.evaluate((txt) => {
          const t = document.getElementById('render_toggle');
          if (t.checked !== txt) t.click();
        }, txtMode);
        await setFooterHeight(page, height);

        expect(await shellOverflow(page), `txt mode: ${txtMode}`).toEqual({ hangingOut: 0, scrolled: 0 });
        expect(await headerTop(page), `txt mode: ${txtMode}`).toBe(restingTop);
      }
    });
  }
});

test.describe('the strip mode setting', () => {

  test('off, the toolbar floats over the full-height text area', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openModal(page);
    await setFooterHeight(page, '100px');

    const { contentBottom, shellBottom } = await page.evaluate(() => ({
      contentBottom: document.getElementById('modal-content').getBoundingClientRect().bottom,
      shellBottom: document.getElementById('moving-file-content-container').getBoundingClientRect().bottom,
    }));
    // The text area runs to the bottom of the shell, inside its 2px border.
    expect(Math.round(shellBottom - contentBottom)).toBe(2);
  });

  test('on, the toolbar takes its height out of the text area', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openModal(page);

    const shellBottomBefore = await page.locator('#moving-file-content-container')
      .evaluate(el => Math.round(el.getBoundingClientRect().bottom));

    await enableStripMode(page);

    for (const height of ['10px', '100px']) {
      await setFooterHeight(page, height);
      const box = await page.evaluate(() => ({
        contentBottom: Math.round(document.getElementById('modal-content').getBoundingClientRect().bottom),
        footerTop: Math.round(document.getElementById('file-content-footer').getBoundingClientRect().top),
        shellBottom: Math.round(document.getElementById('moving-file-content-container').getBoundingClientRect().bottom),
      }));
      expect(box.contentBottom, `footer height ${height}`).toBe(box.footerTop);
      // Reserving the strip must not shorten the modal itself.
      expect(box.shellBottom, `footer height ${height}`).toBe(shellBottomBefore);
    }

    expect(await shellOverflow(page)).toEqual({ hangingOut: 0, scrolled: 0 });
  });
});

test.describe('how the band is painted', () => {

  // big-ideas.md carries #color/coral, so these run against a real file colour, not the fallback.

  test('in strip mode it takes the file colour, like the header', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openModal(page, 'big-ideas');
    await enableStripMode(page);

    const band = await bandStyles(page);
    expect(band.footerBackground).toBe(band.headerBackground);
    expect(band.footerBackground).not.toBe('rgba(0, 0, 0, 0)');
    // Nothing scrolls under the toolbar there, so it drops its plate and blur.
    expect(band.toolbarBackground).toBe('rgba(0, 0, 0, 0)');
    expect(band.toolbarBlur).toBe('none');
  });

  test('overlaying the text it stays see-through, and the toolbar keeps its plate', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openModal(page, 'big-ideas');

    const band = await bandStyles(page);
    expect(band.footerBackground).toBe('rgba(0, 0, 0, 0)');
    expect(band.toolbarBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(band.toolbarBlur).toContain('blur');
  });
});

test.describe('a band shorter than the toolbar', () => {

  for (const strip of [false, true]) {
    test(`pushes the toolbar down, not up (strip mode: ${strip})`, async ({ page }) => {
      await setupMockFiles(page);
      await page.goto('/');
      await openModal(page);
      if (strip) await enableStripMode(page);
      // The editor buttons only take part while the text is showing as plain text.
      await page.evaluate(() => document.getElementById('render_toggle').click());

      // The toolbar is around 56px tall, so 20px cannot hold it.
      await setFooterHeight(page, '20px');
      expect((await bandStyles(page)).toolbarAboveBand).toBe(0);

      // With room to spare it is centred again.
      await setFooterHeight(page, '100px');
      const toolbarHeight = await page.locator('.content-editable-controls')
        .evaluate(el => el.getBoundingClientRect().height);
      expect((await bandStyles(page)).toolbarAboveBand).toBe(-Math.round((100 - toolbarHeight) / 2));
    });
  }
});
