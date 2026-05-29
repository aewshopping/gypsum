const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
  setupMockDirectoryWithSaveSupport,
  setupMockDirectoryForColorExisting,
} = require('./helpers');

// Parse COLOR_NAMES from the app's constants.js so tests adapt automatically when
// the palette changes, without duplicating the list here.
const constantsSrc = fs.readFileSync(
  path.join(__dirname, '../public/js/constants.js'), 'utf8'
);
const ALL_COLOURS = constantsSrc
  .match(/COLOR_NAMES\s*=\s*\[([^\]]+)\]/)[1]
  .match(/["']([^"']+)["']/g)
  .map(s => s.slice(1, -1));

// Two distinct colours used by tests 2 and 4. COLOUR_0 is pre-inserted in the mock
// file; COLOUR_1 is the replacement chosen from the picker.
const COLOUR_0 = ALL_COLOURS[0];
const COLOUR_1 = ALL_COLOURS[1];

async function openModal(page) {
  await page.click('[data-click-loadfolder]');
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
}

async function switchToTxt(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
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

test.describe('colour picker modal', () => {

  test('clicking the color button opens the colour picker modal', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.click('[data-action="editor-color-pick"]');

    await expect(page.locator('#modal-color-picker')).toBeVisible();
    await expect(page.locator('[data-action="color-circle-pick"]').first()).toBeVisible();
  });

  test('existing colour above cursor is replaced and cursor offset is adjusted', async ({ page }) => {
    // File: '# My Notes\n#color/{COLOUR_0}\nText below'
    // Cursor placed at end of file (after the tag), so the tag is "above" the cursor.
    // Picking COLOUR_1 must replace COLOUR_0 and shift the cursor by the length delta.
    await setupMockDirectoryForColorExisting(page, COLOUR_0);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // Place cursor at the end of the file (after the colour tag).
    await page.locator('#modal-content-text pre').click();
    await page.evaluate(() => {
      const el = document.querySelector('#modal-content-text .text-editor');
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });

    const savedOffset = await getCursorOffset(page);

    await page.click('[data-action="editor-color-pick"]');
    await expect(page.locator('#modal-color-picker')).toBeVisible();
    await page.click(`[data-action="color-circle-pick"][data-color-value="${COLOUR_1.replace(/^#/, '')}"]`);
    await expect(page.locator('#modal-color-picker')).not.toBeVisible();

    const editorText = await page.locator('#modal-content-text pre').textContent();
    expect(editorText).toContain(`#color/${COLOUR_1.replace(/^#/, '')}`);
    expect(editorText).not.toContain(`#color/${COLOUR_0.replace(/^#/, '')}`);

    const newOffset = await getCursorOffset(page);
    const delta = COLOUR_1.length - COLOUR_0.length;
    expect(newOffset).toBe(savedOffset + delta);
  });

  test('when no colour exists, new colour is added on a new line at the end', async ({ page }) => {
    // Picks whichever colour appears first in the modal rather than a hardcoded name.
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.click('[data-action="editor-color-pick"]');
    await expect(page.locator('#modal-color-picker')).toBeVisible();

    const firstBtn = page.locator('[data-action="color-circle-pick"]').first();
    const colourName = await firstBtn.getAttribute('data-color-value');
    await firstBtn.click();
    await expect(page.locator('#modal-color-picker')).not.toBeVisible();

    // Use innerText (not textContent) so <br> elements appear as \n.
    const editorText = await page.evaluate(() =>
      document.querySelector('#modal-content-text pre').innerText
    );
    expect(editorText).toContain('# My Notes');
    expect(editorText).toContain('Some content here');
    expect(editorText).toMatch(new RegExp(`\n\n#color\\/${colourName}\\s*$`));
  });

  test('cursor stays at its position when colour tag is below the cursor', async ({ page }) => {
    // File: '# My Notes\n#color/{COLOUR_0}\nText below'
    // Cursor placed at offset 5 ('# My |Notes'), before the tag on line 2.
    // Picking COLOUR_1 must replace the tag without shifting the cursor.
    await setupMockDirectoryForColorExisting(page, COLOUR_0);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // Place cursor at offset 5 inside the first text node ('# My |Notes').
    await page.locator('#modal-content-text pre').click();
    await page.evaluate(() => {
      const el = document.querySelector('#modal-content-text .text-editor');
      const textNode = el.childNodes[0];
      const range = document.createRange();
      range.setStart(textNode, 5);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });

    const savedOffset = await getCursorOffset(page);
    expect(savedOffset).toBe(5);

    await page.click('[data-action="editor-color-pick"]');
    await expect(page.locator('#modal-color-picker')).toBeVisible();
    await page.click(`[data-action="color-circle-pick"][data-color-value="${COLOUR_1.replace(/^#/, '')}"]`);
    await expect(page.locator('#modal-color-picker')).not.toBeVisible();

    await expect(page.locator('#modal-content-text pre')).toContainText(`#color/${COLOUR_1.replace(/^#/, '')}`);

    // Tag was below the cursor so no delta — cursor must stay at offset 5.
    const newOffset = await getCursorOffset(page);
    expect(newOffset).toBe(5);
  });

});
