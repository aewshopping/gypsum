const { test, expect } = require('@playwright/test');
const { loadFolder } = require('../helpers');

/**
 * plans/table-delete-column.md, end to end: "delete column" takes a property out of every note that
 * has it, and one undo puts all of it back, byte for byte.
 *
 * What each note is for (§14.1):
 *   flow.md      — `people: [ann, bob]` between two other keys.
 *   block.md     — a block list with 4-space items, and a comment after its last item that must stay.
 *   quoted.md    — `people` quoted, and the first key of the block.
 *   last.md      — `people` as the last key.
 *   only.md      — `people` as the only key, so the block empties to ---/---.
 *   bare.md      — `people:` with nothing after it: null on the file object, so counted and planned
 *                  like any other (plans/bare-keys-as-null.md).
 *   crlf.md      — the whole note in CRLF.
 *   lookalike.md — peoples:, People: and people2:, and a body line `people: x`, none of them the key.
 *   none.md      — no front matter at all.
 *   broken.md    — `people` beside a line the parser skips: locked, so skipped.
 *   shadow.md    — `people` beside a reserved `filename:`: locked, so skipped.
 *   dup.md       — `people` twice, the second a block list: locked, so skipped (§5.3).
 *   nokey.md     — front matter without `people`.
 *
 * The mock records every write per file, can fail a named file's write (verify fails) or make it
 * throw, and runs window.__betweenPasses when the journal reaches undo.gypsum — which is the moment
 * between the plan pass and the write pass.
 */
const NOTES = {
  'flow.md': '---\nstatus: draft\npeople: [ann, bob]\nnote: x\n---\n# Flow\n',
  'block.md': '---\nkind: x\npeople:\n    - ann\n    - bob\n# after the list\nstatus: live\n---\n# Block\n',
  'quoted.md': '---\npeople: "ann, bob"\nstatus: draft\n---\n# Quoted\n',
  'last.md': '---\nstatus: draft\npeople: ann\n---\n# Last\n',
  'only.md': '---\npeople: ann\n---\n# Only\n',
  'bare.md': '---\nstatus: draft\npeople:\nnote: y\n---\n# Bare\n',
  'crlf.md': '---\r\nstatus: draft\r\npeople:\r\n  - ann\r\n  - bob\r\nnote: z\r\n---\r\n# Crlf\r\n',
  'lookalike.md': '---\npeoples: a\nPeople: b\npeople2: c\n---\n# Lookalike\n\npeople: x\n',
  'none.md': '# None\n\nNo front matter.\n',
  'broken.md': '---\npeople: ann\nthis line has no colon\n---\n# Broken\n',
  'shadow.md': '---\npeople: ann\nfilename: fake.md\n---\n# Shadow\n',
  'dup.md': '---\npeople: ann\nstatus: draft\npeople:\n  - bob\n---\n# Dup\n',
  'nokey.md': '---\nstatus: draft\n---\n# Nokey\n',
};

const AFTER = {
  'flow.md': '---\nstatus: draft\nnote: x\n---\n# Flow\n',
  'block.md': '---\nkind: x\n# after the list\nstatus: live\n---\n# Block\n',
  'quoted.md': '---\nstatus: draft\n---\n# Quoted\n',
  'last.md': '---\nstatus: draft\n---\n# Last\n',
  'only.md': '---\n---\n# Only\n',
  'bare.md': '---\nstatus: draft\nnote: y\n---\n# Bare\n',
  'crlf.md': '---\r\nstatus: draft\r\nnote: z\r\n---\r\n# Crlf\r\n',
};
const UNTOUCHED = ['lookalike.md', 'none.md', 'broken.md', 'shadow.md', 'dup.md', 'nokey.md'];

async function setupFiles(page, notes = NOTES) {
  await page.addInitScript((notes) => {
    window.__files = { ...notes };
    window.__saved = {};
    window.__writes = {};
    window.__reads = {};
    window.__failWrite = new Set();
    window.__throwWrite = new Set();
    window.__pickerCalls = 0;

    const mk = (name) => ({
      kind: 'file', name,
      getFile: async () => {
        window.__reads[name] = (window.__reads[name] ?? 0) + 1;
        if (!(name in window.__files)) throw Object.assign(new Error('gone'), { name: 'NotFoundError' });
        return {
          name, size: window.__files[name].length, lastModified: Date.now(),
          text: async () => window.__files[name],
        };
      },
      createWritable: async () => {
        if (window.__throwWrite.has(name)) throw new Error(`the write of ${name} died`);
        return {
          write: async (content) => {
            window.__writes[name] = (window.__writes[name] ?? 0) + 1;
            if (!window.__failWrite.has(name)) window.__files[name] = content;
          },
          close: async () => {},
        };
      },
    });

    const gypsumDir = {
      getFileHandle: async (name, options) => {
        if (!(name in window.__saved)) {
          if (!options?.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
          window.__saved[name] = '';
        }
        return {
          getFile: async () => ({ text: async () => window.__saved[name] }),
          createWritable: async () => ({
            write: async (content) => {
              window.__saved[name] = content;
              if (name === 'undo.gypsum' && content.includes('delete-property') && window.__betweenPasses) {
                const hook = window.__betweenPasses;
                window.__betweenPasses = null;
                await hook();
              }
            },
            close: async () => {},
          }),
        };
      },
      removeEntry: async (name) => { delete window.__saved[name]; },
    };

    window.showDirectoryPicker = async () => {
      window.__pickerCalls++;
      return {
        kind: 'directory', name: 'root',
        values: async function* () { for (const name of Object.keys(window.__files)) yield mk(name); },
        getDirectoryHandle: async (name) => {
          if (name === '.gypsum') return gypsumDir;
          throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
        },
      };
    };
  }, notes);
}

async function openTable(page, notes) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setupFiles(page, notes);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(page.locator('.note-table-header')).toBeVisible();
}

const files = (page) => page.evaluate(() => ({ ...window.__files }));
const writes = (page) => page.evaluate(() => ({ ...window.__writes }));
const reportLine = (page) => page.locator('#output-report');

/** Opens the people column's menu, presses "delete column", and agrees. */
async function deletePeople(page) {
  const header = page.locator('.note-table-cell-header[data-property="people"]');
  await header.click();
  await header.click();
  await page.locator('#column-menu [data-action="column-delete-property"]').click();
  await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
  await page.click('[data-action="warning-proceed"]');
}

// plans/bare-keys-as-null.md: bare.md is seen from appState, so the dialog counts the notes the
// result line will, and a note without the key is never opened.
test('the dialog counts a bare key, and a note without the key is not read', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => { window.__reads = {}; });

  const header = page.locator('.note-table-cell-header[data-property="people"]');
  await header.click();
  await header.click();
  await page.locator('#column-menu [data-action="column-delete-property"]').click();
  await expect(page.locator('#modal-unsaved-warning-text')).toContainText('Delete "people" from 7 files?');
  await page.click('[data-action="warning-proceed"]');
  await expect(reportLine(page)).toContainText('deleted people from 7 files, 3 skipped');

  const reads = await page.evaluate(() => ({ ...window.__reads }));
  for (const name of ['lookalike.md', 'none.md', 'nokey.md']) expect(reads[name], name).toBeUndefined();
  expect(reads['bare.md']).toBeGreaterThan(0);
});

/**
 * One delete, looked at from every side: the bytes it leaves, the notes it never touches, the
 * journal on disk before the first write, a folder load refused mid-way — then undo, redo and undo
 * again, byte for byte. One test rather than five because each needed the same delete of the same
 * fixture, and a page load is most of what a test here costs.
 */
test('a delete: exact bytes, untouched notes, journal first, load refused, and a stable undo/redo cycle', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => {
    window.__betweenPasses = () => {
      window.__journal = JSON.parse(window.__saved['undo.gypsum']);
      window.__writtenAtJournal = { ...window.__writes };
      document.querySelector('[data-action="load-folder"]').click();
    };
  });
  const pickerCalls = await page.evaluate(() => window.__pickerCalls);
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleted people from 7 files, 3 skipped');

  const after = await files(page);
  for (const [name, text] of Object.entries(AFTER)) expect(after[name], name).toBe(text);
  for (const name of UNTOUCHED) expect(after[name], name).toBe(NOTES[name]);

  // Unchanged bytes are not enough: a rewrite with the same bytes still moves the modified time.
  const written = await writes(page);
  for (const name of UNTOUCHED) expect(written[name], name).toBeUndefined();

  // What the table holds is what the disk holds, although the refresh no longer reads it back.
  const carrying = await page.evaluate(() => window.appState.myFiles
    .filter(file => Object.hasOwn(file, 'people')).map(file => file.filename).sort());
  expect(carrying).toEqual(['broken.md', 'dup.md', 'shadow.md']);

  // The journal was on disk, holding every note's removed text, before any note was written (§8.3).
  const { journal, writtenAtJournal } = await page.evaluate(() =>
    ({ journal: window.__journal, writtenAtJournal: window.__writtenAtJournal }));
  expect(writtenAtJournal).toEqual({});
  const batch = journal.undo.at(-1);
  expect(batch.kind).toBe('delete-property');
  expect(batch.edits.map(edit => edit.internalId).sort()).toEqual(Object.keys(AFTER).sort());
  expect(batch.edits.find(edit => edit.internalId === 'flow.md').before).toBe(' [ann, bob]');

  // The folder load pressed between the passes was refused (§6.2a).
  expect(await page.evaluate(() => window.__pickerCalls)).toBe(pickerCalls);

  await page.locator('#table-undo-btn').click();
  await expect(reportLine(page)).toContainText('undo: people column delete in 7 files');
  expect(await files(page)).toEqual(NOTES);

  await page.locator('#table-redo-btn').click();
  await expect(reportLine(page)).toContainText('redo: people column delete in 7 files');
  const redone = await files(page);
  for (const [name, text] of Object.entries(AFTER)) expect(redone[name], name).toBe(text);

  await page.locator('#table-undo-btn').click();
  await expect(reportLine(page)).toContainText('undo: people column delete');
  expect(await files(page)).toEqual(NOTES);
});

test('a second pass cut short undoes cleanly', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => {
    window.__failWrite.add('quoted.md');
    for (const name of ['last.md', 'only.md', 'bare.md', 'crlf.md']) window.__throwWrite.add(name);
  });
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleting people stopped');

  // Whatever was written, undo puts back; whatever was not, it refuses — and every note ends as it began.
  await page.locator('#table-undo-btn').click();
  await expect(reportLine(page)).toContainText('fail');
  expect(await files(page)).toEqual(NOTES);
});

test('a note changed between the passes is refused, and a failed verify is not recorded', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => {
    window.__failWrite.add('quoted.md');
    window.__betweenPasses = () => {
      window.__files['flow.md'] = window.__files['flow.md'].replace('[ann, bob]', '[ann, bob, cat]');
    };
  });
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleted people from 5 files, 5 skipped');
  expect((await files(page))['flow.md']).toContain('people: [ann, bob, cat]');

  // Neither is in the entry, so a later undo cannot "restore" a note that was never changed.
  const ids = await page.evaluate(() => window.appState.undoStack.at(-1).edits.map(edit => edit.internalId));
  expect(ids).not.toContain('flow.md');
  expect(ids).not.toContain('quoted.md');
});

test('a pass that writes nothing leaves no entry', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => {
    window.__betweenPasses = () => {
      for (const name of ['flow.md', 'block.md', 'quoted.md', 'last.md', 'only.md', 'bare.md', 'crlf.md']) {
        window.__files[name] = window.__files[name].replace('# ', '# changed ').replace('people:', 'people: changed\nx:');
      }
    };
  });
  const before = await page.evaluate(() => window.appState.undoStack.length);
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleted people from 0 files');
  expect(await page.evaluate(() => window.appState.undoStack.length)).toBe(before);
  expect(JSON.parse(await page.evaluate(() => window.__saved['undo.gypsum'])).undo).toHaveLength(before);
});

// ---------------------------------------------------------------- the undo list, §10

/** Opens the undo list and presses the row naming `name`. */
async function undoFromList(page, name) {
  await page.locator('#table-undo-list-btn').click();
  await page.locator('#undo-list .undo-list-row', { hasText: name }).click();
}

test('a delete undone from the list keeps a later edit, and refuses a note that has the key again', async ({ page }) => {
  await openTable(page);
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleted people');

  await page.evaluate(async () => {
    const { applyCellEdits } = await import('/public/js/editing/save-cell-edit.js');
    await applyCellEdits([{ internalId: 'flow.md', property: 'status', text: 'later' }]);
    // people comes back into last.md from somewhere else, as another editor would put it
    window.__files['last.md'] = window.__files['last.md'].replace('status: draft\n', 'status: draft\npeople: new\n');
  });

  await undoFromList(page, 'people column delete');
  await expect(reportLine(page)).toContainText('undo: people column delete in 7 files — 6 values, 1 fail');

  const after = await files(page);
  expect(after['flow.md']).toBe('---\nstatus: later\npeople: [ann, bob]\nnote: x\n---\n# Flow\n');
  expect(after['last.md']).toBe('---\nstatus: draft\npeople: new\n---\n# Last\n');
  for (const name of ['block.md', 'quoted.md', 'only.md', 'bare.md', 'crlf.md']) expect(after[name], name).toBe(NOTES[name]);
});

test('a delete is undone from the list after the folder is loaded again, and clearing the history writes empty stacks', async ({ page }) => {
  await openTable(page);
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleted people');
  await page.evaluate(async () => {
    const { applyCellEdits } = await import('/public/js/editing/save-cell-edit.js');
    await applyCellEdits([{ internalId: 'nokey.md', property: 'status', text: 'later' }]);
  });

  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  // A fresh visit: the key does not reach back past it, and the list does.
  await expect(page.locator('#table-undo-btn')).toBeDisabled();
  await undoFromList(page, 'people column delete');
  await expect(reportLine(page)).toContainText('undo: people column delete');
  const undone = await files(page);
  for (const name of Object.keys(AFTER)) expect(undone[name], name).toBe(NOTES[name]);

  await page.locator('#table-undo-list-btn').click();
  await page.locator('#undo-list [data-action="undo-list-clear"]').click();
  await expect(page.locator('#modal-unsaved-warning-text')).toContainText('The 1 change in the list can no longer be undone');
  await page.click('[data-action="warning-proceed"]');

  await expect.poll(async () => JSON.parse(await page.evaluate(() => window.__saved['undo.gypsum'])))
    .toEqual({ undoVersion: 1, undo: [], redo: [] });
  await expect(page.locator('#table-undo-list-btn')).toBeDisabled();
});
