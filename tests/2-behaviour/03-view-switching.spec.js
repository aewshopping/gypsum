const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder, showFilenames } = require('../helpers');

// Search and view switching share one folder load — both are cheap reads over the same state.
test('searching filters the list, and the table view renders headers', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');

  await loadFolder(page);
  await expect(page.locator('.note-grid')).toHaveCount(3);
  await showFilenames(page);

  // 'meeting' only appears in the filename meeting-notes.md
  await page.fill('#searchbox', 'meeting');
  await page.press('#searchbox', 'Enter');

  await expect(page.locator('.note-grid')).toHaveCount(1);
  await expect(page.locator('.note-grid').first()).toContainText('meeting-notes');

  await page.selectOption('#view-select', 'table');

  await expect(page.locator('.note-table-header')).toBeVisible();
  await expect(page.locator('.note-grid')).toHaveCount(0);
});

/**
 * A folder whose front matter has one of everything the list view used to get wrong: markup in a
 * value, a list, a value that does not fit its column, and a key holding nothing.
 */
async function setupValueFiles(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const mk = (n, c) => ({ kind: 'file', name: n,
        getFile: async () => ({ name: n, size: c.length, lastModified: Date.now(), text: async () => c }) });
      return { kind: 'directory', name: 'root', values: async function* () {
        yield mk('alpha.md', '---\npeople:\n  - John Smith\n  - "Doe, Jane"\nnote: a <b> c\n---\n# Alpha\n');
      } };
    };
  });
}

test('list view draws what the file holds, whatever the table is set to', async ({ page }) => {
  await setupValueFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'list');
  await page.locator('.list-view summary').first().click();

  const valueOf = (prop) => page.locator(`.list-view [data-prop="${prop}"]`).first();

  // Escaped, not parsed: the <b> used to open a tag that put the rest of the list in bold.
  await expect(valueOf('note')).toHaveText('a <b> c');
  await expect(page.locator('.list-view b')).toHaveCount(0);

  // One comma-joined line, marked as items — the same line the table shows, from the same renderer.
  await expect(valueOf('people')).toHaveText('John Smith, "Doe, Jane"');
  await expect(valueOf('people')).toHaveAttribute('data-list', '');

  // The app's own date, formatted; a key holding nothing, blank rather than the word null.
  await expect(valueOf('lastModified')).toHaveText(/\d+\/\d+\/\d+/);
  await expect(valueOf('color')).toHaveText('');

  // The file column's link belongs to the table, where it is the only way to open a note. Here the
  // id is an id, and the view has its own open control.
  await expect(valueOf('internalId')).toHaveText('alpha.md');
  await expect(valueOf('internalId').locator('a')).toHaveCount(0);
  await expect(page.locator('.list-view [data-action="open-file-content-modal"]')).toHaveCount(1);

  // **And a column's type cannot reach this view.** It is the table's fact, about how a column
  // sorts and what its cells offer; this view asks the value what it is. Retyping the list column
  // to text used to turn the line into `John Smith, Doe, Jane` and take its item marks away.
  await page.selectOption('#view-select', 'table');
  await page.click('[data-action="open-column-picker"]');
  await page.locator('.info-modal-row[data-property="people"] .column-picker-type').click();
  await page.locator('[data-action="column-type-set"][data-value="string"]').click();
  await page.keyboard.press('Escape');
  await page.click('[data-action="close-column-picker"]');

  await page.selectOption('#view-select', 'list');
  await page.locator('.list-view summary').first().click();
  await expect(valueOf('people')).toHaveText('John Smith, "Doe, Jane"');
  await expect(valueOf('people')).toHaveAttribute('data-list', '');
});
