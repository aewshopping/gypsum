const { test, expect } = require('@playwright/test');

/**
 * Intercepts URL.createObjectURL and the anchor click in the download trigger,
 * capturing the blob and intended filename without causing real navigation.
 * Must be called before page.goto().
 *
 * After a backup button is clicked, window.__capturedDownload will be:
 *   { blob: Blob, filename: string }
 */
async function interceptDownload(page) {
    await page.addInitScript(() => {
        window.__capturedDownload = null;

        const origCreateObjectURL = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => {
            const url = origCreateObjectURL(blob);
            window.__capturedDownload = { blob, filename: null };
            return url;
        };

        const origCreateElement = document.createElement.bind(document);
        document.createElement = (tag) => {
            const el = origCreateElement(tag);
            if (tag === 'a') {
                el.click = function () {
                    if (window.__capturedDownload) {
                        window.__capturedDownload.filename = el.download;
                    }
                };
            }
            return el;
        };
    });
}

/**
 * Mock directory with three content files (two at root, one in a subdir) and
 * two .gypsum files. Supports both content-only and full backup.
 *
 * Root structure:
 *   top-level.md
 *   notes.txt
 *   subdir/
 *     nested.md
 *   .gypsum/          (only reachable via getDirectoryHandle, not values())
 *     history.gypsum
 *     notes-save.gypsum
 */
async function setupMockDirectoryForBackup(page) {
    await page.addInitScript(() => {
        const makeFile = (name, content) => {
            const bytes = new TextEncoder().encode(content);
            return {
                kind: 'file', name,
                getFile: async () => ({
                    name,
                    size: bytes.length,
                    lastModified: Date.now(),
                    text: async () => content,
                    arrayBuffer: async () => bytes.buffer,
                }),
            };
        };

        const subdir = {
            kind: 'directory', name: 'subdir',
            values: async function* () {
                yield makeFile('nested.md', '# Nested\nNested content #work');
            },
        };

        const gypsumDir = {
            kind: 'directory', name: '.gypsum',
            values: async function* () {
                yield makeFile('history.gypsum', '{"lines":[],"snapshots":[]}');
                yield makeFile('notes-save.gypsum', 'autosaved content');
            },
        };

        window.showDirectoryPicker = async () => ({
            kind: 'directory', name: 'root',
            values: async function* () {
                yield makeFile('top-level.md', '# Top Level\nSome content');
                yield makeFile('notes.txt', 'Plain text notes');
                yield subdir;
            },
            getDirectoryHandle: async (name) => {
                if (name === '.gypsum') return gypsumDir;
                throw new DOMException(`${name} not found`, 'NotFoundError');
            },
        });
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('tar backup buttons', () => {

    test('both backup buttons are visible in the settings modal', async ({ page }) => {
        await page.goto('/');
        await page.click('[data-action="open-settings-modal"]');
        await expect(page.locator('[data-action="backup-content"]')).toBeVisible();
        await expect(page.locator('[data-action="backup-full"]')).toBeVisible();
    });

    test('content backup triggers download with correct filename pattern', async ({ page }) => {
        await interceptDownload(page);
        await setupMockDirectoryForBackup(page);

        await page.goto('/');
        await page.click('[data-click-loadfolder]');
        await expect(page.locator('.note-grid')).toHaveCount(3);

        await page.click('[data-action="open-settings-modal"]');
        await page.click('[data-action="backup-content"]');

        await page.waitForFunction(() => window.__capturedDownload?.filename != null);
        const filename = await page.evaluate(() => window.__capturedDownload.filename);

        expect(filename).toMatch(/^gypsum-content-\d{8}-\d{6}\.tar\.gz$/);
    });

    test('full backup triggers download with correct filename pattern', async ({ page }) => {
        await interceptDownload(page);
        await setupMockDirectoryForBackup(page);

        await page.goto('/');
        await page.click('[data-click-loadfolder]');

        await page.click('[data-action="open-settings-modal"]');
        await page.click('[data-action="backup-full"]');

        await page.waitForFunction(() => window.__capturedDownload?.filename != null);
        const filename = await page.evaluate(() => window.__capturedDownload.filename);

        expect(filename).toMatch(/^gypsum-full-\d{8}-\d{6}\.tar\.gz$/);
    });

    test('content backup archive contains only txt and md files', async ({ page }) => {
        await interceptDownload(page);
        await setupMockDirectoryForBackup(page);

        await page.goto('/');
        await page.click('[data-click-loadfolder]');

        await page.click('[data-action="open-settings-modal"]');
        await page.click('[data-action="backup-content"]');

        await page.waitForFunction(() => window.__capturedDownload?.filename != null);

        const entryNames = await page.evaluate(async () => {
            const { parseTarGzip } = await import('/public/js/backup/nanotar.js');
            const buf = await window.__capturedDownload.blob.arrayBuffer();
            const entries = await parseTarGzip(new Uint8Array(buf));
            return entries.map(e => e.name);
        });

        expect(entryNames).toContain('top-level.md');
        expect(entryNames).toContain('notes.txt');
        expect(entryNames).toContain('subdir/nested.md');
        expect(entryNames.every(n => !n.startsWith('.gypsum'))).toBe(true);
    });

    test('full backup archive contains txt/md files and .gypsum files', async ({ page }) => {
        await interceptDownload(page);
        await setupMockDirectoryForBackup(page);

        await page.goto('/');
        await page.click('[data-click-loadfolder]');

        await page.click('[data-action="open-settings-modal"]');
        await page.click('[data-action="backup-full"]');

        await page.waitForFunction(() => window.__capturedDownload?.filename != null);

        const entryNames = await page.evaluate(async () => {
            const { parseTarGzip } = await import('/public/js/backup/nanotar.js');
            const buf = await window.__capturedDownload.blob.arrayBuffer();
            const entries = await parseTarGzip(new Uint8Array(buf));
            return entries.map(e => e.name);
        });

        expect(entryNames).toContain('top-level.md');
        expect(entryNames).toContain('notes.txt');
        expect(entryNames).toContain('subdir/nested.md');
        expect(entryNames).toContain('.gypsum/history.gypsum');
        expect(entryNames).toContain('.gypsum/notes-save.gypsum');
    });

    test('full backup proceeds even when .gypsum folder does not exist', async ({ page }) => {
        await interceptDownload(page);
        await page.addInitScript(() => {
            const makeFile = (name, content) => {
                const bytes = new TextEncoder().encode(content);
                return {
                    kind: 'file', name,
                    getFile: async () => ({
                        name, size: bytes.length, lastModified: Date.now(),
                        text: async () => content,
                        arrayBuffer: async () => bytes.buffer,
                    }),
                };
            };
            window.showDirectoryPicker = async () => ({
                kind: 'directory', name: 'root',
                values: async function* () { yield makeFile('notes.md', '# Notes'); },
                getDirectoryHandle: async () => {
                    throw new DOMException('not found', 'NotFoundError');
                },
            });
        });

        await page.goto('/');
        await page.click('[data-click-loadfolder]');

        await page.click('[data-action="open-settings-modal"]');
        await page.click('[data-action="backup-full"]');

        await page.waitForFunction(() => window.__capturedDownload?.filename != null);
        const filename = await page.evaluate(() => window.__capturedDownload.filename);

        expect(filename).toMatch(/^gypsum-full-\d{8}-\d{6}\.tar\.gz$/);

        // Archive should contain the content file even without .gypsum
        const entryNames = await page.evaluate(async () => {
            const { parseTarGzip } = await import('/public/js/backup/nanotar.js');
            const buf = await window.__capturedDownload.blob.arrayBuffer();
            const entries = await parseTarGzip(new Uint8Array(buf));
            return entries.map(e => e.name);
        });
        expect(entryNames).toContain('notes.md');
    });

    test('backup buttons do nothing when no folder is loaded', async ({ page }) => {
        await page.addInitScript(() => {
            window.__downloadTriggered = false;
            const origCreateObjectURL = URL.createObjectURL.bind(URL);
            URL.createObjectURL = (blob) => {
                window.__downloadTriggered = true;
                return origCreateObjectURL(blob);
            };
        });

        await page.goto('/');
        // No folder loaded — open settings and try backup directly
        await page.click('[data-action="open-settings-modal"]');
        await page.click('[data-action="backup-content"]');
        await page.waitForTimeout(500);

        const triggered = await page.evaluate(() => window.__downloadTriggered);
        expect(triggered).toBe(false);
    });

});
