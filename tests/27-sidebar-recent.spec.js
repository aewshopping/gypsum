const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder } = require('./helpers');

// setupMockFiles: meeting-notes.md ("Quarterly Review"), shopping.txt, big-ideas.md ("Big Ideas",
// tagged #color/coral).

async function loadFiles(page) {
  await page.goto('/');
  await loadFolder(page);
  await expect(page.locator('.note-grid').first()).toBeVisible();
}

async function openCard(page, cardText) {
  await page.locator('.note-grid', { hasText: cardText }).click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
}

async function closeModal(page) {
  await page.click('[data-action="close-file-content-modal"]');
  await expect(page.locator('#file-content-modal')).toBeHidden();
}

/** Opens the panel and waits for the slide-in to finish. */
async function openPanel(page) {
  await page.locator('#btn-recent-toggle').click();
  await expect.poll(() => page.locator('#sidebar-recent')
    .evaluate(el => Math.round(el.getBoundingClientRect().left))).toBe(0);
}

test.describe('recent files panel', () => {

  test('starts empty and lists each file once, most recently opened first', async ({ page }) => {
    await setupMockFiles(page);
    await loadFiles(page);

    await expect(page.locator('.sidebar-recent-empty')).toHaveCount(1);

    await openCard(page, 'Quarterly Review');
    await closeModal(page);
    await openCard(page, 'Big Ideas');

    // The entry for the file on screen is marked, and unmarked once it closes
    const marked = page.locator('.sidebar-recent-item[data-current]');
    await expect(marked).toHaveAttribute('data-file-id', 'big-ideas.md');
    await closeModal(page);
    await expect(marked).toHaveCount(0);

    const items = page.locator('.sidebar-recent-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute('data-file-id', 'big-ideas.md');
    await expect(items.nth(1)).toHaveAttribute('data-file-id', 'meeting-notes.md');

    // Re-opening a listed file moves it back to the top rather than adding a second entry,
    // and lights up exactly one row rather than every visit to that file.
    await openCard(page, 'Quarterly Review');
    await expect(marked).toHaveCount(1);
    await closeModal(page);
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute('data-file-id', 'meeting-notes.md');
    await expect(items.nth(1)).toHaveAttribute('data-file-id', 'big-ideas.md');
  });

  test('an entry opens its file, and stays clickable while another is open', async ({ page }) => {
    await setupMockFiles(page);
    await loadFiles(page);
    await openCard(page, 'Quarterly Review');
    await closeModal(page);
    await openPanel(page);
    await openCard(page, 'Big Ideas');

    // A modal dialog makes everything outside it inert, so this only works because the panel is
    // parked inside the dialog while it is open.
    const entry = page.locator('.sidebar-recent-item[data-file-id="meeting-notes.md"]');
    await expect(entry).toBeVisible();
    await entry.click();

    await expect(page.locator('#file-content-modal')).toBeVisible();
    await expect(page.locator('#modal-content-text')).toContainText('Discussion points');
  });

  test('a renamed file keeps its place under the new name, and a deleted one drops out', async ({ page }) => {
    await setupMockFiles(page);
    await loadFiles(page);
    await openCard(page, 'Big Ideas');

    // Stand in for a rename: the file takes a new internalId, and the rename flow reports it
    // through setOpenedFileId — the same call file-options-click makes.
    await page.evaluate(async () => {
      const { appState } = await import('/public/js/services/store.js');
      const { setOpenedFileId } = await import('/public/js/ui/ui-functions-click/open-file-content-view-trans.js');
      const file = appState.myFiles.find(f => f.internalId === 'big-ideas.md');
      file.internalId = 'bigger-ideas.md';
      file.filepath = 'bigger-ideas.md';
      file.filename = 'bigger-ideas.md';
      setOpenedFileId('bigger-ideas.md');
    });

    const items = page.locator('.sidebar-recent-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveAttribute('data-file-id', 'bigger-ideas.md');
    await expect(items.first()).toHaveAttribute('data-current', '');

    await closeModal(page);

    // The mock directory has no write support, so remove the file from state directly and
    // re-render — the same path a real delete takes on its way out.
    await page.evaluate(async () => {
      const { appState } = await import('/public/js/services/store.js');
      const { renderFiles } = await import('/public/js/ui/ui-functions-render/a-render-all-files.js');
      appState.myFiles = appState.myFiles.filter(f => f.internalId !== 'bigger-ideas.md');
      renderFiles();
    });

    await expect(items).toHaveCount(0);
    await expect(page.locator('.sidebar-recent-empty')).toHaveCount(1);
  });

  // The panel slides through a view transition rather than through a transition on its width, so
  // the page is laid out once instead of on every frame. What can be checked from out here is that
  // the class naming the transition's groups is cleaned up after it, since a name left behind would
  // join every other transition in the app.
  test('the slide leaves no transition class behind, animated or not', async ({ page }) => {
    await setupMockFiles(page);
    await loadFiles(page);

    const rootClasses = () => page.evaluate(() => [...document.documentElement.classList]);

    await openPanel(page);
    await expect.poll(rootClasses).toContain('sidebar-recent-open');
    await expect.poll(rootClasses).not.toContain('sidebar-animating');

    await page.click('#btn-recent-close');
    await expect.poll(rootClasses).not.toContain('sidebar-recent-open');
    await expect.poll(rootClasses).not.toContain('sidebar-animating');

    // And with animation off, where no transition is started at all.
    await page.keyboard.press('?');
    await page.locator('#view-transitions-enabled').uncheck();
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal-settings')).toBeHidden();

    await page.keyboard.press('Alt+b');
    await expect.poll(rootClasses).toContain('sidebar-recent-open');
    await expect.poll(rootClasses).not.toContain('sidebar-animating');
    await expect(page.locator('#sidebar-recent')).toHaveJSProperty('offsetLeft', 0);
  });

});
