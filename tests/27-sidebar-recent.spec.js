const { test, expect } = require('@playwright/test');
const { setupMockFiles } = require('./helpers');

// setupMockFiles: meeting-notes.md ("Quarterly Review"), shopping.txt, big-ideas.md ("Big Ideas",
// tagged #color/coral).

async function loadFiles(page) {
  await page.goto('/');
  await page.click('[data-click-loadfolder]');
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

async function openPanel(page) {
  await page.locator('#sidebar-recent-handle').click();
  await expect(page.locator('#sidebar-recent-toggle')).toBeChecked();
}

test.describe('recent files panel', () => {

  test('starts empty and lists opened files newest first, keeping duplicates', async ({ page }) => {
    await setupMockFiles(page);
    await loadFiles(page);

    await expect(page.locator('.sidebar-recent-empty')).toHaveCount(1);

    await openCard(page, 'Quarterly Review');
    await closeModal(page);
    await openCard(page, 'Big Ideas');
    await closeModal(page);

    const items = page.locator('.sidebar-recent-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute('data-file-id', 'big-ideas.md');
    await expect(items.nth(1)).toHaveAttribute('data-file-id', 'meeting-notes.md');

    // Re-opening a file adds another entry rather than moving the existing one: it is a history.
    await openCard(page, 'Quarterly Review');
    await closeModal(page);
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveAttribute('data-file-id', 'meeting-notes.md');
    await expect(items.nth(2)).toHaveAttribute('data-file-id', 'meeting-notes.md');
  });

  test('an entry carries the file colour', async ({ page }) => {
    await setupMockFiles(page);
    await loadFiles(page);
    await openCard(page, 'Big Ideas');
    await closeModal(page);

    const item = page.locator('.sidebar-recent-item[data-file-id="big-ideas.md"]');
    await expect(item).toHaveAttribute('data-color', 'coral');
    await expect(item).toHaveCSS('background-color', 'rgb(255, 127, 80)'); // coral
  });

  test('clicking an entry opens that file', async ({ page }) => {
    await setupMockFiles(page);
    await loadFiles(page);
    await openCard(page, 'Quarterly Review');
    await closeModal(page);

    await openPanel(page);
    await page.locator('.sidebar-recent-item[data-file-id="meeting-notes.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await expect(page.locator('#modal-content-text')).toContainText('Discussion points');
  });

  test('the open panel pushes the page and the file modal right', async ({ page }) => {
    await setupMockFiles(page);
    await loadFiles(page);
    await openCard(page, 'Quarterly Review');

    const modalLeft = () => page.locator('#moving-file-content-container')
      .evaluate(el => el.getBoundingClientRect().left);
    const closedLeft = await modalLeft();

    await openPanel(page);
    await expect(page.locator('body')).not.toHaveCSS('padding-inline-start', '0px');
    await expect.poll(modalLeft).toBeGreaterThan(closedLeft);
  });

  test('an entry stays clickable while a file is open', async ({ page }) => {
    await setupMockFiles(page);
    await loadFiles(page);
    await openCard(page, 'Quarterly Review');
    await closeModal(page);
    await openCard(page, 'Big Ideas');

    // A modal dialog makes everything outside it inert, so this only works because the panel is
    // parked inside the dialog while it is open.
    await openPanel(page);
    const entry = page.locator('.sidebar-recent-item[data-file-id="meeting-notes.md"]');
    await expect(entry).toBeVisible();
    await entry.click();

    await expect(page.locator('#file-content-modal')).toBeVisible();
    await expect(page.locator('#modal-content-text')).toContainText('Discussion points');
  });

  test('the entry for the file on screen is marked, and unmarked once it closes', async ({ page }) => {
    await setupMockFiles(page);
    await loadFiles(page);
    await openCard(page, 'Big Ideas');

    await expect(page.locator('.sidebar-recent-item[data-current]')).toHaveAttribute('data-file-id', 'big-ideas.md');
    await closeModal(page);
    await expect(page.locator('.sidebar-recent-item[data-current]')).toHaveCount(0);
  });

  test('a renamed file keeps its place in the panel under the new name', async ({ page }) => {
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
  });

  test('a deleted file drops out of the panel', async ({ page }) => {
    await setupMockFiles(page);
    await loadFiles(page);
    await openCard(page, 'Big Ideas');
    await closeModal(page);
    await expect(page.locator('.sidebar-recent-item')).toHaveCount(1);

    // The mock directory has no write support, so remove the file from state directly and
    // re-render — the same path a real delete takes on its way out.
    await page.evaluate(async () => {
      const { appState } = await import('/public/js/services/store.js');
      const { renderFiles } = await import('/public/js/ui/ui-functions-render/a-render-all-files.js');
      appState.myFiles = appState.myFiles.filter(f => f.internalId !== 'big-ideas.md');
      renderFiles();
    });

    await expect(page.locator('.sidebar-recent-item')).toHaveCount(0);
    await expect(page.locator('.sidebar-recent-empty')).toHaveCount(1);
  });

});
