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

    test('backup tar entries carry the original lastModified timestamp', async ({ page }) => {
        const FIXED_MTIME = new Date('2024-01-15T10:00:00Z').getTime();

        await interceptDownload(page);
        await page.addInitScript((fixedMtime) => {
            const makeFile = (name, content) => {
                const bytes = new TextEncoder().encode(content);
                return {
                    kind: 'file', name,
                    getFile: async () => ({
                        name,
                        size: bytes.length,
                        lastModified: fixedMtime,
                        text: async () => content,
                        arrayBuffer: async () => bytes.buffer,
                    }),
                };
            };
            window.showDirectoryPicker = async () => ({
                kind: 'directory', name: 'root',
                values: async function* () {
                    yield makeFile('notes.txt', 'Fixed mtime note');
                },
                getDirectoryHandle: async () => { throw new DOMException('not found', 'NotFoundError'); },
            });
        }, FIXED_MTIME);

        await page.goto('/');
        await page.click('[data-click-loadfolder]');
        await page.click('[data-action="open-settings-modal"]');
        await page.click('[data-action="backup-content"]');
        await page.waitForFunction(() => window.__capturedDownload?.filename != null);

        const storedMtimeSec = await page.evaluate(async () => {
            const { parseTarGzip } = await import('/public/js/backup/nanotar.js');
            const buf = await window.__capturedDownload.blob.arrayBuffer();
            const entries = await parseTarGzip(new Uint8Array(buf));
            return entries.find(e => e.name === 'notes.txt')?.attrs?.mtime;
        });

        // nanotar writes mtime in seconds (truncated from ms), so allow ±1s rounding
        expect(storedMtimeSec * 1000).toBeCloseTo(FIXED_MTIME, -3);
    });

    test('mtime.json is written to OPFS during import with correct timestamps', async ({ page }) => {
        const FIXED_MTIME = new Date('2023-06-20T08:30:00Z').getTime();

        await interceptDownload(page);

        // Both the directory picker mock and the OPFS mock must be in addInitScript
        // so they are present from the very start of the page load.
        await page.addInitScript((fixedMtime) => {
            const makeFile = (name, content) => {
                const bytes = new TextEncoder().encode(content);
                return {
                    kind: 'file', name,
                    getFile: async () => ({
                        name, size: bytes.length, lastModified: fixedMtime,
                        text: async () => content,
                        arrayBuffer: async () => bytes.buffer,
                    }),
                };
            };
            window.showDirectoryPicker = async () => ({
                kind: 'directory', name: 'root',
                values: async function* () { yield makeFile('article.md', '# Article\nContent'); },
                getDirectoryHandle: async () => { throw new DOMException('not found', 'NotFoundError'); },
            });

            // OPFS mock — flat map records all written files keyed by full path
            const opfsFiles = {};
            window.__opfsFiles = opfsFiles;

            function makeWritable(path) {
                let content = '';
                return {
                    write: async (data) => { content += typeof data === 'string' ? data : new TextDecoder().decode(data); },
                    close: async () => { opfsFiles[path] = content; },
                };
            }

            function makeDirHandle(prefix) {
                return {
                    keys: async function* () {},
                    // values() enumerates files written at this prefix level so getFilesRecursive works
                    values: async function* () {
                        for (const path of Object.keys(opfsFiles)) {
                            if (!path.startsWith(prefix)) continue;
                            const rel = path.slice(prefix.length);
                            if (rel.includes('/')) continue;
                            if (!rel.endsWith('.md') && !rel.endsWith('.txt')) continue;
                            const text = opfsFiles[path];
                            yield {
                                kind: 'file', name: rel,
                                getFile: async () => ({
                                    name: rel, lastModified: fixedMtime,
                                    text: async () => text,
                                    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
                                }),
                            };
                        }
                    },
                    removeEntry: async () => {},
                    getDirectoryHandle: async (name) => makeDirHandle(`${prefix}${name}/`),
                    getFileHandle: async (name) => ({
                        createWritable: async () => makeWritable(`${prefix}${name}`),
                        getFile: async () => {
                            const text = opfsFiles[`${prefix}${name}`];
                            if (text === undefined) throw new DOMException('not found', 'NotFoundError');
                            return { text: async () => text, lastModified: fixedMtime, arrayBuffer: async () => new TextEncoder().encode(text).buffer };
                        },
                    }),
                };
            }
            navigator.storage.getDirectory = async () => makeDirHandle('');
        }, FIXED_MTIME);

        await page.goto('/');
        await page.click('[data-click-loadfolder]');
        await page.click('[data-action="open-settings-modal"]');
        await page.click('[data-action="backup-content"]');
        await page.waitForFunction(() => window.__capturedDownload?.filename != null);

        const mtimeJson = await page.evaluate(async () => {
            const tarBytes = new Uint8Array(await window.__capturedDownload.blob.arrayBuffer());
            window.showOpenFilePicker = async () => [{ getFile: async () => ({ arrayBuffer: async () => tarBytes.buffer }) }];

            const { importTarGzipToOPFS } = await import('/public/js/backup/opfs-import.js');
            await importTarGzipToOPFS(() => {});

            return window.__opfsFiles['.gypsum/mtime.json'] ?? null;
        });

        expect(mtimeJson).not.toBeNull();
        const parsed = JSON.parse(mtimeJson);
        expect(parsed['article.md']).toBeCloseTo(FIXED_MTIME, -3);
    });

    test('import applies original mtime without re-reading mtime.json from OPFS', async ({ page }) => {
        const FIXED_MTIME = new Date('2024-01-15T10:00:00Z').getTime();
        const IMPORT_TIME = new Date('2026-01-01T00:00:00Z').getTime();

        await interceptDownload(page);

        await page.addInitScript(([fixedMtime, importTime]) => {
            const makeFile = (name, content) => {
                const bytes = new TextEncoder().encode(content);
                return {
                    kind: 'file', name,
                    getFile: async () => ({
                        name, size: bytes.length, lastModified: fixedMtime,
                        text: async () => content,
                        arrayBuffer: async () => bytes.buffer,
                    }),
                };
            };
            window.showDirectoryPicker = async () => ({
                kind: 'directory', name: 'root',
                values: async function* () { yield makeFile('article.md', '# Article\nContent'); },
                getDirectoryHandle: async () => { throw new DOMException('not found', 'NotFoundError'); },
            });

            const opfsFiles = {};

            function makeWritable(path) {
                let content = '';
                return {
                    write: async (data) => { content += typeof data === 'string' ? data : new TextDecoder().decode(data); },
                    close: async () => { opfsFiles[path] = content; },
                };
            }

            function makeDirHandle(prefix) {
                return {
                    keys: async function* () {},
                    values: async function* () {
                        for (const path of Object.keys(opfsFiles)) {
                            if (!path.startsWith(prefix)) continue;
                            const rel = path.slice(prefix.length);
                            if (rel.includes('/')) continue;
                            if (!rel.endsWith('.md') && !rel.endsWith('.txt')) continue;
                            const text = opfsFiles[path];
                            yield {
                                kind: 'file', name: rel,
                                getFile: async () => ({
                                    name: rel, lastModified: importTime,
                                    text: async () => text,
                                    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
                                }),
                            };
                        }
                    },
                    removeEntry: async () => {},
                    getDirectoryHandle: async (name, options) => {
                        // Simulate real OPFS behaviour: getDirectoryHandle('.gypsum', {create:true})
                        // can hang indefinitely in Chromium after writeFilesToOPFS has run.
                        if (name === '.gypsum' && options?.create) {
                            return new Promise(() => {}); // never resolves — mirrors the real freeze
                        }
                        return makeDirHandle(`${prefix}${name}/`);
                    },
                    getFileHandle: async (name) => ({
                        createWritable: async () => makeWritable(`${prefix}${name}`),
                        getFile: async () => {
                            const text = opfsFiles[`${prefix}${name}`];
                            if (text === undefined) throw new DOMException('not found', 'NotFoundError');
                            return { text: async () => text, lastModified: importTime, arrayBuffer: async () => new TextEncoder().encode(text).buffer };
                        },
                    }),
                };
            }
            navigator.storage.getDirectory = async () => makeDirHandle('');
        }, [FIXED_MTIME, IMPORT_TIME]);

        await page.goto('/');
        await page.click('[data-click-loadfolder]');
        await page.click('[data-action="open-settings-modal"]');
        await page.click('[data-action="backup-content"]');
        await page.waitForFunction(() => window.__capturedDownload?.filename != null);

        const outcome = await page.evaluate(async () => {
            const tarBytes = new Uint8Array(await window.__capturedDownload.blob.arrayBuffer());
            window.showOpenFilePicker = async () => [{ getFile: async () => ({ arrayBuffer: async () => tarBytes.buffer }) }];

            const { importTarGzipToOPFS } = await import('/public/js/backup/opfs-import.js');

            // Race the import against a 5-second timeout to detect a hang.
            const result = await Promise.race([
                importTarGzipToOPFS(() => {}).then(() => 'completed'),
                new Promise(r => setTimeout(() => r('timeout'), 5000)),
            ]);

            return {
                result,
                lastModified: window.appState?.myFiles?.[0]?.lastModified?.getTime?.() ?? null,
            };
        });

        // Import must complete (not hang) — this fails before the fire-and-forget fix
        expect(outcome.result).toBe('completed');
        // Must use mtime from tar entry (FIXED_MTIME), not the OPFS file time (IMPORT_TIME)
        expect(outcome.lastModified).toBeCloseTo(FIXED_MTIME, -3);
    });

});
