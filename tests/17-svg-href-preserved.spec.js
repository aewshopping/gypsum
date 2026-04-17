const { test, expect } = require('@playwright/test');

// An inline SVG whose <use> elements reference a <defs> symbol via href="#petal".
// Before the fix, tagParser rewrote "#petal" into a tag span inside the attribute
// value, corrupting the SVG so it did not render. The fix excludes '#' preceded
// by a quote or '=' from tag substitution.
test('SVG href="#id" attributes are not rewritten as tag spans', async ({ page }) => {
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
