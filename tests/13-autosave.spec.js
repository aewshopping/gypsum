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

/** Opens the first note in text mode with the given autosave setting. */
async function openForEditing(page, { autosave = true } = {}) {
  await setupMockDirectoryWithSaveSupport(page);
  await page.goto('/');
  await openModal(page);
  await switchToTxt(page);
  if (!autosave) await setAutosave(page, false);
}

const originalFile = (page) => page.evaluate(() => window.__originalFiles['notes.md']);
const savedFileNames = (page) => page.evaluate(() => Object.keys(window.__savedFiles));

// ─── Writing through to the original file (autosave on) ──────────────────────

test.describe('autosave writes through to the original file', () => {

  test('a pause in typing writes the original, via the manual save path', async ({ page }) => {
    await openForEditing(page);

    await page.clock.install();
    await editContent(page, 'written straight through');
    await expect(page.locator('#modal-content')).not.toHaveClass(/saved/);

    await fireDebouncedAutosave(page);

    expect(await originalFile(page)).toBe('written straight through');
    // No temp file, and the intermediate -save.gypsum is deleted once verified
    const saved = await savedFileNames(page);
    expect(saved).not.toContain('notes.md-temp.gypsum');
    expect(saved).not.toContain('notes.md-save.gypsum');

    await page.clock.runFor(900); // the save-icon spin, after which the indicator updates
    await expect(page.locator('#modal-content')).toHaveClass(/saved/);
  });

  test('closing after an autosave raises no unsaved-changes warning', async ({ page }) => {
    await openForEditing(page);

    await page.clock.install();
    await editContent(page, 'autosaved before closing');
    await fireDebouncedAutosave(page);

    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#modal-unsaved-warning')).toBeHidden();
    await expect(page.locator('#file-content-modal')).toBeHidden();
  });

  test('saves at the edit ceiling when typing never pauses for long enough', async ({ page }) => {
    await openForEditing(page);

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
    expect(await originalFile(page)).toBeUndefined();

    // The 200th edit hits the ceiling and schedules at zero delay
    await editContent(page, 'the two hundredth edit');
    await page.clock.runFor(1);
    await page.waitForTimeout(300);

    expect(await originalFile(page)).toBe('the two hundredth edit');
  });

});

// ─── Saving on the way out (autosave on) ─────────────────────────────────────

test.describe('autosave saves when the user leaves', () => {

  // Each of these is a distinct exit route into the same flush; a regression in any one
  // of them silently loses the edit, so they are checked individually.
  const exits = {
    'the window loses focus': async (page) => {
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.waitForTimeout(300);
    },
    'the page becomes hidden': async (page) => {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(300);
    },
    'the modal is closed with the close button': async (page) => {
      await page.click('[data-action="close-file-content-modal"]');
      await expect(page.locator('#file-content-modal')).toBeHidden();
    },
    'the modal is closed with Escape': async (page) => {
      await page.keyboard.press('Escape');
      await expect(page.locator('#file-content-modal')).toBeHidden();
    },
    'the modal is closed by clicking outside it': async (page) => {
      // Press and release on the dialog itself — the backdrop — not on its content
      await page.locator('#file-content-modal').click({ position: { x: 4, y: 4 } });
      await expect(page.locator('#file-content-modal')).toBeHidden();
    },
  };

  for (const [label, leave] of Object.entries(exits)) {
    test(`saves when ${label}`, async ({ page }) => {
      await openForEditing(page);
      await editContent(page, `saved because ${label}`);
      await leave(page);
      expect(await originalFile(page)).toBe(`saved because ${label}`);
    });
  }

  test('closing raises no unsaved-changes warning while autosave is on', async ({ page }) => {
    await openForEditing(page);
    await editContent(page, 'no warning expected');
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#modal-unsaved-warning')).toBeHidden();
    await expect(page.locator('#file-content-modal')).toBeHidden();
  });

  test('closing still warns when autosave is off, and writes nothing', async ({ page }) => {
    await openForEditing(page, { autosave: false });

    await editContent(page, 'should not reach disk');
    await page.click('[data-action="close-file-content-modal"]');

    await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
    expect(await originalFile(page)).toBeUndefined();
  });

});

// ─── Temp file creation (autosave off) ───────────────────────────────────────

test.describe('autosave temp file creation', () => {

  test('the debounce writes a -temp.gypsum holding the edit, leaving the original alone', async ({ page }) => {
    await openForEditing(page, { autosave: false });

    await page.clock.install();
    await editContent(page, 'updated text for autosave');
    await fireDebouncedAutosave(page);

    expect(await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum']))
      .toBe('updated text for autosave');
    expect(await originalFile(page)).toBeUndefined();
  });

  test('does not write a second time within the 1-minute minimum interval', async ({ page }) => {
    await openForEditing(page, { autosave: false });

    await page.clock.install();

    await editContent(page, 'first edit');
    await fireDebouncedAutosave(page);
    expect(await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum'])).toBe('first edit');

    // Second edit — but only 3 seconds later (far less than the 60-second minimum interval)
    await editContent(page, 'second edit');
    await fireDebouncedAutosave(page);

    expect(await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum'])).toBe('first edit');
  });

  test('a later manual save still writes the original', async ({ page }) => {
    await openForEditing(page, { autosave: false });

    await page.clock.install();
    await editContent(page, 'autosaved content');
    await fireDebouncedAutosave(page);
    expect(await page.evaluate(() => window.__savedFiles['notes.md-temp.gypsum'])).toBe('autosaved content');

    await editContent(page, 'manually saved content');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);

    expect(await originalFile(page)).toBe('manually saved content');
  });

});

// ─── Guard conditions ─────────────────────────────────────────────────────────

test.describe('autosave guard conditions', () => {

  test('does not autosave with no edits, nor when the content is back to the original', async ({ page }) => {
    await openForEditing(page, { autosave: false });

    await page.clock.install();
    // Advance well past both the debounce (3 s) and min interval (60 s)
    await page.clock.runFor(65000);
    await page.waitForTimeout(200);
    expect(await savedFileNames(page)).not.toContain('notes.md-temp.gypsum');

    // Set content back to exactly the original file content — still nothing to write
    await editContent(page, '# My Notes\nSome content here');
    await fireDebouncedAutosave(page);
    expect(await savedFileNames(page)).not.toContain('notes.md-temp.gypsum');
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

    expect(await savedFileNames(page)).not.toContain('notes.md-temp.gypsum');
  });

});

// ─── Temp file cleanup on modal close ────────────────────────────────────────

test.describe('autosave temp file cleanup on modal close', () => {

  test('temp file is deleted when the modal is closed normally', async ({ page }) => {
    await setupMockDirectoryWithSaveSupport(page);
    await page.goto('/');
    await openModal(page);

    // Inject a temp file directly, simulating a previous autosave run
    await page.evaluate(() => { window.__savedFiles['notes.md-temp.gypsum'] = 'autosaved content'; });

    // No edits were made, so hasUnsavedChanges() is false — modal closes without warning
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).toBeHidden();
    await page.waitForTimeout(300);

    expect(await savedFileNames(page)).not.toContain('notes.md-temp.gypsum');
  });

  test('temp file is deleted when the modal is closed via Discard changes', async ({ page }) => {
    await openForEditing(page, { autosave: false });

    // Inject a temp file directly, simulating a previous autosave run
    await page.evaluate(() => { window.__savedFiles['notes.md-temp.gypsum'] = 'autosaved content'; });

    // Create unsaved changes so the warning dialog appears on close
    await editContent(page, 'additional unsaved edits');
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#modal-unsaved-warning')).toBeVisible();

    await page.click('[data-action="warning-proceed"]');
    await expect(page.locator('#file-content-modal')).toBeHidden();
    await page.waitForTimeout(300);

    expect(await savedFileNames(page)).not.toContain('notes.md-temp.gypsum');
  });

});
