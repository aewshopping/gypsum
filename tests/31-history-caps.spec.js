const { test, expect } = require('@playwright/test');
const { loadFolder } = require('./helpers');

// Two notes, plus a writable history.gypsum. Editing is not involved: each open writes a
// snapshot, so re-opening a file with fresh content is enough to drive the caps.
async function setupTwoFiles(page) {
  await page.addInitScript(() => {
    window.__backupFileContent = '';
    // Mutable so a test can change a file's content between opens and defeat the dedup check
    window.__fileContent = { 'alpha.md': '# Alpha\nversion 0', 'beta.md': '# Beta\nonly ever this' };

    const makeFile = (name) => ({
      kind: 'file', name,
      getFile: async () => ({
        name,
        size: window.__fileContent[name].length,
        lastModified: Date.now(),
        text: async () => window.__fileContent[name],
      }),
    });
    const backupHandle = {
      getFile: async () => ({ text: async () => window.__backupFileContent }),
      createWritable: async () => ({
        write: async (c) => { window.__backupFileContent = c; },
        close: async () => {},
      }),
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { yield makeFile('alpha.md'); yield makeFile('beta.md'); },
      getDirectoryHandle: async (name) => {
        if (name === '.gypsum') return {
          getFileHandle: async (n) => {
            if (n === 'history.gypsum') return backupHandle;
            throw new Error(`Unexpected: ${n}`);
          },
        };
        throw new Error(`Unexpected getDirectoryHandle: ${name}`);
      },
    });
  });
}

const snapshotsFor = (page, filename) => page.evaluate((name) => {
  const parsed = JSON.parse(window.__backupFileContent);
  return parsed.snapshots
    .filter(s => s.filename === name)
    .map(s => s.lineRefs.map(i => parsed.lines[i]).join('\n'));
}, filename);

// Open the file, wait for its snapshot to land, close again.
//
// The wait is on the newest snapshot's *content*, not on the snapshot count: once the
// per-file cap engages the count stops growing, which is the whole point of this suite.
//
// The short settles matter too — clicking close while the opening view transition is still
// running interrupts it, and the dialog is only closed from that transition's finished callback.
async function openAndClose(page, fileId, expectedTail) {
  await page.locator(`[data-action="open-file-content-modal"][data-file-id="${fileId}"]`).click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await page.waitForFunction((tail) => {
    try {
      const parsed = JSON.parse(window.__backupFileContent);
      const newest = parsed.snapshots[parsed.snapshots.length - 1];
      return !!newest && newest.lineRefs.map(i => parsed.lines[i]).join('\n').endsWith(tail);
    } catch { return false; }
  }, expectedTail);
  await page.waitForTimeout(150);
  await page.click('[data-action="close-file-content-modal"]');
  await expect(page.locator('#file-content-modal')).not.toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(50);
}

test.describe('history.gypsum caps', () => {

  // The cap tests open and close a file 16 times, each with a view transition
  test.setTimeout(120_000);

  test('a file keeps only its newest 15 versions, and other files are untouched', async ({ page }) => {
    await setupTwoFiles(page);
    await page.goto('/');
    await loadFolder(page);

    await openAndClose(page, 'beta.md', 'only ever this'); // a file we never touch again

    // 16 distinct versions of alpha.md — one past the per-file cap
    for (let v = 1; v <= 16; v++) {
      await page.evaluate((n) => { window.__fileContent['alpha.md'] = `# Alpha\nversion ${n}`; }, v);
      await openAndClose(page, 'alpha.md', `version ${v}`);
    }

    const alpha = await snapshotsFor(page, 'alpha.md');
    expect(alpha).toHaveLength(15);
    expect(alpha[0]).toContain('version 2');   // version 1 evicted as the oldest
    expect(alpha[14]).toContain('version 16'); // newest kept
    expect(alpha.some(c => c.endsWith('version 1'))).toBe(false);

    // beta.md's single version survives alpha.md's churn — the old global cap would not
    // have distinguished them
    expect(await snapshotsFor(page, 'beta.md')).toEqual(['# Beta\nonly ever this']);
  });

  test('evicted lines are garbage collected from the pool', async ({ page }) => {
    await setupTwoFiles(page);
    await page.goto('/');
    await loadFolder(page);

    for (let v = 1; v <= 16; v++) {
      await page.evaluate((n) => { window.__fileContent['alpha.md'] = `# Alpha\nversion ${n}`; }, v);
      await openAndClose(page, 'alpha.md', `version ${v}`);
    }

    const { lines, refs } = await page.evaluate(() => {
      const parsed = JSON.parse(window.__backupFileContent);
      return { lines: parsed.lines, refs: parsed.snapshots.flatMap(s => s.lineRefs) };
    });

    expect(lines).not.toContain('version 1');           // dropped with the evicted snapshot
    expect(refs.every(i => i >= 0 && i < lines.length)).toBe(true); // every ref remapped in range
    expect(new Set(refs).size).toBe(lines.length);      // no orphaned lines left behind
  });

  test('the history file is written compact, not pretty-printed', async ({ page }) => {
    await setupTwoFiles(page);
    await page.goto('/');
    await loadFolder(page);

    await openAndClose(page, 'alpha.md', 'version 0');

    const raw = await page.evaluate(() => window.__backupFileContent);
    expect(raw).not.toContain('\n  ');   // no indentation
    expect(raw.split('\n')).toHaveLength(1);
  });

});
