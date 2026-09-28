const { test, expect } = require('@playwright/test');
const { loadFolder, appModule, setupMockCellWritingFolder } = require('../helpers');

/**
 * plans/completed/table-linked-properties.md: a table column showing a property of the note a link points at.
 *
 * Most of it is rules, and those are checked in node, where a test costs milliseconds. The browser
 * tests are kept for what only a page can show, and each walks one path through several checks
 * rather than one check per test. §8.
 *
 * The folder is setupMockCellWritingFolder's, because its notes can be written — the §2.3 check edits
 * a project note and watches the linked cell follow — plus the notes below. Its own alpha.md and
 * beta.md carry `status` too, which is what makes "a heading already in use" reachable.
 */
const NOTES = {
  'task-a.md': '---\nproject: "[[proj-x.md]]"\nrelated:\n  - "[[proj-x.md]]"\n  - "[[gone.md]]"\n  - "[[proj-y.md]]"\n---\n# Task A\n',
  'task-b.md': '---\nproject: "[[proj-y.md]]"\n---\n# Task B\n',
  'task-c.md': '---\nproject: "[[gone.md]]"\n---\n# Task C\n',
  'proj-x.md': '---\nstatus: active\n---\n# Project X\n',
  'proj-y.md': '---\nstatus: done\n---\n# Project Y\n',
};

/** A saved layout named `mine`, active, showing the file and title columns and `project`. */
const SAVED_LAYOUT = JSON.stringify({
  layoutVersion: 2, propertyTypes: {}, flowchart: {}, linkedProperties: {}, active: 'mine',
  layouts: { mine: { stickyColumns: 0, columns: [
    { order: 0, name: 'internalId', label: 'file', width: 60, visible: true },
    { order: 1, name: 'title', label: 'title', width: 150, visible: true },
    { order: 2, name: 'project', label: 'project', width: 150, visible: true },
    { order: 3, name: 'status', label: 'status', width: 100, visible: true },
  ] } },
});

async function openTable(page, layoutsFile, notes = NOTES) {
  await page.setViewportSize({ width: 3000, height: 900 });
  await setupMockCellWritingFolder(page, notes);
  if (layoutsFile) {
    await page.addInitScript(content => { window.__saved['table_layouts.gypsum'] = content; }, layoutsFile);
  }
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const dialog = page => page.locator('#modal-linked-column');
const layouts = page => page.evaluate(() => JSON.parse(window.__saved['table_layouts.gypsum'] || '{}'));
const isDirty = page => page.evaluate(async () =>
  (await import('/public/js/services/store.js')).appState.tableLayouts.isDirty);
const rowFor = (page, title) => page.locator('.note-table').filter({ hasText: title }).first();
const cellFor = (page, title, prop) => rowFor(page, title).locator(`.note-table-cell[data-prop="${prop}"]`);
const header = (page, prop) => page.locator(`.note-table-cell-header[data-property="${prop}"]`);
const heading = (page, prop) => header(page, prop).locator('.header-label');
const headings = page => page.locator('.note-table-cell-header .header-label').allTextContents();

/** Opens "add linked column", which is in the column picker. */
async function openAddDialog(page) {
  await page.click('[data-action="open-column-picker"]');
  await page.click('#modal-columns [data-action="open-linked-column"]');
  await expect(dialog(page)).toBeVisible();
}

/** Closes the column picker, which is what redraws the table behind it. */
async function closePicker(page) {
  await page.click('[data-action="close-column-picker"]');
  await expect(page.locator('#modal-columns')).not.toBeVisible();
}

/** Creates a linked column from the column picker, and closes both dialogs. */
async function addLinked(page, read, via, name) {
  await openAddDialog(page);
  await page.selectOption('#linked-column-read', read);
  await page.selectOption('#linked-column-via', via);
  if (name !== undefined) await page.fill('#linked-column-name', name);
  await page.click('#linked-column-save');
  await expect(dialog(page)).not.toBeVisible();
  await closePicker(page);
}

/** Opens a header's column menu: one press selects the header, the second opens the menu. */
async function openMenu(page, prop) {
  await header(page, prop).click();
  await header(page, prop).click();
  await expect(page.locator('#column-menu')).toBeVisible();
}

// ------------------------------------------------------------------------------------- in node

test('linkedValue: one link, many, broken, missing, and list and Map values', async () => {
  const { appState } = await appModule('services/store.js');
  const { invalidateNoteNameIndex } = await appModule('services/internal-links/note-name-index.js');
  const { filesById, linkedValue, firstLinkedExample } = await appModule('services/internal-links/linked-value.js');

  const file = (id, props) => ({ internalId: id, filepath: id, filename: id, ...props });
  appState.myFiles = [
    file('t.md', { one: '[[x.md]]', many: ['[[x.md]]', '[[gone.md]]', 'y.md', '[[x.md]]'], none: [] }),
    file('x.md', { status: 'active', tags: new Map([['a', {}], ['b', {}]]), list: ['p', 'q'] }),
    file('y.md', { status: 'done' }),
  ];
  invalidateNoteNameIndex();
  const byId = filesById(appState.myFiles);
  const [t] = appState.myFiles;
  const value = (via, read) => linkedValue({ via, read }, t, byId);

  expect(value('one', 'status')).toBe('active');
  // one slot per link, in link order: a broken link is an empty slot, duplicates are kept
  expect(value('many', 'status')).toEqual(['active', '', 'done', 'active']);
  // a note without the property is an empty slot too
  expect(value('many', 'list')).toEqual(['p', 'q', '', '', 'p', 'q']);
  expect(value('one', 'tags')).toEqual(['a', 'b']);
  expect(value('one', 'nothing')).toBe('');
  expect(value('none', 'status')).toEqual([]);
  expect(value('absent', 'status')).toBe('');

  expect(firstLinkedExample({ via: 'many', read: 'status' }, appState.myFiles, byId))
    .toMatchObject({ from: { internalId: 't.md' }, to: { internalId: 'x.md' }, value: 'active' });
  expect(firstLinkedExample({ via: 'many', read: 'nothing' }, appState.myFiles, byId)).toBeNull();
});

test('a definition: validated, named after its choices, and a heading in use is refused', async () => {
  const { readDefinition, automaticHeading, headingInUse, isLinkedKey } = await appModule('services/linked-properties.js');

  expect(readDefinition({ via: 'project', read: 'status' })).toEqual({ label: null, via: 'project', read: 'status' });
  expect(readDefinition({ via: 'project', read: 'status', label: '  Project status ' }))
    .toEqual({ label: 'Project status', via: 'project', read: 'status' });
  // Where the column was last copied to is kept, and anything but a name is dropped. plans/completed/table-copy-column.md §5.5.
  expect(readDefinition({ via: 'project', read: 'status', copyTo: ' project_status ' }))
    .toEqual({ label: null, via: 'project', read: 'status', copyTo: 'project_status' });
  expect(readDefinition({ via: 'project', read: 'status', copyTo: 3 })).toEqual({ label: null, via: 'project', read: 'status' });
  for (const bad of [null, 'text', [], { via: 'project' }, { via: '', read: 'status' }, { via: 3, read: 'status' },
    { via: 'linked:1', read: 'status' }, { via: 'project', read: 'linked:2' }]) {
    expect(readDefinition(bad)).toBeNull();
  }

  expect(automaticHeading('project', 'status')).toBe('project → status');
  expect(automaticHeading('internalLink', 'lastModified')).toBe('links → last modified');
  expect(headingInUse(' Status ', ['title', 'status'])).toBe(true);
  expect(headingInUse('Project status', ['title', 'status'])).toBe(false);
  expect(isLinkedKey('linked:1')).toBe(true);
  expect(isLinkedKey('linked')).toBe(false);
});

test('adding appends one visible entry to the active layout only; deleting removes it from all', async () => {
  const { withLinkedColumn, withoutLinkedColumn } = await appModule('table-layouts/layout-apply.js');
  const definition = { label: null, via: 'project', read: 'status' };

  // The stored order differs from anything on screen: whatever the screen holds waiting to be saved
  // must not be written by adding a column.
  const doc = {
    active: 'mine', linkedProperties: {},
    layouts: {
      mine: { stickyColumns: 1, columns: [{ order: 5, name: 'title', visible: true }, { order: 2, name: 'due', visible: false }] },
      other: { columns: [{ order: 0, name: 'title', visible: true }] },
    },
  };
  const added = withLinkedColumn(doc, 'linked:1', definition);
  expect(added.linkedProperties).toEqual({ 'linked:1': definition });
  expect(added.layouts.mine.columns.slice(0, 2)).toEqual(doc.layouts.mine.columns);
  expect(added.layouts.mine.columns[2]).toMatchObject({ order: 6, name: 'linked:1', visible: true });
  expect(added.layouts.mine.stickyColumns).toBe(1);
  expect(added.layouts.other).toEqual(doc.layouts.other);
  expect(doc.layouts.mine.columns).toHaveLength(2);

  // Under the app's defaults there is no layout to add it to.
  expect(withLinkedColumn({ ...doc, active: null }, 'linked:1', definition).layouts).toEqual(doc.layouts);

  // A copy's target that the layout holds hidden is shown where it stands, not appended again.
  const { withColumnShown } = await appModule('table-layouts/layout-apply.js');
  const shown = withColumnShown(doc, 'due');
  expect(shown.layouts.mine.columns).toEqual([doc.layouts.mine.columns[0], { order: 2, name: 'due', visible: true }]);
  expect(withColumnShown(doc, 'title')).toBe(doc);

  const both = { ...added, layouts: { ...added.layouts, other: { columns: [...doc.layouts.other.columns, { name: 'linked:1' }] } } };
  const removed = withoutLinkedColumn(both, 'linked:1');
  expect(removed.linkedProperties).toEqual({});
  expect(removed.layouts).toEqual(doc.layouts);
});

// ----------------------------------------------------------------------------- in the browser

test('a linked column is created from the column picker, shows the linked values, and follows an edit', async ({ page }) => {
  await openTable(page);

  await openAddDialog(page);
  await expect(page.locator('#linked-column-title')).toHaveText('New linked column');
  await expect(page.locator('#linked-column-save')).toBeDisabled();
  await expect(page.locator('#linked-column-delete')).toBeHidden();

  // The name follows the two choices, and the example line says whether they find anything.
  await page.selectOption('#linked-column-read', 'status');
  await page.selectOption('#linked-column-via', 'related');
  await expect(page.locator('#linked-column-name')).toHaveValue('related → status');
  await expect(page.locator('#linked-column-example')).toContainText('links to "proj-');
  await page.selectOption('#linked-column-read', 'count');
  await expect(page.locator('#linked-column-example')).toHaveText('no note links through "related" to a note with a "count"');
  await page.selectOption('#linked-column-read', 'status');
  await page.selectOption('#linked-column-via', 'project');
  await expect(page.locator('#linked-column-name')).toHaveValue('project → status');
  await page.click('#linked-column-save');
  await expect(dialog(page)).not.toBeVisible();

  // Its row is in the picker when the dialog closes, last and switched on.
  const row = page.locator('#column-picker-list .info-modal-row').last();
  await expect(row).toHaveAttribute('data-property', 'linked:1');
  await expect(row.locator('input.toggle')).toBeChecked();
  await closePicker(page);

  // Shown at once, rightmost, not faded, with the glyph and no padlock.
  expect((await headings(page)).at(-1)).toBe('project → status');
  await expect(header(page, 'linked:1')).not.toHaveAttribute('data-empty');
  await expect(header(page, 'linked:1').locator('use')).toHaveCount(1);
  await expect(header(page, 'linked:1').locator('use')).toHaveAttribute('href', '#icon-type-linked');

  await expect(cellFor(page, 'Task A', 'linked:1')).toHaveText('active');
  await expect(cellFor(page, 'Task B', 'linked:1')).toHaveText('done');
  await expect(cellFor(page, 'Task C', 'linked:1')).toHaveText('');   // a broken link: no warning
  await expect(cellFor(page, 'Task C', 'linked:1')).not.toHaveAttribute('data-mismatch');

  // Several links: an aligned list, the broken one an empty slot, and not marked as a mismatch.
  await addLinked(page, 'status', 'related');
  await expect(cellFor(page, 'Task A', 'linked:2')).toHaveText('active, , done');
  await expect(cellFor(page, 'Task A', 'linked:2')).toHaveAttribute('data-list');
  await expect(cellFor(page, 'Task A', 'linked:2')).not.toHaveAttribute('data-mismatch');

  // An edit to the linked note shows in the linked cell — a cached id → file map would not. §2.3.
  const status = cellFor(page, 'Project X', 'status');
  await status.click();
  await status.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('paused');
  await page.locator('#searchbox').click();
  await expect(cellFor(page, 'Task A', 'linked:1')).toHaveText('paused');
  await expect(cellFor(page, 'Task A', 'linked:2')).toHaveText('paused, , done');

  const doc = await layouts(page);
  expect(doc.linkedProperties).toEqual({
    'linked:1': { label: null, via: 'project', read: 'status' },
    'linked:2': { label: null, via: 'related', read: 'status' },
  });
  expect(doc.layouts).toEqual({});
});

test('under a saved layout a new column is added without saving what is pending, and survives a reload', async ({ page }) => {
  await openTable(page, SAVED_LAYOUT);
  await openMenu(page, 'project');
  await page.locator('[data-action="column-hide"]').click();
  expect(await isDirty(page)).toBe(true);

  await addLinked(page, 'status', 'project', 'Project status');
  expect((await headings(page)).at(-1)).toBe('Project status');
  expect(await isDirty(page)).toBe(true);

  // Only the new column reached the stored layout — project is still visible there.
  const columns = (await layouts(page)).layouts.mine.columns;
  expect(columns.map(column => [column.name, column.visible]))
    .toEqual([['internalId', true], ['title', true], ['project', true], ['status', true], ['linked:1', true]]);

  // A type set now is written by a second writer of the same file, which must keep the definition.
  await openMenu(page, 'status');
  await page.locator('[data-action="column-change-type"]').click();
  await page.locator('#modal-column-type [data-action="column-type-set"][data-value="array"]').click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await layouts(page)).propertyTypes?.status?.type).toBe('array');

  // The same folder opened again: the stored layout, with the column, and the pending hide gone.
  await loadFolder(page);
  await expect(header(page, 'linked:1')).toBeVisible();
  await expect(header(page, 'project')).toBeVisible();
  await expect(cellFor(page, 'Task B', 'linked:1')).toHaveText('done');
});

test('a linked column is edited, renamed and deleted from its own dialog', async ({ page }) => {
  await openTable(page);
  await addLinked(page, 'status', 'project');

  // Its menu offers its dialog, and none of the items that sort, search, type or reach the notes.
  await openMenu(page, 'linked:1');
  for (const action of ['column-sort-asc', 'column-sort-desc', 'column-search', 'column-change-type']) {
    await expect(page.locator(`#column-menu [data-action="${action}"]`)).toBeDisabled();
  }
  for (const action of ['column-rename-property', 'column-delete-property', 'column-delete-menu']) {
    await expect(page.locator(`#column-menu [data-action="${action}"]`)).toBeHidden();
  }
  await expect(page.locator('#column-menu [data-action="column-delete-linked"]')).toBeVisible();
  await page.locator('[data-action="column-edit-linked"]').click();
  await expect(page.locator('#linked-column-title')).toHaveText('Linked column');
  await expect(page.locator('#linked-column-save')).toHaveText('save');

  // Re-pointed, an untouched name follows.
  await page.selectOption('#linked-column-via', 'related');
  await expect(page.locator('#linked-column-name')).toHaveValue('related → status');
  await page.click('#linked-column-save');
  await expect(heading(page, 'linked:1')).toHaveText('related → status');
  await expect(cellFor(page, 'Task A', 'linked:1')).toHaveText('active, , done');

  // A name already in use is refused; a typed name stays when the choices change.
  await openMenu(page, 'linked:1');
  await page.locator('[data-action="column-edit-linked"]').click();
  await page.fill('#linked-column-name', 'STATUS');
  await expect(page.locator('#linked-column-problem')).toHaveText('a column is already headed "STATUS"');
  await expect(page.locator('#linked-column-save')).toBeDisabled();
  await page.fill('#linked-column-name', 'Project status');
  await page.selectOption('#linked-column-via', 'project');
  await expect(page.locator('#linked-column-name')).toHaveValue('Project status');
  await page.click('#linked-column-save');
  await expect(heading(page, 'linked:1')).toHaveText('Project status');

  // Cancel changes nothing.
  await openMenu(page, 'linked:1');
  await page.locator('[data-action="column-edit-linked"]').click();
  await page.selectOption('#linked-column-read', 'title');
  await page.click('#modal-linked-column .btn-action[data-action="linked-column-cancel"]');
  await expect(cellFor(page, 'Task A', 'linked:1')).toHaveText('active');

  // Delete, from the menu like every other column's, asks and says no note changes; then the column
  // is gone from the table and the file. The dialog's delete button is the same function.
  await openMenu(page, 'linked:1');
  await page.locator('[data-action="column-delete-linked"]').click();
  await expect(page.locator('#modal-unsaved-warning')).toContainText('No note is changed');
  await page.click('[data-action="warning-proceed"]');
  await expect(header(page, 'linked:1')).toHaveCount(0);
  await expect.poll(async () => (await layouts(page)).linkedProperties).toEqual({});
});

test('in the column picker a linked column has its toggle, no bin, and its glyph opens its dialog', async ({ page }) => {
  await openTable(page, SAVED_LAYOUT);
  // `count` is on no project note, so every cell of this column is empty.
  await addLinked(page, 'count', 'project');
  await openMenu(page, 'linked:1');
  await page.locator('[data-action="column-hide"]').click();
  await expect(header(page, 'linked:1')).toHaveCount(0);

  await page.click('[data-action="open-column-picker"]');
  const row = page.locator('#column-picker-list .info-modal-row[data-property="linked:1"]');
  await expect(row.locator('input.toggle')).toBeEnabled();
  await expect(row.locator('[data-action="column-delete"]')).toHaveCount(0);

  await row.locator('.column-picker-type').click();
  await expect(dialog(page)).toBeVisible();
  await page.fill('#linked-column-name', 'Project count');
  await page.click('#linked-column-save');
  await expect(row.locator('.info-modal-row-label')).toHaveText('Project count');

  await row.locator('input.toggle').check();
  await page.click('[data-action="close-column-picker"]');
  await expect(heading(page, 'linked:1')).toHaveText('Project count');
});

// The copy dialog, reached from a linked column because that is where its pre-fill lives. The bytes
// are level 1's (59-copy-property.spec.js); this is what the dialog says and what the table does
// after. plans/completed/table-copy-column.md §4, §7.3.
test('copy column: the dialog says what will happen, the column appears, and it opens with its last target', async ({ page }) => {
  const notes = {
    ...NOTES,
    'task-a.md': NOTES['task-a.md'].replace('---\n# Task A', 'phase: active\n---\n# Task A'),
    'task-b.md': NOTES['task-b.md'].replace('---\n# Task B', 'phase: old\n---\n# Task B'),
  };
  const layout = JSON.parse(SAVED_LAYOUT);
  layout.linkedProperties = { 'linked:1': { label: null, via: 'project', read: 'status' } };
  layout.layouts.mine.columns.push({ order: 4, name: 'linked:1', label: 'project → status', width: 150, visible: true });
  await openTable(page, JSON.stringify(layout), notes);

  const copyDialog = page.locator('#modal-column-copy');
  const forecast = page.locator('#column-copy-forecast');
  const problem = page.locator('#column-copy-problem');
  const confirm = page.locator('#column-copy-confirm');
  const openCopy = async () => {
    await openMenu(page, 'linked:1');
    await page.click('#column-menu [data-action="column-copy-property"]');
    await expect(copyDialog).toBeVisible();
  };

  await openCopy();
  await expect(page.locator('#column-copy-input')).toHaveValue('');
  await expect(forecast).toHaveText('Copies this column into a property of 2 files. 6 files have nothing to copy and are left as they are.');
  await expect(confirm).toBeDisabled();

  await page.fill('#column-copy-input', 'project');
  await expect(problem).toHaveText('"project" holds this column\'s links — copying into it would replace them');
  await expect(confirm).toBeDisabled();
  await page.fill('#column-copy-input', 'size');
  await expect(problem).toHaveText('"size" is the name of a built-in column');

  await page.fill('#column-copy-input', 'phase');
  await expect(problem).toBeHidden();
  await expect(forecast).toContainText('Writes "phase" in 1 file — 1 to overwrite, 1 already match.');
  await expect(confirm).toHaveText('overwrite 1 file');
  await expect(confirm).toHaveClass(/btn-action-danger/);

  await page.fill('#column-copy-input', 'project_status');
  await expect(forecast).toContainText('Creates "project_status" in 2 files.');
  await expect(confirm).toHaveText('copy into 2 files');
  await page.keyboard.press('Enter');
  await expect(copyDialog).toBeHidden();
  await expect(page.locator('#output-report')).toContainText('copied\u00A0 project → status to project_status in 2 files');

  // Shown last and visible, in the saved layout too, and nothing pending was saved by it.
  expect((await headings(page)).at(-1)).toBe('project_status');
  await expect(cellFor(page, 'Task A', 'project_status')).toHaveText('active');
  const savedColumns = (await layouts(page)).layouts.mine.columns;
  expect(savedColumns.at(-1)).toMatchObject({ name: 'project_status', visible: true });
  expect(await isDirty(page)).toBe(false);

  await openCopy();
  await expect(page.locator('#column-copy-input')).toHaveValue('project_status');
  await expect(forecast).toContainText('Every file already holds these values in "project_status".');
  await expect(confirm).toBeDisabled();
});
