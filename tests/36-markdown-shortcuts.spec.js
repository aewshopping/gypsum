const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithSaveSupport, loadFolder } = require('./helpers');

const EDITOR = '#modal-content-text .text-editor';

/**
 * Opens the first note and switches the modal into text (editor) view.
 */
async function openEditor(page) {
  await setupMockDirectoryWithSaveSupport(page);
  await page.goto('/');
  await loadFolder(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
}

/**
 * Replaces the editor contents. innerHTML (not textContent) so newlines are <br>
 * elements, matching what the renderer actually builds.
 */
async function setEditorHtml(page, html) {
  await page.evaluate(({ sel, html }) => {
    const pre = document.querySelector(sel);
    pre.innerHTML = html;
    pre.dispatchEvent(new Event('input', { bubbles: true }));
  }, { sel: EDITOR, html });
}

/** Reads the editor's text the same way the save path does. */
async function editorText(page) {
  return page.evaluate((sel) => document.querySelector(sel).innerHTML
    .replace(/<br>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>'), EDITOR);
}

/** Selects [start, end) by character offset, counting each <br> as one character. */
async function selectRange(page, start, end) {
  await page.evaluate(({ sel, start, end }) => {
    const pre = document.querySelector(sel);
    pre.focus();
    const range = document.createRange();
    let pos = 0;
    let startSet = false;
    for (const child of pre.childNodes) {
      const len = child.nodeType === Node.TEXT_NODE ? child.nodeValue.length : 1;
      const childEnd = pos + len;
      if (!startSet && childEnd > start) {
        child.nodeType === Node.TEXT_NODE
          ? range.setStart(child, start - pos)
          : range.setStartBefore(child);
        startSet = true;
      }
      if (startSet && childEnd >= end) {
        child.nodeType === Node.TEXT_NODE
          ? range.setEnd(child, end - pos)
          : range.setEndAfter(child);
        break;
      }
      pos = childEnd;
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, { sel: EDITOR, start, end });
}

/** Selects the first occurrence of a substring. */
async function selectText(page, needle) {
  const text = await editorText(page);
  const start = text.indexOf(needle);
  expect(start, `"${needle}" should be present`).toBeGreaterThanOrEqual(0);
  await selectRange(page, start, start + needle.length);
}

const selectedText = (page) => page.evaluate(() => window.getSelection().toString());

test.describe('markdown bold / italic shortcuts', () => {

  test('Ctrl+B wraps the selection in **', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'the quick brown fox');
    await selectText(page, 'brown');
    await page.keyboard.press('Control+b');
    expect(await editorText(page)).toBe('the quick **brown** fox');
  });

  test('Ctrl+B strips ** when the markers are inside the selection', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'the quick **brown** fox');
    await selectText(page, '**brown**');
    await page.keyboard.press('Control+b');
    expect(await editorText(page)).toBe('the quick brown fox');
  });

  test('Ctrl+B strips ** when the markers are just outside the selection', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'the quick **brown** fox');
    await selectText(page, 'brown');
    await page.keyboard.press('Control+b');
    expect(await editorText(page)).toBe('the quick brown fox');
  });

  test('Ctrl+I toggles _ inside, outside and back', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'the quick brown fox');

    await selectText(page, 'brown');
    await page.keyboard.press('Control+i');
    expect(await editorText(page)).toBe('the quick _brown_ fox');

    await selectText(page, '_brown_');
    await page.keyboard.press('Control+i');
    expect(await editorText(page)).toBe('the quick brown fox');

    await selectText(page, 'brown');
    await page.keyboard.press('Control+i');
    await selectText(page, 'brown');
    await page.keyboard.press('Control+i');
    expect(await editorText(page)).toBe('the quick brown fox');
  });

  test('the text stays selected, so the toggle can be pressed twice', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'the quick brown fox');
    await selectText(page, 'brown');

    await page.keyboard.press('Control+b');
    expect(await selectedText(page)).toBe('brown');
    expect(await editorText(page)).toBe('the quick **brown** fox');

    await page.keyboard.press('Control+b');
    expect(await selectedText(page)).toBe('brown');
    expect(await editorText(page)).toBe('the quick brown fox');
  });

  test('bold and italic compose on the same phrase', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'the quick brown fox');
    await selectText(page, 'brown');
    await page.keyboard.press('Control+b');
    await page.keyboard.press('Control+i');
    expect(await editorText(page)).toBe('the quick **_brown_** fox');
  });

  test('a selection spanning a line break wraps without breaking the flat DOM', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'line one<br>line two<br>line three');
    await selectText(page, 'one\nline two');
    await page.keyboard.press('Control+b');
    expect(await editorText(page)).toBe('line **one\nline two**\nline three');
    expect(await selectedText(page)).toContain('one');

    // The editor must stay flat — a <div> here would be written verbatim to the saved file.
    const html = await page.evaluate((sel) => document.querySelector(sel).innerHTML, EDITOR);
    expect(html).not.toContain('<div');

    await selectText(page, 'one\nline two');
    await page.keyboard.press('Control+b');
    expect(await editorText(page)).toBe('line one\nline two\nline three');
  });

  test('a collapsed caret is a no-op', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'the quick brown fox');
    await page.evaluate((sel) => {
      const pre = document.querySelector(sel);
      pre.focus();
      const range = document.createRange();
      range.setStart(pre.firstChild, 4);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }, EDITOR);
    await page.keyboard.press('Control+b');
    expect(await editorText(page)).toBe('the quick brown fox');
  });

  test('undo restores the text after wrapping and after unwrapping', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'the quick brown fox');

    // Each marker is inserted separately, so a toggle takes two undo steps.
    await selectText(page, 'brown');
    await page.keyboard.press('Control+b');
    expect(await editorText(page)).toBe('the quick **brown** fox');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await editorText(page)).toBe('the quick brown fox');

    await selectText(page, 'brown');
    await page.keyboard.press('Control+b');
    await selectText(page, 'brown');
    await page.keyboard.press('Control+b');
    expect(await editorText(page)).toBe('the quick brown fox');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await editorText(page)).toBe('the quick **brown** fox');
  });

  test('the shortcut is inert in html view', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'the quick brown fox');
    const before = await editorText(page);
    await page.evaluate(() => document.getElementById('render_toggle').click());
    await page.keyboard.press('Control+b');
    await page.evaluate(() => document.getElementById('render_toggle').click());
    expect(await editorText(page)).toBe(before);
  });

  test('wrapping fires the input event that drives dirty-marking', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'the quick brown fox');
    await page.evaluate((sel) => {
      window.__inputEvents = 0;
      document.querySelector(sel).addEventListener('input', () => { window.__inputEvents += 1; });
    }, EDITOR);
    await selectText(page, 'brown');
    await page.keyboard.press('Control+b');
    // The input event is what drives dirty-marking and autosave, so firing it is the contract.
    // One per marker, since the two markers are inserted separately.
    expect(await page.evaluate(() => window.__inputEvents)).toBe(2);
  });

  test('wrap then unwrap round-trips content with &, < and nbsp intact', async ({ page }) => {
    await openEditor(page);
    const original = 'a &amp; b &lt;tag&gt;&nbsp;and brown fox';
    await setEditorHtml(page, original);
    const before = await editorText(page);

    await selectText(page, 'brown');
    await page.keyboard.press('Control+b');
    expect(await editorText(page)).toContain('**brown**');

    await selectText(page, 'brown');
    await page.keyboard.press('Control+b');
    expect(await editorText(page)).toBe(before);
  });

  test('a selection anchored outside the editor is ignored', async ({ page }) => {
    await openEditor(page);
    await setEditorHtml(page, 'the quick brown fox');
    const before = await editorText(page);

    // Anchor the range in the modal chrome and dispatch the keydown at the editor, so the
    // handler runs but the contains() guard is what has to stop it.
    const ran = await page.evaluate((sel) => {
      const pre = document.querySelector(sel);
      const outside = document.getElementById('modal-content');
      const range = document.createRange();
      range.setStart(outside, 0);
      range.setEnd(pre.firstChild, 9);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return pre.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'b', ctrlKey: true, bubbles: true, cancelable: true,
      }));
    }, EDITOR);

    expect(ran).toBe(false); // preventDefault ran, so the handler was reached
    expect(await editorText(page)).toBe(before);
  });

  test('the settings modal lists both shortcuts', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await loadFolder(page);
    await page.keyboard.press('?');
    const settings = page.locator('#modal-settings');
    await expect(settings).toBeVisible();
    await expect(settings).toContainText('Bold selection');
    await expect(settings).toContainText('Italic selection');
  });
});
