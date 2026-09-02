const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithHistory, loadFolder } = require('./helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

async function openModal(page) {
  await loadFolder(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 1);
}

// The render toggle checkbox is visually hidden inside a CSS slider label.
// Use JS click to avoid Playwright's viewport/visibility checks.
async function switchToTxt(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
}

async function switchToHtml(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (t.checked) t.click();
  });
}

test.describe('contentEditable state in TXT mode', () => {

  test('the current version is editable, a historical one is not', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // The live editor stays in the DOM (hidden) while a historical version is shown, so
    // read the pre the user is actually looking at rather than the first one in the DOM.
    const editable = () => page.evaluate(() =>
      [...document.querySelectorAll('#modal-content-text pre')]
        .find(el => getComputedStyle(el).display !== 'none')?.contentEditable);

    expect(await editable()).toBe('plaintext-only');

    // on-open snapshot (v-1) + historical entry (v-2) = 3 total
    await waitForHistoryOptions(page, 3);
    await page.selectOption('#file-content-history-select', { index: 2 });
    expect(await editable()).toBe('false');
  });

  test('edits survive a history round-trip, and newlines survive the html toggle', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);
    await switchToTxt(page);

    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      pre.textContent = 'paragraph one\n\nparagraph two';
      pre.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.selectOption('#file-content-history-select', { index: 2 });
    await expect(page.locator('#modal-content-text')).toContainText('Old content from yesterday');
    await page.selectOption('#file-content-history-select', { value: 'current' });

    expect(await page.locator('#modal-content-text pre').textContent())
      .toBe('paragraph one\n\nparagraph two');

    // \n\n in the raw text is a markdown paragraph break → two separate <p> elements.
    await switchToHtml(page);
    const html = await page.locator('#modal-content-text').innerHTML();
    expect(html).toMatch(/<p[^>]*>.*paragraph one.*<\/p>/s);
    expect(html).toMatch(/<p[^>]*>.*paragraph two.*<\/p>/s);
  });

  test('source line breaks become <br>, and HTML characters stay literal', async ({ page }) => {
    await page.addInitScript(() => {
      const content = 'Price: $5 <small>, tax & fees\nNext line >';
      const makeFile = (name, c) => ({
        kind: 'file', name,
        getFile: async () => ({ name, size: c.length, lastModified: Date.now(), text: async () => c }),
      });
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () { yield makeFile('notes.md', content); },
        getFileHandle: async () => { throw new Error('no backup'); },
      });
    });
    await page.goto('/');
    await loadFolder(page);
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await switchToTxt(page);

    const innerHTML = await page.evaluate(() =>
      document.querySelector('#modal-content-text pre').innerHTML
    );
    // One \n in the source → exactly one <br>
    expect(innerHTML.split('<br>').length - 1).toBe(1);

    // The raw HTML must not contain a live <small> element
    expect(await page.evaluate(() =>
      !!document.querySelector('#modal-content-text pre small'))).toBe(false);

    const text = await page.locator('#modal-content-text pre').textContent();
    expect(text).toContain('<small>');
    expect(text).toContain('& fees');
  });

});
