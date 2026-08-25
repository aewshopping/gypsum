const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithSaveSupport, setupMockDirectoryWithHistoryAndSave, loadFolder } = require('./helpers');

// Shared helpers (same patterns as 12-save-button.spec.js)

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

async function switchToTxt(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
}

async function editContent(page, text) {
  await page.evaluate((content) => {
    const pre = document.querySelector('#modal-content-text pre');
    pre.textContent = content;
    pre.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

// The Autosave setting defaults to on, which writes through to the original file.
// The silent temp-file path below is the autosave-off behaviour, so those tests
// switch the setting off first.
async function setAutosave(page, enabled) {
  await page.evaluate((on) => {
    document.getElementById('autosave-enabled').checked = on;
  }, enabled);
}

// Advance the fake clock past the 3-second pause, then wait for async file ops.
async function fireDebouncedAutosave(page) {
  await page.clock.runFor(3001);
  await page.waitForTimeout(300);
}

// ─── Writing through to the original file (autosave on) ──────────────────────

test.describe('autosave writes through to the original file', () => {

  test('saves the original file after a pause in typing', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();
    await editContent(page, 'written straight through');
    await fireDebouncedAutosave(page);

    expect(await page.evaluate(() => window.__originalFiles['notes.md'])).toBe('written straight through');
  });

  test('leaves no temp file behind — it uses the manual save path', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();
    await editContent(page, 'no temp file for this one');
    await fireDebouncedAutosave(page);

    const savedFiles = await page.evaluate(() => Object.keys(window.__savedFiles));
    expect(savedFiles).not.toContain('notes.md-temp.gypsum');
    // The intermediate -save.gypsum is deleted once the original is verified
    expect(savedFiles).not.toContain('notes.md-save.gypsum');
  });

  test('marks the file as saved once the save icon finishes spinning', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();
    await editContent(page, 'content that will be autosaved');
    await expect(page.locator('#modal-content')).not.toHaveClass(/saved/);

    await fireDebouncedAutosave(page);
    await page.clock.runFor(900); // the save-icon spin, after which the indicator updates

    await expect(page.locator('#modal-content')).toHaveClass(/saved/);
  });

  test('closing after an autosave raises no unsaved-changes warning', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();
    await editContent(page, 'autosaved before closing');
    await fireDebouncedAutosave(page);

    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#modal-unsaved-warning')).toBeHidden();
    await expect(page.locator('#file-content-modal')).toBeHidden();
  });

  test('saves at the edit ceiling when typing never pauses for long enough', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await page.clock.install();

    // MAX_EDITS in autosave.js. One short of the ceiling, with the clock never advanced
    // far enough for the pause timer, nothing is written.
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      for (let i = 0; i < 199; i++) {
        pre.textContent = `edit ${i}`;
        pre.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.clock.runFor(100);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__originalFiles['notes.md'])).toBeUndefined();

    // The 200th edit hits the ceiling and schedules at zero delay
    await editContent(page, 'the two hundredth edit');
    await page.clock.runFor(1);
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => window.__originalFiles['notes.md'])).toBe('the two hundredth edit');
  });

});

// ─── Saving on the way out (autosave on) ─────────────────────────────────────

test.describe('autosave saves when the user leaves', () => {

  test('saves when the window loses focus', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await editContent(page, 'edited then tabbed away');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => window.__originalFiles['notes.md'])).toBe('edited then tabbed away');
  });

  test('saves when the page becomes hidden', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await editContent(page, 'edited then backgrounded');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => window.__originalFiles['notes.md'])).toBe('edited then backgrounded');
  });

  test('saves when the modal is closed with the close button', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await editContent(page, 'saved by the close button');
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).toBeHidden();

    expect(await page.evaluate(() => window.__originalFiles['notes.md'])).toBe('saved by the close button');
  });

  test('saves when the modal is closed with Escape', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await editContent(page, 'saved by escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('#file-content-modal')).toBeHidden();

    expect(await page.evaluate(() => window.__originalFiles['notes.md'])).toBe('saved by escape');
  });

  test('saves when the modal is closed by clicking outside it', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await editContent(page, 'saved by clicking outside');
    // Press and release on the dialog itself — the backdrop — not on its content
    await page.locator('#file-content-modal').click({ position: { x: 4, y: 4 } });
    await expect(page.locator('#file-content-modal')).toBeHidden();

    expect(await page.evaluate(() => window.__originalFiles['notes.md'])).toBe('saved by clicking outside');
  });

  test('closing raises no unsaved-changes warning while autosave is on', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    await editContent(page, 'no warning expected');
    await page.click('[data-action="close-file-content-modal"]');

    await expect(page.locator('#modal-unsaved-warning')).toBeHidden();
    await expect(page.locator('#file-content-modal')).toBeHidden();
  });

  test('closing still warns when autosave is off, and writes nothing', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await setAutosave(page, false);

    await editContent(page, 'should not reach disk');
    await page.click('[data-action="close-file-content-modal"]');

    await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
    expect(await page.evaluate(() => window.__originalFiles['notes.md'])).toBeUndefined();
  });

});

// ─── Temp file creation (autosave off) ───────────────────────────────────────

test.describe('autosave temp file creation', () => {

  test('creates a -temp.gypsum file after editing and the debounce period', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await setAutosave(page, false);

    await page.clock.install();
    await editContent(page, 'my new content');
    await fireDebouncedAutosave(page);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).toContain('notes.md-temp.gypsum');
  });

  test('temp file content matches the edited text', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await setAutosave(page, false);

    await page.clock.install();
    await editContent(page, 'updated text for autosave');
    await fireDebouncedAutosave(page);

    const tempContent = await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum']);
    expect(tempContent).toBe('updated text for autosave');
  });

  test('leaves the original file untouched', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await setAutosave(page, false);

    await page.clock.install();
    await editContent(page, 'only the temp file should hold this');
    await fireDebouncedAutosave(page);

    expect(await page.evaluate(() => window.__originalFiles['notes.md'])).toBeUndefined();
  });

});

// ─── Guard conditions ─────────────────────────────────────────────────────────

test.describe('autosave guard conditions', () => {

  test('does not autosave when no editing has occurred (no input events dispatched)', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await setAutosave(page, false);

    await page.clock.install();
    // Advance well past both the debounce (3 s) and min interval (60 s)
    await page.clock.runFor(65000);
    await page.waitForTimeout(200);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).not.toContain('notes.md-temp.gypsum');
  });

  test('does not autosave when viewing a historical version', async ({ page }) => {
    await setupMockDirectoryWithHistoryAndSave(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);
    await switchToTxt(page);
    await setAutosave(page, false);

    await page.clock.install();
    // Schedule an autosave while viewing the current version
    await editContent(page, 'edited while viewing current');

    // Navigate to a historical version before the debounce fires
    await page.selectOption('#file-content-history-select', { index: 2 });

    await fireDebouncedAutosave(page);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).not.toContain('notes.md-temp.gypsum');
  });

  test('does not autosave when the content is identical to when the file was opened', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await setAutosave(page, false);

    await page.clock.install();
    // Set content back to exactly the original file content
    await editContent(page, '# My Notes\nSome content here');
    await fireDebouncedAutosave(page);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).not.toContain('notes.md-temp.gypsum');
  });

});

// ─── Timing ───────────────────────────────────────────────────────────────────

test.describe('autosave timing', () => {

  test('does not write the temp file a second time within the 1-minute minimum interval', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await setAutosave(page, false);

    await page.clock.install();

    // First autosave
    await editContent(page, 'first edit');
    await fireDebouncedAutosave(page);
    expect(await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum'])).toBe('first edit');

    // Second edit — but only 3 seconds later (far less than the 60-second minimum interval)
    await editContent(page, 'second edit');
    await fireDebouncedAutosave(page);

    // Temp file must still hold the first autosave's content
    const tempContent = await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum']);
    expect(tempContent).toBe('first edit');
  });

});

// ─── Temp file cleanup on modal close ────────────────────────────────────────

test.describe('autosave temp file cleanup on modal close', () => {

  test('temp file is deleted when modal is closed normally (no unsaved changes)', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);

    // Inject a temp file directly, simulating a previous autosave run
    await page.evaluate(() => { window.__savedFiles['notes.md-temp.gypsum'] = 'autosaved content'; });

    // No edits were made, so hasUnsavedChanges() is false — modal closes without warning
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).toBeHidden();
    await page.waitForTimeout(300);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).not.toContain('notes.md-temp.gypsum');
  });

  test('temp file is deleted when modal is closed via Discard changes', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await setAutosave(page, false);

    // Inject a temp file directly, simulating a previous autosave run
    await page.evaluate(() => { window.__savedFiles['notes.md-temp.gypsum'] = 'autosaved content'; });

    // Create unsaved changes so the warning dialog appears on close
    await editContent(page, 'additional unsaved edits');
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#modal-unsaved-warning')).toBeVisible();

    await page.click('[data-action="warning-proceed"]');
    await expect(page.locator('#file-content-modal')).toBeHidden();
    await page.waitForTimeout(300);

    const savedFiles = await page.evaluate(() => window.__savedFiles);
    expect(Object.keys(savedFiles)).not.toContain('notes.md-temp.gypsum');
  });

});

// ─── Coexistence with manual save ─────────────────────────────────────────────

test.describe('autosave coexistence with manual save', () => {

  test('manual save (Ctrl+S) still writes the original after a silent autosave has run', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await setAutosave(page, false);

    // Trigger the silent autosave first
    await page.clock.install();
    await editContent(page, 'autosaved content');
    await fireDebouncedAutosave(page);
    expect(await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum'])).toBe('autosaved content');

    // Now manual save with different content
    await editContent(page, 'manually saved content');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);

    // Manual save writes to the original file and deletes the intermediate .gypsum file
    const originalContent = await page.evaluate(() => window.__originalFiles['notes.md']);
    expect(originalContent).toBe('manually saved content');
  });

});
