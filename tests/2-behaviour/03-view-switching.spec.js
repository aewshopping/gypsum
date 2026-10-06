const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder, showFilenames, chooseView, sortBy } = require('../helpers');

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

  await chooseView(page, 'table');

  await expect(page.locator('.note-table-header')).toBeVisible();
  await expect(page.locator('.note-grid')).toHaveCount(0);
});

// The view's control row is drawn into #output-controls, the controls panel's second line, rather
// than into #output. That element outlives the render, so something has to empty it — and a
// partial render, which replaces the table's rows and nothing else, has to leave it alone or a
// press on undo would lose the button under it.
test('the control row sits under the general controls, survives a partial render, and leaves with its view', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await expect(page.locator('.view-controls-row .output-controls')).toHaveCount(0);

  await chooseView(page, 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
  await expect(page.locator('.view-controls-row .output-controls')).toHaveCount(1);
  await expect(page.locator('#output .output-controls')).toHaveCount(0);

  // A sort renders the rows only — the row above them must still be there afterwards.
  await sortBy(page, 'title');
  await expect(page.locator('.view-controls-row .output-controls')).toHaveCount(1);

  await chooseView(page, 'cards');
  await expect(page.locator('.note-grid').first()).toBeVisible();
  await expect(page.locator('.view-controls-row .output-controls')).toHaveCount(0);
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
  await chooseView(page, 'list');
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
  await chooseView(page, 'table');
  await page.click('[data-action="open-column-picker"]');
  await page.locator('.info-modal-row[data-property="people"] .column-picker-type').click();
  await page.locator('[data-action="column-type-set"][data-value="string"]').click();
  await page.keyboard.press('Escape');
  await page.click('[data-action="close-column-picker"]');

  await chooseView(page, 'list');
  await page.locator('.list-view summary').first().click();
  await expect(valueOf('people')).toHaveText('John Smith, "Doe, Jane"');
  await expect(valueOf('people')).toHaveAttribute('data-list', '');
});

// Alt+number picks the view of that number in the side panel, whose labels carry the same numbers —
// both counted from the order of VIEWS, so they cannot disagree.
test('Alt+number switches to the numbered view, but not while a dialog is open', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);

  const buttons = page.locator('[data-action="select-view"]');
  const current = page.locator('[data-action="select-view"][aria-pressed="true"]');
  const labels = await buttons.allTextContents();
  expect(labels[0].trim()).toBe('1. table');
  expect(labels.at(-1).trim()).toBe('6. flowchart');
  labels.forEach((label, i) => expect(label.trim()).toMatch(new RegExp(`^${i + 1}\\. `)));
  await expect(page.locator('#shortcut-last-view')).toHaveText(String(labels.length));

  await page.keyboard.press('Alt+1');
  await expect(current).toHaveAttribute('data-view', 'table');
  await expect(current).toHaveCount(1);
  await expect(page.locator('.note-table-header')).toBeVisible();

  await page.keyboard.press('Alt+2');
  await expect(current).toHaveAttribute('data-view', 'cards');
  await expect(page.locator('.note-table-header')).toHaveCount(0);

  // A number past the last view does nothing.
  await page.keyboard.press(`Alt+${labels.length + 1}`);
  await expect(current).toHaveAttribute('data-view', 'cards');

  await page.keyboard.press('?');
  await expect(page.locator('#modal-settings')).toBeVisible();
  await page.keyboard.press('Alt+1');
  await expect(current).toHaveAttribute('data-view', 'cards');
});

test('the side panel\'s view buttons switch the view and mark the one on screen', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);

  await page.click('#btn-recent-toggle');
  await page.click('[data-action="select-view"][data-view="table"]');
  await expect(page.locator('.note-table-header')).toBeVisible();
  await expect(page.locator('[data-view="table"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-view="peek"]')).toHaveAttribute('aria-pressed', 'false');
});
