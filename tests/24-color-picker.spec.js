const { test, expect } = require('@playwright/test');
const {
  setupMockDirectoryWithSaveSupport,
  setupMockDirectoryForColorExisting,
  setupMockDirectoryForColorMultiple,
} = require('./helpers');

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
    // File: '# My Notes\n#color/coral\nText below'
    // #color/coral starts at text offset 11 (after '# My Notes\n')
    // 'coral' = 5 chars, 'steelblue' = 9 chars, delta = +4
    await setupMockDirectoryForColorExisting(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // Place cursor at end of file (after the colour tag, so it is "above" the cursor)
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
    await page.click('[data-action="color-circle-pick"][data-color-value="steelblue"]');
    await expect(page.locator('#modal-color-picker')).not.toBeVisible();

    const editorText = await page.locator('#modal-content-text pre').textContent();
    expect(editorText).toContain('#color/steelblue');
    expect(editorText).not.toContain('#color/coral');

    const newOffset = await getCursorOffset(page);
    const delta = 'steelblue'.length - 'coral'.length; // 4
    expect(newOffset).toBe(savedOffset + delta);
  });

  test('when no colour exists, new colour is added on a new line at the end', async ({ page }) => {
    // File: '# My Notes\nSome content here' — no #color/ tag
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.click('[data-action="editor-color-pick"]');
    await expect(page.locator('#modal-color-picker')).toBeVisible();
    await page.click('[data-action="color-circle-pick"][data-color-value="coral"]');
    await expect(page.locator('#modal-color-picker')).not.toBeVisible();

    // Use innerText (not textContent) so <br> elements appear as \n.
    const editorText = await page.evaluate(() =>
      document.querySelector('#modal-content-text pre').innerText
    );
    expect(editorText).toContain('# My Notes');
    expect(editorText).toContain('Some content here');
    expect(editorText).toMatch(/\n\n#color\/coral\s*$/);
  });

  test('cursor stays at its position when colour tag is below the cursor', async ({ page }) => {
    // Trickiest case: cursor is BEFORE the #color/coral tag in the file (offset 5
    // vs tag at offset 11). Replacing the tag must not shift the cursor.
    // File: '# My Notes\n#color/coral\nText below'
    await setupMockDirectoryForColorExisting(page);
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
    await page.click('[data-action="color-circle-pick"][data-color-value="steelblue"]');
    await expect(page.locator('#modal-color-picker')).not.toBeVisible();

    await expect(page.locator('#modal-content-text pre')).toContainText('#color/steelblue');

    // Tag was BELOW the cursor so no delta — cursor must stay at offset 5.
    const newOffset = await getCursorOffset(page);
    expect(newOffset).toBe(5);
  });

  test('when multiple colours exist, only the first is changed', async ({ page }) => {
    // File: '# My Notes\n#color/coral\nSome text\n#color/blue'
    await setupMockDirectoryForColorMultiple(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.click('[data-action="editor-color-pick"]');
    await expect(page.locator('#modal-color-picker')).toBeVisible();
    await page.click('[data-action="color-circle-pick"][data-color-value="goldenrod"]');
    await expect(page.locator('#modal-color-picker')).not.toBeVisible();

    const editorText = await page.locator('#modal-content-text pre').textContent();
    expect(editorText).toContain('#color/goldenrod');
    expect(editorText).not.toContain('#color/coral');
    expect(editorText).toContain('#color/blue');
  });

});
