const { test, expect } = require('@playwright/test');

// Mock a file whose body contains inline SVG (with href="#petal"), a real tag,
// and a hex colour. Two separate tag-matching paths need to ignore `#petal`:
//   1. tagParser (render-time) — injects <span class="tag"> into rendered HTML
//   2. regex_tag in file-info.js (load-time) — builds file.tags Map for filters
async function loadRoseFile(page) {
  await page.addInitScript(() => {
    const content =
      '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><ellipse id="petal" cx="100" cy="70" rx="15" ry="30" fill="purple"/></defs>' +
      '<use href="#petal"/>' +
      '</svg>\n\n' +
      'A real tag: #realtag\n\n' +
      'A hex colour: #abcdef\n';

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

  // Exactly one tag span should be rendered — from `#realtag`, not `#petal` or `#abcdef`.
  const tagCount = await page.locator('#modal-content-text .tag').count();
  expect(tagCount).toBe(1);
  await expect(page.locator('#modal-content-text .tag').first()).toHaveText(/realtag/);
});

test('SVG href="#id" is not harvested into the file.tags index', async ({ page }) => {
  await loadRoseFile(page);

  const tagKeys = await page.evaluate(() => {
    const file = window.appState.myFiles.find(f => f.filename === 'rose.md');
    return [...file.tags.keys()];
  });

  expect(tagKeys).toContain('realtag');
  expect(tagKeys).not.toContain('petal');
  expect(tagKeys).not.toContain('abcdef');
});
