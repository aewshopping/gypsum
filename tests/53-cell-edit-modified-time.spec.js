const { test, expect } = require('@playwright/test');
const { loadFolder } = require('./helpers');

/**
 * The table's "last modified" column, after an edit made from the table.
 *
 * The mock every other spec uses reports lastModified as Date.now() on every read, so it could
 * never tell a file that was written from one that was not. This one keeps an mtime per file and
 * bumps it when the file is written, which is what the file system does — and what the column has
 * to show, since it is the only thing on screen saying which note an edit reached.
 */
async function setupFiles(page, startMtime) {
  await page.addInitScript((startMtime) => {
    window.__files = { 'alpha.md': '---\nstatus: draft\nnote: plain\n---\n# Alpha\n\nBody text.\n' };
    window.__mtimes = { 'alpha.md': startMtime };
    window.__saved = {};

    const mk = (name) => ({
      kind: 'file', name,
      getFile: async () => ({
        name, size: window.__files[name].length, lastModified: window.__mtimes[name],
        text: async () => window.__files[name],
      }),
      createWritable: async () => ({
        write: async (content) => { window.__files[name] = content; },
        close: async () => { window.__mtimes[name] = Date.now(); },
      }),
    });

    const gypsumDir = {
      getFileHandle: async (name, options) => {
        if (!(name in window.__saved)) {
          if (!options?.create) throw new Error(`NotFoundError: ${name}`);
          window.__saved[name] = '';
        }
        return {
          getFile: async () => ({ text: async () => window.__saved[name] }),
          createWritable: async () => ({
            write: async (content) => { window.__saved[name] = content; },
            close: async () => {},
          }),
        };
      },
      removeEntry: async (name) => { delete window.__saved[name]; },
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { for (const name of Object.keys(window.__files)) yield mk(name); },
      getDirectoryHandle: async () => gypsumDir,
    });
  }, startMtime);
}

const cell = (page, prop) => page.locator(`.list-table .note-table-cell[data-prop="${prop}"]`).first();

async function openTable(page) {
  await loadFolder(page);
  await page.selectOption('#view-select', 'table');
  await expect(cell(page, 'note')).toBeVisible();
}

/** Opens the note cell, appends to it, and leaves the way a user does — by clicking away. */
async function editNoteCell(page, text) {
  const note = cell(page, 'note');
  await note.click();
  await note.click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await page.locator('#searchbox').click();
}

test('a cell edit moves the file on, and the column shows it the same day', async ({ page }) => {
  // Three hours ago: the same calendar date as the edit for all but the first hours of the day,
  // which is exactly the case a date-only cell could not show.
  await setupFiles(page, Date.now() - 3 * 60 * 60 * 1000);
  await page.goto('/');
  await openTable(page);

  const before = await cell(page, 'lastModified').textContent();
  const beforeStamp = await page.evaluate(() => window.appState.myFiles[0].lastModified.getTime());

  await editNoteCell(page, 'X');

  await expect(cell(page, 'note')).toHaveText('plainX');
  await expect(cell(page, 'lastModified')).not.toHaveText(before);

  const afterStamp = await page.evaluate(() => window.appState.myFiles[0].lastModified.getTime());
  expect(afterStamp).toBeGreaterThan(beforeStamp);
});

test('the cell carries a time of day, not just a date', async ({ page }) => {
  await setupFiles(page, new Date('2020-01-02T10:30:00').getTime());
  await page.goto('/');
  await openTable(page);

  // Not an exact string: the format is the reader's locale. What matters is that the minute is
  // there beside the date, since two edits an hour apart are the case this column has to separate.
  await expect(cell(page, 'lastModified')).toContainText(new Date('2020-01-02T10:30:00').toLocaleDateString());
  await expect(cell(page, 'lastModified')).toContainText('30');
});
