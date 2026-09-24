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
 *   bare.md      — `people:` with nothing after it, which no count from appState can see (§5.2).
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
    window.__failWrite = new Set();
    window.__throwWrite = new Set();
    window.__pickerCalls = 0;

    const mk = (name) => ({
      kind: 'file', name,
      getFile: async () => {
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

test('every note with the key loses it, and nothing else in it changes', async ({ page }) => {
  await openTable(page);
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
});

test('with nothing locked, the column is left standing and empty', async ({ page }) => {
  const clean = Object.fromEntries(Object.entries(NOTES).filter(([name]) => !UNTOUCHED.includes(name)));
  await openTable(page, { ...clean, 'nokey.md': NOTES['nokey.md'] });
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleted people from 7 files');
  expect(await page.evaluate(() => window.appState.myFiles.some(file => Object.hasOwn(file, 'people'))))
    .toBe(false);
  await expect(page.locator('.note-table-cell-header[data-property="people"]')).toHaveAttribute('data-empty', '');
});

test('undo puts every note back byte for byte, redo takes them out again, and the cycle is stable', async ({ page }) => {
  await openTable(page);
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleted people');

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

test('the journal is on disk before the first note is written', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => {
    window.__betweenPasses = () => {
      window.__journal = JSON.parse(window.__saved['undo.gypsum']);
      window.__writtenAtJournal = { ...window.__writes };
    };
  });
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleted people');

  const { journal, writtenAtJournal } = await page.evaluate(() =>
    ({ journal: window.__journal, writtenAtJournal: window.__writtenAtJournal }));
  expect(writtenAtJournal).toEqual({});
  const batch = journal.undo.at(-1);
  expect(batch.kind).toBe('delete-property');
  expect(batch.edits.map(edit => edit.internalId).sort()).toEqual(Object.keys(AFTER).sort());
  expect(batch.edits.find(edit => edit.internalId === 'flow.md').before).toBe(' [ann, bob]');
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

test('a note changed between the passes is refused, not overwritten, and counted', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => {
    window.__betweenPasses = () => {
      window.__files['flow.md'] = window.__files['flow.md'].replace('[ann, bob]', '[ann, bob, cat]');
    };
  });
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleted people from 6 files, 4 skipped');
  expect((await files(page))['flow.md']).toContain('people: [ann, bob, cat]');
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

test('a failed verify is not recorded, so undo never "restores" a note that was not changed', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => window.__failWrite.add('flow.md'));
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleted people from 6 files');
  const batch = await page.evaluate(() => window.appState.undoStack.at(-1));
  expect(batch.edits.some(edit => edit.internalId === 'flow.md')).toBe(false);
});

test('a folder load is refused mid-delete, and every write lands in the first folder', async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => {
    window.__betweenPasses = () => {
      document.querySelector('[data-action="load-folder"]').click();
    };
  });
  const calls = await page.evaluate(() => window.__pickerCalls);
  await deletePeople(page);
  await expect(reportLine(page)).toContainText('deleted people from 7 files');
  expect(await page.evaluate(() => window.__pickerCalls)).toBe(calls);
  const after = await files(page);
  for (const [name, text] of Object.entries(AFTER)) expect(after[name], name).toBe(text);
});
