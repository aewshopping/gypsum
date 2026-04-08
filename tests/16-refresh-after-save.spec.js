const { test, expect } = require('@playwright/test');

/**
 * Tests for refreshFileAfterSave.
 *
 * The feature: after a successful manual save, appState is re-parsed from disk
 * and the UI (file list + tag taxonomy) is re-rendered in the background. The
 * save popover appears immediately; the refresh runs fire-and-forget.
 *
 * Autosave intentionally does NOT trigger a refresh — it only writes a temp
 * file, not the original. No tests cover that case because autosave.js is
 * deliberately unmodified by this feature.
 */

// ─── Mock setup ───────────────────────────────────────────────────────────────

/**
 * Injects a mock directory with a single notes.md file and full save support.
 * After a save writes to the file handle, subsequent getFile() calls return
 * the updated content — which is what getFileDataAndMetadata reads on refresh.
 * @param {import('@playwright/test').Page} page
 * @param {string} initialContent
 */
async function setupWithContent(page, initialContent) {
  await page.addInitScript((content) => {
    window.__savedFiles = {};
    window.__originalFiles = {};
    window.__backupFileContent = '';
    const name = 'notes.md';
    window.showDirectoryPicker = async () => ({
      kind: 'directory',
      name: 'root',
      values: async function* () {
        yield {
          kind: 'file',
          name,
          getFile: async () => ({
            name,
            size: (window.__originalFiles[name] ?? content).length,
            lastModified: Date.now(),
            text: async () => window.__originalFiles[name] ?? content,
          }),
          createWritable: async () => ({
            write: async (c) => { window.__originalFiles[name] = c; },
            close: async () => {},
          }),
        };
      },
      getDirectoryHandle: async (n, _options) => {
        if (n !== '.gypsum') throw new Error(`Unexpected: ${n}`);
        return {
          getFileHandle: async (fn, _opts) => {
            if (fn === 'history.gypsum') return {
              getFile: async () => ({ text: async () => window.__backupFileContent }),
              createWritable: async () => ({
                write: async (c) => { window.__backupFileContent = c; },
                close: async () => {},
              }),
            };
            if (!(fn in window.__savedFiles)) window.__savedFiles[fn] = '';
            return {
              getFile: async () => ({ text: async () => window.__savedFiles[fn] }),
              createWritable: async () => ({
                write: async (c) => { window.__savedFiles[fn] = c; },
                close: async () => {},
              }),
            };
          },
          removeEntry: async (fn) => { delete window.__savedFiles[fn]; },
        };
      },
    });
  }, initialContent);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function waitForHistoryOptions(page, count) {
  await page.waitForFunction((n) => {
    const sel = document.getElementById('file-content-history-select');
    return sel && sel.options.length >= n;
  }, count);
}

async function openModal(page) {
  await page.click('[data-click-loadfolder]');
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await waitForHistoryOptions(page, 1);
}

async function switchToTxt(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
}

async function editContent(page, text) {
  await page.evaluate((content) => {
    const pre = document.querySelector('#modal-content-text pre');
    pre.textContent = content;
    pre.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

async function clickSaveBtn(page) {
  await page.evaluate(() => document.getElementById('save-btn').click());
}

// ─── appState.myFiles ─────────────────────────────────────────────────────────

test.describe('appState.myFiles is updated after manual save', () => {

  test('title is updated after saving with a new title', async ({ page }) => {
    await setupWithContent(page, '# Original Title\nContent here');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# Updated Title\nContent here');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    const title = await page.evaluate(() =>
      window.appState.myFiles.find(f => f.filename === 'notes.md')?.title
    );
    expect(title).toBe('Updated Title');
  });

  test('tags Map gains a new entry after adding a tag', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent here');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# My Notes\nContent here #freshtag');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    const hasTag = await page.evaluate(() => {
      const file = window.appState.myFiles.find(f => f.filename === 'notes.md');
      return file?.tags instanceof Map && file.tags.has('freshtag');
    });
    expect(hasTag).toBe(true);
  });

  test('tags Map loses an entry after removing a tag', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent #removeme');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# My Notes\nContent');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    const hasTag = await page.evaluate(() => {
      const file = window.appState.myFiles.find(f => f.filename === 'notes.md');
      return file?.tags instanceof Map && file.tags.has('removeme');
    });
    expect(hasTag).toBe(false);
  });

  test('YAML property is updated after editing frontmatter', async ({ page }) => {
    await setupWithContent(page, '---\ndate: 2024-01-01\n---\n# My Notes\nContent');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '---\ndate: 2025-06-15\n---\n# My Notes\nContent');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    const dateVal = await page.evaluate(() =>
      window.appState.myFiles.find(f => f.filename === 'notes.md')?.date
    );
    expect(String(dateVal)).toContain('2025');
  });

  test('file object identity (id and filepath) is preserved after refresh', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    const before = await page.evaluate(() => {
      const f = window.appState.myFiles.find(f => f.filename === 'notes.md');
      return { id: f.id, filepath: f.filepath };
    });

    await editContent(page, '# My Notes\nContent edited');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const f = window.appState.myFiles.find(f => f.filename === 'notes.md');
      return { id: f.id, filepath: f.filepath };
    });

    expect(after.id).toBe(before.id);
    expect(after.filepath).toBe(before.filepath);
  });

});

// ─── appState.myParentMap ─────────────────────────────────────────────────────

test.describe('appState.myParentMap is rebuilt after manual save', () => {

  test('new orphan tag appears in myParentMap[all] after save', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# My Notes\nContent #brandnewtag');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    const inMap = await page.evaluate(() =>
      window.appState.myParentMap.get('all')?.has('brandnewtag') ?? false
    );
    expect(inMap).toBe(true);
  });

  test('removed tag disappears from myParentMap[all] after save', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent #uniquetag');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# My Notes\nContent');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    const inMap = await page.evaluate(() =>
      window.appState.myParentMap.get('all')?.has('uniquetag') ?? false
    );
    expect(inMap).toBe(false);
  });

  test('new hierarchical tag creates its parent key in myParentMap after save', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# My Notes\nContent #newparent/newchild');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    const parentExists = await page.evaluate(() =>
      window.appState.myParentMap.has('newparent')
    );
    expect(parentExists).toBe(true);
  });

  test('orphan tag moves under its parent after save adds a parent', async ({ page }) => {
    await setupWithContent(page, '# My Notes\n#childtag');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# My Notes\n#parenttag/childtag');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const pm = window.appState.myParentMap;
      return {
        hasParent: pm.has('parenttag'),
        childUnderParent: pm.get('parenttag')?.has('childtag') ?? false,
        notOrphan: !(pm.get('orphan')?.has('childtag') ?? false),
      };
    });
    expect(result.hasParent).toBe(true);
    expect(result.childUnderParent).toBe(true);
    expect(result.notOrphan).toBe(true);
  });

});

// ─── UI: file list ────────────────────────────────────────────────────────────

test.describe('file list re-renders after manual save', () => {

  test('card shows updated title after save', async ({ page }) => {
    await setupWithContent(page, '# Old Title\nContent');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# New Title\nContent');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    await expect(page.locator('.note-grid').first()).toContainText('New Title');
  });

});

// ─── UI: tag taxonomy ─────────────────────────────────────────────────────────

test.describe('tag taxonomy re-renders after manual save', () => {

  test('new tag appears in the taxonomy sidebar after save', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# My Notes\nContent #addedtag');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    await expect(page.locator('#tag_output [data-tag="addedtag"]')).toBeAttached();
  });

  test('removed tag disappears from the taxonomy sidebar after save', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent #gonetag');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# My Notes\nContent');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    await expect(page.locator('#tag_output [data-tag="gonetag"]')).not.toBeAttached();
  });

  test('tag taxonomy is unchanged when only body text is edited (no tag change)', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent #stabletag');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);

    // Capture initial taxonomy HTML
    const before = await page.evaluate(() =>
      document.getElementById('tag_output').innerHTML
    );

    // Edit body text only — tags unchanged
    await editContent(page, '# My Notes\nDifferent body text but same #stabletag');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    const after = await page.evaluate(() =>
      document.getElementById('tag_output').innerHTML
    );
    expect(after).toBe(before);
  });

});

// ─── Active search filters ────────────────────────────────────────────────────

test.describe('active search filters are re-run after manual save', () => {

  test('file disappears from filtered results after saving removes the matching tag', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent #searchtag');
    await page.goto('/');

    // Load files and apply a filter for the tag
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid')).toHaveCount(1);
    await page.click('details.taxon summary:has(code:text("orphan"))');
    await page.click('[data-action="tag-filter"][data-tag="searchtag"]');
    await expect(page.locator('.note-grid')).toHaveCount(1);

    // Open the file, remove the tag, save
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForHistoryOptions(page, 1);
    await switchToTxt(page);
    await editContent(page, '# My Notes\nContent');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    // After refresh, the file no longer matches the filter
    const matchingCount = await page.evaluate(() =>
      window.appState.search.matchingFiles.size
    );
    expect(matchingCount).toBe(0);
  });

  test('file still matches active filter after saving unrelated body text', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent #searchtag');
    await page.goto('/');

    // Load files and apply a filter — file matches
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid')).toHaveCount(1);
    await page.click('details.taxon summary:has(code:text("orphan"))');
    await page.click('[data-action="tag-filter"][data-tag="searchtag"]');
    await expect(page.locator('.note-grid')).toHaveCount(1);

    // Open the file, edit body text only (tag unchanged), save
    await page.locator('.note-grid').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await waitForHistoryOptions(page, 1);
    await switchToTxt(page);
    await editContent(page, '# My Notes\nDifferent body but still has #searchtag');
    await clickSaveBtn(page);
    await page.waitForTimeout(500);

    // Filter was automatically re-run — file still matches
    const matchingCount = await page.evaluate(() =>
      window.appState.search.matchingFiles.size
    );
    expect(matchingCount).toBe(1);
  });

});
