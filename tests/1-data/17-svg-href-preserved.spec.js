const { test, expect } = require('@playwright/test');
const { loadFolder, appModule } = require('../helpers');

// Mock a file whose body contains inline SVG — with nested groups, sibling <style> blocks of
// formatted/braced CSS at different nesting depths, an inline style="fill:#ff0000"
// declaration, and href="#petal" — plus markdown code (a single-backtick span, a
// double-backtick-escaped span, and a fenced code block), a real tag, and a bare hex-looking
// word. Two separate tag-matching paths need to ignore everything inside the markup and code
// (via findProtectedSpans/isProtected, see protected-spans.js) while still picking up
// `#realtag` and `#abcdef` (typed as tags, with nothing marking them as markup/code):
//   1. tagParser (render-time) — injects <span class="tag"> into rendered HTML
//   2. regex_tag in file-info.js (load-time) — builds file.tags Map for filters
async function loadRoseFile(page) {
  await page.addInitScript(() => {
    const content =
      '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<style>.cls-1 { fill: #ffffff; stroke: #1e1e1e; }</style>' +
        '<style>.cls-2 { fill: #123456; }</style>' + // sibling style block
        '<ellipse id="petal" cx="100" cy="70" rx="15" ry="30" style="fill:#ff0000"/>' +
      '</defs>' +
      '<g fill="#333333">' +
        '<g stroke="#444444">' +
          '<use href="#petal"/>' +
        '</g>' +
      '</g>' +
      '</svg>\n\n' +
      'A real tag: #realtag\n\n' +
      'A hex-looking tag: #abcdef\n\n' +
      'Inline code: `git checkout #branch` should stay literal.\n\n' +
      'Escaped: `` `#nested` `` should also stay literal.\n\n' +
      '```css\n#selector { color: red; }\n```\n';

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
  await loadFolder(page);
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
  // `#ff0000` style attribute, either sibling <style> block's hex colours, the
  // `#333333`/`#444444` fill/stroke attributes on the nested <g> elements, or `#branch`/
  // `#nested`/`#selector` inside code — all of which are markup or code, not tags, regardless
  // of nesting depth.
  const tagCount = await page.locator('#modal-content-text .tag').count();
  expect(tagCount).toBe(2);
  const tagTexts = await page.locator('#modal-content-text .tag').allTextContents();
  expect(tagTexts.some(t => /realtag/.test(t))).toBe(true);
  expect(tagTexts.some(t => /abcdef/.test(t))).toBe(true);

  // Code content must render literally, with no leaked/corrupted tag-span markup inside it —
  // this is the actual bug: tagParser runs before the markdown renderer, so without protection
  // it wraps '#branch' etc. in a <span> *before* marked() treats the backticks as literal,
  // producing visibly broken escaped-HTML text in the rendered code.
  const codeTexts = await page.locator('#modal-content-text code').allTextContents();
  expect(codeTexts.some(t => t.includes('git checkout #branch'))).toBe(true);
  expect(codeTexts.some(t => t.includes('`#nested`'))).toBe(true);
  expect(codeTexts.some(t => t.includes('#selector { color: red; }'))).toBe(true);
  expect(await page.locator('#modal-content-text code .tag').count()).toBe(0);
});


// A '<' that opens no tag must protect nothing. The span used to run from any '<' to the next
// '>', however far below, so `a <- b` above a list hid every #tag and [[link]] down to a '>'
// in a later bullet — from the tag panel, the open note and the link check alike.
test.describe('a "<" that is not markup protects nothing', () => {
  const protectedText = async (text) => {
    const { findProtectedSpans } = await appModule('services/file-parsing/protected-spans.js');
    return findProtectedSpans(text).map(([start, end]) => text.slice(start, end));
  };

  for (const [name, text] of [
    ['an arrow',                       'debug <- testing\n\n- This #test tag\n\nThis #test too\n\n- the greater than > symbol'],
    ['a spaced comparison',            'if a < b then #test is > c'],
    ['a heart',                        '<3 #test >'],
    ['letters, then a blank line',     'x <y #test\n\nmore #test >'],
    ['an apostrophe, then a blank line', "a <b doesn't\n\nhave a #test it's > c"],
    ['a tag broken by a blank line',   '<svg\n\n  fill="#fff">'],
  ]) {
    test(name, async () => {
      expect(await protectedText(text)).toEqual([]);
    });
  }

  test('the tags it used to hide are found and rendered', async () => {
    const { tagParser } = await appModule('services/file-tagparser.js');
    const html = tagParser('debug <- testing\n\n- one #test\n\ntwo #test\n\n- the greater than > symbol #test');
    expect(html.match(/data-tag="test"/g)).toHaveLength(3);
  });
});

test.describe('real markup is still protected', () => {
  for (const text of [
    '<use href="#petal"/>',
    '<svg\n  fill="#fff"\n  viewBox="0 0 1 1">',
    '<a title="a<b>c" href="#x">',
    '<font color=#ff0000>',
    '</div>',
    '<!-- #todo later -->',
    '<https://example.com/page#section>',
  ]) {
    test(JSON.stringify(text), async () => {
      const { findProtectedSpans } = await appModule('services/file-parsing/protected-spans.js');
      expect(findProtectedSpans(text)).toEqual([[0, text.length]]);
    });
  }
});
