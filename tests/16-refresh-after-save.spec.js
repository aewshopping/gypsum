const { test, expect } = require('@playwright/test');

/**
 * Tests for refreshFileAfterSave.
 *
 * The feature: after a successful manual save, appState is re-parsed from disk
 * and the UI (file list + tag taxonomy) is re-rendered in the background. The
 * The save completes first; the refresh runs fire-and-forget in the background.
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
    await page.waitForTimeout(150);

    const title = await page.evaluate(() =>
      window.appState.myFiles.find(f => f.filename === 'notes.md')?.title
    );
    expect(title).toBe('Updated Title');
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
    await page.waitForTimeout(150);

    const inMap = await page.evaluate(() =>
      window.appState.myParentMap.get('all')?.has('brandnewtag') ?? false
    );
    expect(inMap).toBe(true);
  });

});

// ─── UI: modal color ──────────────────────────────────────────────────────────

test.describe('modal color updates after manual save', () => {

  test('modal header and content data-color update when color tag is added', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent');
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# My Notes\nContent #color/coral');
    await clickSaveBtn(page);
    await page.waitForTimeout(150);

    const colors = await page.evaluate(() => ({
      header: document.getElementById('file-content-header').dataset.color,
      content: document.getElementById('modal-content').dataset.color,
    }));
    expect(colors.header).toBe('coral');
    expect(colors.content).toBe('coral');
  });

});

// ─── UI: tag taxonomy ─────────────────────────────────────────────────────────

test.describe('tag taxonomy re-renders after manual save', () => {

  test('new tag appears in the taxonomy sidebar after save', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent');
    await page.goto('/');
    await page.click('[data-action="render-tag-taxonomy"]');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page, '# My Notes\nContent #addedtag');
    await clickSaveBtn(page);
    await page.waitForTimeout(150);

    await expect(page.locator('#tag_output [data-tag="addedtag"]').first()).toBeAttached();
  });

});

// ─── Active search filters ────────────────────────────────────────────────────

test.describe('active search filters are re-run after manual save', () => {

  test('file disappears from filtered results after saving removes the matching tag', async ({ page }) => {
    await setupWithContent(page, '# My Notes\nContent #searchtag');
    await page.goto('/');

    // Load files, show taxonomy, and apply a filter for the tag
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid')).toHaveCount(1);
    await page.click('[data-action="render-tag-taxonomy"]');
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
    await page.waitForTimeout(150);

    // After refresh, the file no longer matches the filter
    const matchingCount = await page.evaluate(() =>
      window.appState.search.matchingFiles.size
    );
    expect(matchingCount).toBe(0);
  });

});
