const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
  setupMockDirectoryWithSaveSupport,
  setupMockDirectoryForColorExisting,
  loadFolder,
} = require('../helpers');

// Parse COLOR_NAMES from the app's constants.js so tests adapt automatically when
// the palette changes, without duplicating the list here.
const constantsSrc = fs.readFileSync(
  path.join(__dirname, '../../public/js/constants.js'), 'utf8'
);
const ALL_COLOURS = constantsSrc
  .match(/COLOR_NAMES\s*=\s*\[([^\]]+)\]/)[1]
  .match(/["']([^"']+)["']/g)
  .map(s => s.slice(1, -1));

// The first palette colour, used as the replacement. A hex, so it is written quoted and carrying
// its '#' — which is what makes its length differ from the named colour the fixture starts with,
// and so what makes the cursor adjustment visible.
const HEX_COLOUR = ALL_COLOURS[0];

async function openModal(page) {
  await loadFolder(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
}

async function switchToTxt(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre').first()).toBeVisible();
}

function getCursorOffset(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#modal-content-text .text-editor');
    if (!el) return 0;
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  });
}

/** The editor's text with <br> read as a newline, which textContent does not do. */
const editorText = page => page.evaluate(() =>
  document.querySelector('#modal-content-text pre').innerText);

/** Puts the cursor at the very end of the note, so every splice above it has to move it. */
async function cursorToEnd(page) {
  await page.locator('#modal-content-text pre').first().click();
  await page.evaluate(() => {
    const el = document.querySelector('#modal-content-text .text-editor');
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
}

async function pick(page, colourValue) {
  await page.click('[data-action="editor-color-pick"]');
  await expect(page.locator('#modal-color-picker')).toBeVisible();
  await page.click(`[data-action="color-circle-pick"][data-color-value="${colourValue}"]`);
  await expect(page.locator('#modal-color-picker')).not.toBeVisible();
}

// The picker writes the note's `color:` front matter key, not a `#color/…` tag. It still goes
// through execCommand, so the browser's own undo takes the colour back in one step — which is the
// whole reason it edits the editor's text rather than the file.
test.describe('colour picker modal', () => {

  test('an existing colour is replaced in place, and the cursor moves with it', async ({ page }) => {
    // File: '---\ncolor: coral\n---\n\n# My Notes\nText below', cursor at the end, so the key
    // being rewritten sits above it.
    await setupMockDirectoryForColorExisting(page, 'coral');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await cursorToEnd(page);

    const savedOffset = await getCursorOffset(page);
    await pick(page, HEX_COLOUR);

    const text = await editorText(page);
    expect(text).toContain(`color: "${HEX_COLOUR}"`);   // quoted, because of the '#'
    expect(text).not.toContain('coral');
    expect(text).toContain('# My Notes');               // and nothing else moved

    // The value went from ' coral' to ' "#xxxxxx"', and the cursor was below it.
    const delta = ` "${HEX_COLOUR}"`.length - ' coral'.length;
    expect(await getCursorOffset(page)).toBe(savedOffset + delta);
  });

  test('a note with no front matter is given a block to hold the colour', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);   // '# My Notes\nSome content here'
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await pick(page, HEX_COLOUR);

    // Byte 0, above the note's own content. The multi-line insert goes in as one execCommand, and
    // the browser lays the new lines out as blocks, so innerText reads one more break after the
    // closing separator than the spliced text carries.
    expect(await editorText(page))
      .toBe(`---\ncolor: "${HEX_COLOUR}"\n---\n\n\n# My Notes\nSome content here`);
  });

  test('picking no colour removes the key, rather than writing one', async ({ page }) => {
    // It used to write a literal '#color/nocolor' tag, so "remove colour" added one.
    await setupMockDirectoryForColorExisting(page, 'coral');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await pick(page, 'nocolor');

    expect(await editorText(page)).toBe('---\n---\n\n# My Notes\nText below');
  });

  test('the undo stack still owns the change', async ({ page }) => {
    // execCommand is what buys this, and it is why the picker edits the editor and not the file.
    await setupMockDirectoryForColorExisting(page, 'coral');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    const before = await editorText(page);

    await pick(page, HEX_COLOUR);
    expect(await editorText(page)).not.toBe(before);

    await page.locator('#modal-content-text .text-editor').press('Control+z');
    expect(await editorText(page)).toBe(before);
  });

});
