const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithHistory, setupMockDirectoryWithSaveSupport } = require('./helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

async function openModal(page) {
  await page.click('[data-click-loadfolder]');
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 1);
}

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

// Places caret at end of the <pre>, focusing it.
async function focusAtEnd(page) {
  await page.evaluate(() => {
    const pre = document.querySelector('#modal-content-text .text-editor');
    pre.focus();
    const range = document.createRange();
    range.selectNodeContents(pre);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

async function readEditorText(page) {
  return await page.evaluate(() => {
    const pre = document.querySelector('#modal-content-text .text-editor');
    return pre ? pre.innerText : null;
  });
}

async function readLiveRaw(page) {
  return await page.evaluate(() => window.appState.editSession.liveRaw);
}

async function undoCount(page) {
  return await page.evaluate(() => window.appState.editSession.undo.done.length);
}

async function redoCount(page) {
  return await page.evaluate(() => window.appState.editSession.undo.undone.length);
}

test.describe('Undo/redo in the plain-text editor', () => {

  test('single-character typing: Ctrl+Z unwinds, Ctrl+Y redoes', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await focusAtEnd(page);

    const before = await readLiveRaw(page);

    await page.keyboard.type('XYZ', { delay: 50 });
    expect(await readLiveRaw(page)).toBe(before + 'XYZ');

    // Within the 500ms grouping window — the three chars should merge.
    expect(await undoCount(page)).toBe(1);

    await page.keyboard.press('Control+z');
    expect(await readLiveRaw(page)).toBe(before);

    await page.keyboard.press('Control+y');
    expect(await readLiveRaw(page)).toBe(before + 'XYZ');
  });

  test('temporal grouping boundary: 600ms pause splits transactions', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await focusAtEnd(page);

    const before = await readLiveRaw(page);

    await page.keyboard.type('abc', { delay: 20 });
    await page.waitForTimeout(600);
    await page.keyboard.type('def', { delay: 20 });

    expect(await readLiveRaw(page)).toBe(before + 'abcdef');
    expect(await undoCount(page)).toBe(2);

    await page.keyboard.press('Control+z');
    expect(await readLiveRaw(page)).toBe(before + 'abc');

    await page.keyboard.press('Control+z');
    expect(await readLiveRaw(page)).toBe(before);
  });

  test('new edit after undo clears the redo stack', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await focusAtEnd(page);

    const before = await readLiveRaw(page);

    await page.keyboard.type('abc', { delay: 20 });
    await page.keyboard.press('Control+z');
    expect(await redoCount(page)).toBe(1);

    await page.keyboard.type('x');
    expect(await redoCount(page)).toBe(0);

    // Ctrl+Y should now be inert.
    const afterTyping = await readLiveRaw(page);
    await page.keyboard.press('Control+y');
    expect(await readLiveRaw(page)).toBe(afterTyping);

    expect(afterTyping).toBe(before + 'x');
  });

  test('undo stack survives txt->html->txt toggle', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await focusAtEnd(page);

    const before = await readLiveRaw(page);

    await page.keyboard.type('Hello', { delay: 20 });
    expect(await undoCount(page)).toBe(1);

    await switchToHtml(page);
    await switchToTxt(page);

    // Stacks preserved across mode toggle.
    expect(await undoCount(page)).toBe(1);

    await focusAtEnd(page);
    await page.keyboard.press('Control+z');
    expect(await readLiveRaw(page)).toBe(before);
  });

  test('undo stack survives a historical version round-trip', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);

    await switchToTxt(page);
    await focusAtEnd(page);
    const before = await readLiveRaw(page);

    await page.keyboard.type('NEW', { delay: 20 });
    expect(await undoCount(page)).toBe(1);

    // Browse a historical version.
    await page.selectOption('#file-content-history-select', { index: 2 });
    expect(await undoCount(page)).toBe(1);  // stacks untouched during pause

    // Back to current.
    await page.selectOption('#file-content-history-select', { value: 'current' });
    expect(await undoCount(page)).toBe(1);

    await focusAtEnd(page);
    await page.keyboard.press('Control+z');
    expect(await readLiveRaw(page)).toBe(before);
  });

  test('opening a different file clears the undo stack', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');

    // Open notes.md, type, confirm one transaction.
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await switchToTxt(page);
    await focusAtEnd(page);
    await page.keyboard.type('mutation', { delay: 20 });
    expect(await undoCount(page)).toBeGreaterThan(0);

    // Close modal and re-open — simulates opening the same file afresh,
    // which calls loadContentModal → resetUndoStacks().
    await page.keyboard.press('Escape');
    // The unsaved-changes dialog may intercept; discard.
    const discard = page.locator('[data-action="discard-modal-changes"]');
    if (await discard.isVisible().catch(() => false)) {
      await discard.click();
    }
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();

    expect(await undoCount(page)).toBe(0);
    expect(await redoCount(page)).toBe(0);
  });

  test('Delete key (deleteContentForward) keeps liveRaw in sync', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await focusAtEnd(page);

    // Position caret at start of the last line so Delete has somewhere to go.
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text .text-editor');
      const raw = window.appState.editSession.liveRaw;
      const lastNl = raw.lastIndexOf('\n');
      const target = lastNl + 1;
      const tn = [...pre.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.previousSibling?.nodeName === 'BR');
      if (tn) {
        const range = document.createRange();
        range.setStart(tn, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });

    const raw = await readLiveRaw(page);
    await page.keyboard.press('Delete');
    const after = await readLiveRaw(page);
    // One character should have been removed from liveRaw.
    expect(after.length).toBe(raw.length - 1);
    const preText = await readEditorText(page);
    // DOM and liveRaw stay in sync (normalising line endings).
    expect(preText.replace(/\r\n/g, '\n').trimEnd()).toBe(after.trimEnd());
  });

  test('Ctrl+Backspace (deleteWordBackward) keeps liveRaw in sync', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await focusAtEnd(page);

    await page.keyboard.type(' alpha beta', { delay: 20 });
    const before = await readLiveRaw(page);
    await page.keyboard.press('Control+Backspace');
    const after = await readLiveRaw(page);

    // Word-delete removes "beta" and leaves the preceding whitespace (matches
    // Chromium's own Ctrl+Backspace behaviour on a plain textarea).
    expect(after).toBe(before.slice(0, before.length - 4));
    const preText = await readEditorText(page);
    expect(preText.replace(/\r\n/g, '\n').trimEnd()).toBe(after.trimEnd());
  });

  test('type -> backspace -> type keeps liveRaw in sync with the DOM', async ({ page }) => {
    // Regression: Chromium may return an empty getTargetRanges() for
    // deleteContentBackward, which previously caused our handler to bail
    // without preventDefault(). The browser then deleted natively while
    // liveRaw stayed stale, so subsequent inserts spliced into stale text
    // and the deleted characters visibly reappeared.
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await focusAtEnd(page);

    const before = await readLiveRaw(page);

    await page.keyboard.type('XYZ', { delay: 50 });
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('A', { delay: 50 });
    await page.keyboard.type('B', { delay: 50 });

    expect(await readLiveRaw(page)).toBe(before + 'XAB');

    const preText = await readEditorText(page);
    // innerText collapses <br> into \n; our liveRaw already uses \n.
    expect(preText.replace(/\r\n/g, '\n').trimEnd()).toBe((before + 'XAB').trimEnd());
  });

  test('Ctrl+Z on an empty stack is inert', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await focusAtEnd(page);

    const before = await readLiveRaw(page);
    await page.keyboard.press('Control+z');
    expect(await readLiveRaw(page)).toBe(before);
    expect(await undoCount(page)).toBe(0);
  });

  test('typing in a CRLF file inserts at the caret, not offset left', async ({ page }) => {
    // Regression: liveRaw previously kept literal \r\n (2 chars per line
    // break) while the DOM collapsed each \r\n to a single <br> (1 char).
    // nodeOffsetToIndex() under-counted by N (the number of \r\n before
    // the caret), so splices landed N positions too far left.
    await page.addInitScript(() => {
      const content = '---\r\ntitle: Test\r\ntag: x\r\n---\r\n\r\nBody line one\r\nBody line two';
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
    await page.click('[data-click-loadfolder]');
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await switchToTxt(page);
    await focusAtEnd(page);

    const before = await readLiveRaw(page);
    await page.keyboard.type('Z', { delay: 20 });
    const after = await readLiveRaw(page);

    // Z must land at the end, not offset by the count of \r\n before it.
    expect(after).toBe(before + 'Z');

    // DOM must agree with liveRaw.
    const preText = await readEditorText(page);
    expect(preText.replace(/\r\n/g, '\n').trimEnd()).toBe(after.trimEnd());
  });

});
