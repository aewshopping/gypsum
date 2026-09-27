const { test, expect } = require('@playwright/test');
const { loadFolder } = require('../helpers');
const { RENAME_NOTES, setupPropertyFolder } = require('../fixtures/property-notes');

/**
 * plans/table-rename-column.md, end to end: renaming a property in every note changes the key and
 * nothing else, reads and writes only the notes that have it, journals before it writes, and one undo
 * puts every byte back.
 *
 * The bytes themselves — every note shape, both request orders, undo and redo — are proved in node by
 * 49-table-cell-writing.spec.js, in milliseconds. These tests prove they reach the disk, and what
 * only a browser can show. The notes and the mock are tests/fixtures/property-notes.js.
 */

const CARRYING = ['flow.md', 'block.md', 'quoted.md', 'last.md', 'only.md', 'bare.md', 'crlf.md',
  'commented.md', 'crowded.md', 'first.md'];
const LOCKED = ['broken.md', 'shadow.md', 'dup.md'];
const WITHOUT = ['lookalike.md', 'none.md', 'nokey.md'];
const renamed = (name) => RENAME_NOTES[name].replace(/^people:/m, 'attendees:');

async function openTable(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setupPropertyFolder(page, RENAME_NOTES);
  await page.addInitScript(() => { window.__betweenPassesKind = 'rename-property'; });
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const files = (page) => page.evaluate(() => ({ ...window.__files }));

/** The rename as the click handler runs it — busy table included — through the service. */
const renameThroughService = (page) => page.evaluate(async () => {
  const { renameProperty } = await import('/public/js/editing/rename-property.js');
  const { setBulkWriteBusy } = await import('/public/js/ui/ui-functions-table/bulk-write-busy.js');
  setBulkWriteBusy(true);
  try {
    return await renameProperty('people', 'attendees');
  } finally {
    setBulkWriteBusy(false);
  }
});

/**
 * One rename, looked at from every side, as the delete spec's main test is: the notes it never
 * reads, the locked notes, the journal on disk before the first write, a folder load refused
 * mid-way, the bytes on disk — then undo and redo, byte for byte across the whole folder.
 */
test('a rename: only carrying notes read, journal first, load refused, exact bytes, undo and redo', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => {
    window.__reads = {};
    window.__writes = {};
    window.__betweenPasses = () => {
      window.__journal = JSON.parse(window.__saved['undo.gypsum']);
      window.__writtenAtJournal = { ...window.__writes };
      document.querySelector('[data-action="load-folder"]').click();
    };
  });
  const pickerCalls = await page.evaluate(() => window.__pickerCalls);

  expect(await renameThroughService(page)).toEqual({ renamed: 10, skipped: 3, layoutSaved: true });

  const reads = await page.evaluate(() => ({ ...window.__reads }));
  for (const name of WITHOUT) expect(reads[name], name).toBeUndefined();
  const written = await page.evaluate(() => ({ ...window.__writes }));
  for (const name of [...WITHOUT, ...LOCKED]) expect(written[name], name).toBeUndefined();

  // The journal was on disk, holding both halves of every note's rename, before any note was written.
  const { journal, writtenAtJournal } = await page.evaluate(() =>
    ({ journal: window.__journal, writtenAtJournal: window.__writtenAtJournal }));
  expect(writtenAtJournal).toEqual({});
  const batch = journal.undo.at(-1);
  expect(batch).toMatchObject({ kind: 'rename-property', property: 'people', to: 'attendees' });
  expect(batch.edits).toHaveLength(2 * CARRYING.length);
  expect(await page.evaluate(() => window.__pickerCalls)).toBe(pickerCalls);

  const after = await files(page);
  for (const name of CARRYING) expect(after[name], name).toBe(renamed(name));
  for (const name of [...LOCKED, ...WITHOUT]) expect(after[name], name).toBe(RENAME_NOTES[name]);

  await page.locator('#table-undo-btn').click();
  await expect(page.locator('#output-report')).toContainText('undo: people column rename to attendees in 10 files — 10 notes');
  expect(await files(page)).toEqual(RENAME_NOTES);

  await page.locator('#table-redo-btn').click();
  await expect(page.locator('#output-report')).toContainText('redo: people column rename to attendees in 10 files');
  const redone = await files(page);
  for (const name of CARRYING) expect(redone[name], name).toBe(renamed(name));
  for (const name of [...LOCKED, ...WITHOUT]) expect(redone[name], name).toBe(RENAME_NOTES[name]);
});

// §6.1: the dialog refuses a name any loaded note has, but a note can gain it after that check. The
// write must refuse that note whole — renaming it would bring two keys together, and removing
// `people` alone would lose its value.
test('a note that gains the new name between the passes is refused whole and counted as skipped', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => {
    window.__betweenPasses = () => {
      window.__files['flow.md'] = window.__files['flow.md'].replace('status: draft', 'status: draft\nattendees: cat');
    };
  });

  expect(await renameThroughService(page)).toEqual({ renamed: 9, skipped: 4, layoutSaved: true });
  expect((await files(page))['flow.md']).toBe(RENAME_NOTES['flow.md'].replace('status: draft', 'status: draft\nattendees: cat'));

  const ids = await page.evaluate(() => window.appState.undoStack.at(-1).edits.map(edit => edit.internalId));
  expect(ids).not.toContain('flow.md');
});
