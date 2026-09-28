const { test, expect } = require('@playwright/test');
const { loadFolder } = require('../helpers');
const { RENAME_NOTES, setupPropertyFolder } = require('../fixtures/property-notes');

/**
 * plans/completed/table-copy-column.md, end to end: copying a column into a property of every note writes
 * that key and nothing else, journals before it writes, leaves alone the notes it has no business
 * with, and one undo puts every byte back.
 *
 * Only what needs a real folder is here. The bytes for every source shape, the text a linked value
 * becomes and the refused names are proved in node by 49-table-cell-writing.spec.js; locked notes,
 * a throw mid-batch and the pool are the shared writer's, proved by the delete and rename specs.
 */

/** A note whose target already holds the value: it must not be written. */
const MATCH = { 'match.md': '---\npeople: ann\nstatus: ann\n---\n# Match\n' };
const NOTES = { ...RENAME_NOTES, ...MATCH };

const EXPECTED = {
  'flow.md': '---\nstatus: [ann, bob]\npeople: [ann, bob]\nnote: x\n---\n# Flow\n',
  'block.md': '---\nkind: x\npeople:\n    - ann\n    - bob\n# after the list\nstatus:\n    - ann\n    - bob\n---\n# Block\n',
  'quoted.md': '---\npeople: "ann, bob"\nstatus: "ann, bob"\n---\n# Quoted\n',
  'only.md': '---\npeople: ann\nstatus: ann\n---\n# Only\n',
  'bare.md': '---\nstatus:\npeople:\nnote: y\n---\n# Bare\n',
  'crlf.md': '---\r\nstatus:\r\n  - ann\r\n  - bob\r\npeople:\r\n  - ann\r\n  - bob\r\nnote: z\r\n---\r\n# Crlf\r\n',
  'commented.md': '---\ntitle: Planning\n# who came\npeople:\n  - ann   # chair\n  - bob\n# end of list\nstatus:\n  - ann   # chair\n  - bob\n---\n# Commented\n',
  'crowded.md': '---\nkind: x\n\n# people below\n\npeople: [ann]\nstatus: [ann]\n---\n# Crowded\n',
  'first.md': '---\n\npeople: ann\nstatus: ann\n---\n# First\n',
};
/** Edited between the passes, so the copy must refuse it. */
const EDITED = RENAME_NOTES['last.md'].replace('status: draft', 'status: done');
const UNTOUCHED = ['broken.md', 'shadow.md', 'dup.md', 'lookalike.md', 'none.md', 'nokey.md', 'match.md'];

async function openTable(page, notes, layouts) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setupPropertyFolder(page, notes);
  await page.addInitScript(() => { window.__betweenPassesKind = 'copy-property'; });
  await page.goto('/');
  if (layouts) await page.evaluate((text) => { window.__saved['table_layouts.gypsum'] = text; }, JSON.stringify(layouts));
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const files = (page) => page.evaluate(() => ({ ...window.__files }));

/** The copy as the click handler runs it — busy table included — through the service. */
const copyThroughService = (page, source, target) => page.evaluate(async ([source, target]) => {
  const { copyProperty } = await import('/public/js/editing/copy-property.js');
  const { setBulkWriteBusy } = await import('/public/js/ui/ui-functions-table/bulk-write-busy.js');
  setBulkWriteBusy(true);
  try {
    return await copyProperty(source, target);
  } finally {
    setBulkWriteBusy(false);
  }
}, [source, target]);

test('a front matter copy: journal first, exact bytes, matching and locked notes untouched, a changed note refused, one undo', async ({ page }) => {
  await openTable(page, NOTES);
  await page.evaluate(() => {
    window.__reads = {};
    window.__writes = {};
    window.__betweenPasses = () => {
      window.__journal = JSON.parse(window.__saved['undo.gypsum']);
      window.__writtenAtJournal = { ...window.__writes };
      window.__files['last.md'] = window.__files['last.md'].replace('status: draft', 'status: done');
    };
  });

  expect(await copyThroughService(page, 'people', 'status'))
    .toEqual({ copied: 9, overwritten: 8, matched: 1, skipped: 4, layoutSaved: true });

  // The journal was on disk before any note was written.
  const { journal, writtenAtJournal } = await page.evaluate(() =>
    ({ journal: window.__journal, writtenAtJournal: window.__writtenAtJournal }));
  expect(writtenAtJournal).toEqual({});
  expect(journal.undo.at(-1)).toMatchObject({ kind: 'copy-property', property: 'people', to: 'status' });

  // A note without the source key is never read.
  const reads = await page.evaluate(() => ({ ...window.__reads }));
  for (const name of ['none.md', 'nokey.md', 'lookalike.md']) expect(reads[name], name).toBeUndefined();

  const after = await files(page);
  for (const [name, text] of Object.entries(EXPECTED)) expect(after[name], name).toBe(text);
  expect(after['last.md']).toBe(EDITED);
  const written = await page.evaluate(() => ({ ...window.__writes }));
  for (const name of [...UNTOUCHED, 'last.md']) {
    expect(written[name], name).toBeUndefined();
    if (name !== 'last.md') expect(after[name], name).toBe(NOTES[name]);
  }

  await page.locator('#table-undo-btn').click();
  await expect(page.locator('#output-report')).toContainText('undo: people column copy to status in 9 files');
  expect(await files(page)).toEqual({ ...NOTES, 'last.md': EDITED });
});

test('a linked copy writes what the cells show, remembers its target, and a re-copy writes no note', async ({ page }) => {
  const notes = {
    'a.md': '---\nproject: "[[p1.md]]"\n---\n# A\n',
    'b.md': '---\nproject: "[[p2.md]]"\nproject_status: old\n---\n# B\n',
    'c.md': '---\nproject: "[[gone.md]]"\nproject_status: kept\n---\n# C\n',
    'p1.md': '---\nstatus: active\n---\n# P1\n',
    'p2.md': '---\nstatus: "007"\n---\n# P2\n',
  };
  await openTable(page, notes, { linkedProperties: { 'linked:1': { label: null, via: 'project', read: 'status' } } });

  expect(await copyThroughService(page, 'linked:1', 'project_status'))
    .toEqual({ copied: 2, overwritten: 1, matched: 0, skipped: 0, layoutSaved: true });
  expect(await files(page)).toEqual({
    ...notes,
    'a.md': '---\nproject: "[[p1.md]]"\nproject_status: active\n---\n# A\n',
    'b.md': '---\nproject: "[[p2.md]]"\nproject_status: "007"\n---\n# B\n',
  });
  const saved = await page.evaluate(() => JSON.parse(window.__saved['table_layouts.gypsum']));
  expect(saved.linkedProperties['linked:1'].copyTo).toBe('project_status');

  await page.evaluate(() => { window.__writes = {}; });
  expect(await copyThroughService(page, 'linked:1', 'project_status'))
    .toEqual({ copied: 0, overwritten: 0, matched: 2, skipped: 0, layoutSaved: true });
  expect(await page.evaluate(() => window.__writes)).toEqual({});
});
