const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithNoteCreation, loadFolder } = require('./helpers');

// Pressing Enter with the caret right after the ']]' of a link that resolves to nothing
// offers to create that note, and a second Enter creates it and opens it.

async function openHubInTextMode(page) {
  await loadFolder(page);
  await expect(page.locator('.note-grid').first()).toBeVisible();
  await page.locator('.note-grid[data-file-id="hub.md"]').click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await page.evaluate(() => {
    const toggle = document.getElementById('render_toggle');
    if (!toggle.checked) toggle.click();
  });
  await expect(page.locator('#modal-content-text pre.text-editor')).toBeVisible();
}

/** Types text at the very end of the editor, as a user finishing the note would. */
async function typeAtEnd(page, text) {
  await page.locator('#modal-content-text pre.text-editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
}

const items = (page) => page.locator('.ac-picker-popup .ac-picker-item');

const createdFiles = (page) => page.evaluate(() => [...window.__createdFiles.keys()]);
const openFilepath = (page) => page.evaluate(() => window.appState.openFileSnapshot?.filepath);

test.describe('creating a note from an unresolved internal link', () => {

  // Creating and opening a note in one step touches the filesystem, appState and a view
  // transition; an exception in any of them would otherwise pass unnoticed.
  let pageErrors;
  test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));
  });
  test.afterEach(() => { expect(pageErrors).toEqual([]); });

  test('Enter offers the note pre-selected, and a second Enter creates and opens it', async ({ page }) => {
    await setupMockDirectoryWithNoteCreation(page);
    await page.goto('/');
    await openHubInTextMode(page);

    await typeAtEnd(page, '[[brand new.txt]]');
    await page.keyboard.press('Enter');

    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toHaveText('brand new.txt');
    await expect(items(page).first()).toHaveAttribute('data-active', 'true');
    // The Enter that opened the popup must not also have inserted a newline.
    expect(await createdFiles(page)).not.toContain('brand new.txt');

    await page.keyboard.press('Enter');

    await expect.poll(() => openFilepath(page)).toBe('brand new.txt');
    expect(await createdFiles(page)).toContain('brand new.txt');
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await expect(page.locator('.ac-picker-popup')).toHaveCount(0);
    // The new note is in appState, so links to it resolve from here on.
    const filepaths = await page.evaluate(() => window.appState.myFiles.map(f => f.filepath));
    expect(filepaths).toContain('brand new.txt');
  });

  test('folder segments are created silently, a missing extension means .txt, and a pipe alias is ignored', async ({ page }) => {
    await setupMockDirectoryWithNoteCreation(page);
    await page.goto('/');
    await openHubInTextMode(page);

    await typeAtEnd(page, '[[contacts/friends/bob | friend bob]]');
    await page.keyboard.press('Enter');
    await expect(items(page).first()).toHaveText('contacts/friends/bob.txt');
    await page.keyboard.press('Enter');

    await expect.poll(() => openFilepath(page)).toBe('contacts/friends/bob.txt');
    await expect.poll(() => createdFiles(page)).toContain('contacts/friends/bob.txt');
    expect(await page.evaluate(() => [...window.__createdDirs])).toEqual(
      expect.arrayContaining(['contacts', 'contacts/friends'])
    );
  });

  test('a link to a note that already exists just inserts a newline', async ({ page }) => {
    await setupMockDirectoryWithNoteCreation(page);
    await page.goto('/');
    await openHubInTextMode(page);

    const before = await createdFiles(page);

    await typeAtEnd(page, '[[shopping.txt]]');
    await page.keyboard.press('Enter');
    await expect(page.locator('.ac-picker-popup')).toHaveCount(0);

    // The extensionless form resolves to the same file, so it must not offer either
    await typeAtEnd(page, '[[shopping]]');
    await page.keyboard.press('Enter');
    await expect(page.locator('.ac-picker-popup')).toHaveCount(0);

    expect(await createdFiles(page)).toEqual(before);
    expect(await openFilepath(page)).toBe('hub.md');
  });

  test('Escape dismisses the offer and creates nothing', async ({ page }) => {
    await setupMockDirectoryWithNoteCreation(page);
    await page.goto('/');
    await openHubInTextMode(page);

    const before = await createdFiles(page);
    await typeAtEnd(page, '[[unwanted.txt]]');
    await page.keyboard.press('Enter');
    await expect(items(page)).toHaveCount(1);
    await page.keyboard.press('Escape');

    await expect(page.locator('.ac-picker-popup')).toHaveCount(0);
    expect(await createdFiles(page)).toEqual(before);
    expect(await openFilepath(page)).toBe('hub.md');
  });

});
