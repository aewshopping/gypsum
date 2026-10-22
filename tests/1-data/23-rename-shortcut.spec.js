const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithDeleteSupport, setupMockDirectoryWithNoteCreation, loadFolder, chooseView, appModule } = require('../helpers');

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

test('ctrl+shift+s opens the rename modal, but only with a file open', async ({ page }) => {
  await setupMockDirectoryWithDeleteSupport(page);
  await page.goto('/');
  await loadFolder(page);

  await page.keyboard.press('Control+Shift+S');
  await expect(page.locator('#modal-file-options')).not.toBeVisible();

  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 1);

  await page.keyboard.press('Control+Shift+S');
  await expect(page.locator('#modal-file-options')).toBeVisible();
});

// ---------------------------------------------------------------- the filename cell's text, plans/completed/table-rename-filename.md §3.2

test('a filename cell\'s text is read into a folder and a name, and the validator decides', async () => {
  const { readPathText, validateRenameInputs } = await appModule('editing/rename-validate.js');
  const current = { filename: 'note-3.txt', filepath: 'work/note-3.txt' };
  const myFiles = [current, { filename: 'b.md', filepath: 'top/middle/b.md' }, { filename: 'other.md', filepath: 'work/other.md' }];
  const read = (text) => {
    const { newFolder, newName } = readPathText(text, current, myFiles);
    const check = validateRenameInputs({ currentFile: current, newFolder, newName, myFiles });
    return check.ok ? `${check.normalizedFolder}|${check.normalizedName}` : check.reason;
  };

  expect(read('work/shopping.txt')).toBe('work|shopping.txt');
  expect(read('work/shopping')).toBe('work|shopping.txt');
  expect(read('work/v1.2 notes')).toBe('work|v1.2 notes.txt');
  expect(read('work / shopping.md')).toBe('work|shopping.md');
  expect(read('projects/note-3.txt')).toBe('projects|note-3.txt');
  expect(read('/note-3.txt')).toBe('|note-3.txt');
  // a loaded folder's case, prefix by prefix, though nothing sits directly in top/
  expect(read('Work/x.txt')).toBe('work|x.txt');
  expect(read('TOP/Middle/New/x.txt')).toBe('top/middle/New|x.txt');

  expect(read('work/')).toBe('Filename cannot be empty.');
  expect(read('work/.hidden.txt')).toBe('Filename cannot start with a dot.');
  expect(read('.gypsum/x.txt')).toMatch(/cannot start with a dot/);
  expect(read('../x.txt')).toMatch(/cannot start with a dot/);
  expect(read('wo\\rk/x.txt')).toBe('Folder names cannot contain backslashes or control characters.');
  expect(read('work/NOTE-3.TXT')).toBe('Only the case changed — that isn\'t supported yet.');
  expect(read('work/note-3')).toBe('The path is unchanged.');
  expect(read('WORK/Other.md')).toBe('A loaded file with that path already exists.');
});

// The pair that keeps a `filename:` key out of every note: a paste and the commit's routing both ask
// whether a column writes front matter, and the filename column takes a caret without doing so.
test('the filename column takes a caret but writes no front matter', async () => {
  const { isPropertyEditable, writesFrontMatter } = await appModule('services/property-type.js');
  expect(isPropertyEditable('filename')).toBe(true);
  expect(writesFrontMatter('filename')).toBe(false);
});

// ---------------------------------------------------------------- the filename cell on disk, §6 and §9

test('a filename cell renames the note on disk, and undo and redo move it back and forth', async ({ page }) => {
  await setupMockDirectoryWithNoteCreation(page);
  await page.addInitScript(() => {
    window.__createdFiles.set('.gypsum/history.gypsum', JSON.stringify({ lines: ['Milk, eggs, bread'],
      snapshots: [{ filepath: 'shopping.txt', filename: 'shopping.txt', timestamp: '2026-01-01T00:00:00Z', event: 'save', lineRefs: [0] }] }));
  });
  await page.goto('/');
  await loadFolder(page);
  await chooseView(page, 'table');

  const files = () => page.evaluate(() => Object.fromEntries([...window.__createdFiles].filter(([path]) => !path.startsWith('.gypsum/'))));
  const cell = page.locator('.note-table[data-vt-id="shopping.txt"] .note-table-cell[data-prop="filename"]');
  await cell.click();
  await cell.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('lists/groceries');
  await page.keyboard.press('Enter');

  // Moved, the extension kept, the bytes exactly as they were, the history following
  const moved = { 'hub.md': '# Hub\n\nA link to [[shopping.txt]] here.\n', 'lists/groceries.txt': 'Milk, eggs, bread' };
  await expect.poll(files).toEqual(moved);
  const history = JSON.parse(await page.evaluate(() => window.__createdFiles.get('.gypsum/history.gypsum')));
  expect(history.snapshots[0].filepath).toBe('lists/groceries.txt');

  const reverse = (direction) => page.evaluate(async (d) => {
    const { reverseCellEdits } = await import('/public/js/ui/ui-functions-click/undo-cell-edit.js');
    await reverseCellEdits(d);
  }, direction);

  await reverse('undo');
  const original = { 'hub.md': moved['hub.md'], 'shopping.txt': 'Milk, eggs, bread' };
  expect(await files()).toEqual(original);
  await reverse('redo');
  expect(await files()).toEqual(moved);

  // Renamed again from elsewhere — the file options dialog's path — so the undo is stale: refused,
  // and both notes left exactly as they are
  await page.evaluate(async () => {
    const { appState } = await import('/public/js/services/store.js');
    const { renameFile } = await import('/public/js/editing/rename-file.js');
    const file = appState.myFiles.find(f => f.internalId === 'lists/groceries.txt');
    await renameFile({ file, newFolder: 'lists', newName: 'other.txt' });
  });
  await reverse('undo');
  expect(await files()).toEqual({ 'hub.md': moved['hub.md'], 'lists/other.txt': 'Milk, eggs, bread' });
  await expect(page.locator('#output-report')).toContainText('not undone: lists/groceries.txt is no longer there');
});
