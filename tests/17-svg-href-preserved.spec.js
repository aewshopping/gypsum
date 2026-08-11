const { test, expect } = require('@playwright/test');

// Mock a file whose body contains inline SVG (with href="#petal", a <style> block of
// formatted/braced CSS, and an inline style="fill:#ff0000" declaration), a real tag, and a
// bare hex-looking word. Two separate tag-matching paths need to ignore `#petal`, the braced
// CSS hex colours, and `#ff0000` (all markup context, via the quote/'='/':'/'{' lookbehind)
// while still picking up `#realtag` and `#abcdef` (typed as tags, with nothing marking them
// as markup):
//   1. tagParser (render-time) — injects <span class="tag"> into rendered HTML
//   2. regex_tag in file-info.js (load-time) — builds file.tags Map for filters
async function loadRoseFile(page) {
  await page.addInitScript(() => {
    const content =
      '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' +
      '<style>.cls-1 { fill: #ffffff; stroke: #1e1e1e; }</style>' +
      '<defs><ellipse id="petal" cx="100" cy="70" rx="15" ry="30" style="fill:#ff0000"/></defs>' +
      '<use href="#petal"/>' +
      '</svg>\n\n' +
      'A real tag: #realtag\n\n' +
      'A hex-looking tag: #abcdef\n';

    const makeFile = (name, c) => ({
      kind: 'file', name,
      getFile: async () => ({ name, size: c.length, lastModified: Date.now(), text: async () => c }),
    });
    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { yield makeFile('rose.md', content); },
      getFileHandle: async () => { throw new Error('no backup'); },
    });
  });

  await page.goto('/');
  await page.click('[data-click-loadfolder]');
  await expect(page.locator('.note-grid')).toHaveCount(1);
}

test('SVG href="#id" attributes are not rewritten as tag spans', async ({ page }) => {
  await loadRoseFile(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();

  // The <use> element must survive with its href intact.
  const useHref = await page.evaluate(() =>
    document.querySelector('#modal-content-text svg use')?.getAttribute('href')
  );
  expect(useHref).toBe('#petal');

  // Two tag spans should be rendered — `#realtag` and `#abcdef` — but not `#petal`, the
  // `#ff0000` inside the SVG's style attribute, or the `#ffffff`/`#1e1e1e` inside the
  // formatted, braced <style> block, all of which are markup, not tags.
  const tagCount = await page.locator('#modal-content-text .tag').count();
  expect(tagCount).toBe(2);
  const tagTexts = await page.locator('#modal-content-text .tag').allTextContents();
  expect(tagTexts.some(t => /realtag/.test(t))).toBe(true);
  expect(tagTexts.some(t => /abcdef/.test(t))).toBe(true);
});

