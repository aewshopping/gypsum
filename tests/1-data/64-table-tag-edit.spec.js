const { test, expect } = require('@playwright/test');
const { loadFolder, setupMockCellWritingFolder, chooseView, appModule } = require('../helpers');

/**
 * plans/completed/tag-edit-in-table-view.md, what reaches the disk: the tags cell opens with the note's `tags:`
 * list and nothing else, and what is typed or pasted there is written into that list — never a body
 * `#tag`. The text rules (spaces, `#`, quotes) are proved in node; the rest in a page, on
 * setupMockCellWritingFolder with the notes below added.
 */
const NOTES = {
  // Front matter and body tags both, `work` in both places.
  'both.md': '---\ntags: [work, Urgent]\nstatus: draft\n---\n# Both\n\nSome #idea and #work here.\n',
  'block.md': '---\ntags:\n  - one\n  - two\n---\n# Block\n\nBody #extra\n',
  'scalar.md': '---\ntags: solo\n---\n# Scalar\n',
  'spaced.md': '---\ntags: [my tag, work]\n---\n# Spaced\n',
  'nokey.md': '---\nstatus: live\n---\n# Nokey\n\nBody #kept\n',
  'plain.md': '# Plain\n\nNo front matter, but #here.\n',
};

async function openTable(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setupMockCellWritingFolder(page, NOTES);
  await page.goto('/');
  await loadFolder(page);
  await chooseView(page, 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const fileText = (page, name) => page.evaluate(name => window.__files[name], name);
const tagsCell = (page, title) => page.locator('.note-table').filter({ hasText: title }).first()
  .locator('.note-table-cell[data-prop="tags"]');

// The keyboard, not a click: a press on a pill filters, so a full cell is opened this way.
async function open(page, cell) {
  await cell.focus();
  await page.keyboard.press('Enter');
  await expect(cell).toHaveAttribute('contenteditable', 'plaintext-only');
}

async function retype(page, title, text) {
  const cell = tagsCell(page, title);
  await open(page, cell);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  if (text !== '') await page.keyboard.type(text);
  else await page.keyboard.press('Delete');
  await page.locator('#searchbox').click();
}

// ---------------------------------------------------------------- the text rules, in node

test('spaces separate tags, a leading # comes off, and a quoted tag stays whole', async () => {
  const { splitTagItems, joinTagItems } = await appModule('services/tag-items.js');

  expect(splitTagItems('#one #two')).toEqual(['one', 'two']);
  expect(splitTagItems('one two, three')).toEqual(['one', 'two', 'three']);
  expect(splitTagItems('"my tag", work')).toEqual(['my tag', 'work']);
  expect(splitTagItems('#, # one')).toEqual(['one']);
  // one `#` only: a second is the user's
  expect(splitTagItems('##a')).toEqual(['#a']);

  // a tag holding a space is quoted on the way into the cell, so it comes back out whole
  expect(joinTagItems(['my tag', 'work'])).toBe('"my tag", work');
  expect(splitTagItems(joinTagItems(['my tag', 'a, b', 'work']))).toEqual(['my tag', 'a, b', 'work']);
});

// ---------------------------------------------------------------- what the file object holds

test('frontMatterTags is the tags: list as written, and the TagMap is unchanged', async ({ page }) => {
  await openTable(page);
  const held = await page.evaluate(() => Object.fromEntries(window.appState.myFiles
    .map(file => [file.filename, { fm: file.frontMatterTags, tags: [...file.tags.keys()] }])));

  expect(held['both.md']).toEqual({ fm: ['work', 'Urgent'], tags: ['idea', 'work', 'urgent'] });
  expect(held['block.md']).toEqual({ fm: ['one', 'two'], tags: ['extra', 'one', 'two'] });
  expect(held['scalar.md'].fm).toEqual(['solo']);
  expect(held['nokey.md']).toEqual({ fm: [], tags: ['kept'] });
  expect(held['plain.md'].fm).toEqual([]);
});

test('a bare tags: key, and a null item, hold no front matter tags', async ({ page }) => {
  await setupMockCellWritingFolder(page, { 'bare.md': '---\ntags:\n---\n# Bare\n', 'nullitem.md': '---\ntags: [a, null]\n---\n# N\n' });
  await page.goto('/');
  await loadFolder(page);
  const held = await page.evaluate(() => Object.fromEntries(window.appState.myFiles.map(f => [f.filename, f.frontMatterTags])));
  expect(held['bare.md']).toEqual([]);
  expect(held['nullitem.md']).toEqual(['a']);
});

// ---------------------------------------------------------------- the cell opens with front matter only

test('the open cell holds the front matter list, and the body tags only as a faded line', async ({ page }) => {
  await openTable(page);
  const cell = tagsCell(page, 'Both');
  await open(page, cell);

  await expect(cell).toHaveText('work, Urgent');
  await expect(cell).toHaveAttribute('data-body-tags', '#idea');
});

test('a cell opened and left writes nothing, and a body tag is never written into front matter', async ({ page }) => {
  await openTable(page);
  const before = await fileText(page, 'both.md');

  await open(page, tagsCell(page, 'Both'));
  await page.locator('#searchbox').click();
  await retype(page, 'Nokey', 'new');

  // the body's #kept is not in the list: only what was typed
  await expect.poll(() => fileText(page, 'nokey.md')).toBe('---\nstatus: live\ntags:\n  - new\n---\n# Nokey\n\nBody #kept\n');
  expect(await fileText(page, 'both.md')).toBe(before);
});

// ---------------------------------------------------------------- writing

test('editing one tag rewrites only that item, in the case it was typed', async ({ page }) => {
  await openTable(page);
  await retype(page, 'Both', 'work, Later');

  await expect.poll(() => fileText(page, 'both.md')).toBe(
    '---\ntags: [work, Later]\nstatus: draft\n---\n# Both\n\nSome #idea and #work here.\n');
});

test('adding and removing in a block list keeps the note\'s style', async ({ page }) => {
  await openTable(page);
  await retype(page, 'Block', 'two, three, four');

  await expect.poll(() => fileText(page, 'block.md')).toBe(
    '---\ntags:\n  - two\n  - three\n  - four\n---\n# Block\n\nBody #extra\n');
});

test('hashtags separated by spaces are written as separate tags, without the #', async ({ page }) => {
  await openTable(page);
  await retype(page, 'Block', '#one #two #, #three');

  await expect.poll(() => fileText(page, 'block.md')).toContain('  - three\n');
  expect(await fileText(page, 'block.md')).toBe(
    '---\ntags:\n  - one\n  - two\n  - three\n---\n# Block\n\nBody #extra\n');
});

test('a tag holding a space survives an edit to another tag in the same cell', async ({ page }) => {
  await openTable(page);
  const cell = tagsCell(page, 'Spaced');
  await open(page, cell);
  await expect(cell).toHaveText('"my tag", work');
  await page.keyboard.press('End');
  await page.keyboard.type(', play');
  await page.locator('#searchbox').click();

  await expect.poll(() => fileText(page, 'spaced.md')).toBe('---\ntags: [my tag, work, play]\n---\n# Spaced\n');
});

test('a single tags: value is rewritten as a list when edited', async ({ page }) => {
  await openTable(page);
  await retype(page, 'Scalar', 'solo, duo');

  await expect.poll(() => fileText(page, 'scalar.md')).not.toContain('tags: solo\n');
  const text = await fileText(page, 'scalar.md');
  const tags = await page.evaluate(() => window.appState.myFiles.find(f => f.filename === 'scalar.md').frontMatterTags);
  expect(tags).toEqual(['solo', 'duo']);
  expect(text).toMatch(/tags: \[solo, duo\]|tags:\n\s+- solo\n\s+- duo/);
});

test('clearing the cell removes the tags: key and leaves the body tags', async ({ page }) => {
  await openTable(page);
  await retype(page, 'Both', '');

  await expect.poll(() => fileText(page, 'both.md')).toBe('---\nstatus: draft\n---\n# Both\n\nSome #idea and #work here.\n');
  // what is left is the body's, so each now wears its #
  await expect(tagsCell(page, 'Both').locator('[data-tag]')).toHaveText(['#idea', '#work']);
});

test('a note with no front matter is given a block', async ({ page }) => {
  await openTable(page);
  await retype(page, 'Plain', 'fresh');

  await expect.poll(() => fileText(page, 'plain.md')).toBe('---\ntags:\n  - fresh\n---\n\n# Plain\n\nNo front matter, but #here.\n');
});

test('a note whose front matter did not read keeps its tags cell locked', async ({ page }) => {
  await openTable(page);
  const cell = tagsCell(page, 'Beta');
  await cell.focus();
  await page.keyboard.press('Enter');
  await expect(cell).toHaveClass(/is-readonly/);
  await expect(cell).not.toHaveAttribute('contenteditable');
});

test('a tag holding a quote or a bracket draws as text in one pill', async ({ page }) => {
  await setupMockCellWritingFolder(page, { 'odd.md': '---\ntags: [\'say "hi"\', <b>]\n---\n# Odd\n' });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await loadFolder(page);
  await chooseView(page, 'table');
  const pills = tagsCell(page, 'Odd').locator('[data-tag]');
  await expect(pills).toHaveCount(2);
  await expect(pills.nth(0)).toHaveAttribute('data-tag', 'say "hi"');
  await expect(pills.nth(1)).toHaveAttribute('data-tag', '<b>');
  await expect(tagsCell(page, 'Odd').locator('b')).toHaveCount(0);
});

// ---------------------------------------------------------------- undo and paste

test('one undo puts a tags edit back', async ({ page }) => {
  await openTable(page);
  const before = await fileText(page, 'both.md');
  await retype(page, 'Both', 'gone');
  await expect.poll(() => fileText(page, 'both.md')).toContain('tags: [gone]');

  await page.locator('#table-undo-btn').click();
  await expect.poll(() => fileText(page, 'both.md')).toBe(before);
});

/** Ctrl+V with this text on the clipboard, at the focused cell. */
const paste = (page, text) => page.evaluate((text) => {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
}, text);

test('a paste into a tags cell writes front matter only, and one undo takes it back', async ({ page }) => {
  await openTable(page);
  const before = await fileText(page, 'nokey.md');
  await tagsCell(page, 'Nokey').focus();
  await paste(page, '#a #b');

  await expect.poll(() => fileText(page, 'nokey.md')).toBe('---\nstatus: live\ntags:\n  - a\n  - b\n---\n# Nokey\n\nBody #kept\n');

  await page.locator('#table-undo-btn').click();
  await expect.poll(() => fileText(page, 'nokey.md')).toBe(before);
});

test('pasting a cell\'s own front matter text back writes nothing', async ({ page }) => {
  await openTable(page);
  const before = await fileText(page, 'both.md');
  await tagsCell(page, 'Both').focus();
  await paste(page, 'work, Urgent');

  await expect(page.locator('#output-report')).toContainText('0');
  expect(await fileText(page, 'both.md')).toBe(before);
});
