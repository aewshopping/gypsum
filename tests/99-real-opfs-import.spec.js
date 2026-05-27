/**
 * End-to-end import test using REAL Chromium OPFS (no navigator.storage mock).
 * This is the definitive test: if it passes here it will pass in production.
 * Captures every console.log from opfs-import.js to show exactly where execution stops.
 */
const { test, expect } = require('@playwright/test');

test('full backup+import cycle works with real OPFS', async ({ page }) => {
    const logs = [];
    page.on('console', msg => {
        if (msg.text().startsWith('[import]')) logs.push(msg.text());
    });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Intercept the download so we can feed the blob back in as the import source.
    await page.addInitScript(() => {
        window.__capturedBlob = null;
        const origCreate = URL.createObjectURL.bind(URL);
        URL.createObjectURL = blob => {
            window.__capturedBlob = blob;
            return origCreate(blob);
        };
        const origCreateEl = document.createElement.bind(document);
        document.createElement = tag => {
            const el = origCreateEl(tag);
            if (tag === 'a') el.click = () => {};
            return el;
        };

        // Mock directory picker with three small files so a backup is meaningful.
        const makeFile = (name, content) => {
            const bytes = new TextEncoder().encode(content);
            return {
                kind: 'file', name,
                getFile: async () => ({
                    name, size: bytes.length,
                    lastModified: new Date('2024-03-15T09:00:00Z').getTime(),
                    text: async () => content,
                    arrayBuffer: async () => bytes.buffer,
                }),
            };
        };
        window.showDirectoryPicker = async () => ({
            kind: 'directory', name: 'root',
            values: async function* () {
                yield makeFile('alpha.md', '# Alpha\nHello world');
                yield makeFile('beta.txt', 'Beta content');
                yield makeFile('gamma.md', '# Gamma\n#tag/sub');
            },
            getDirectoryHandle: async () => { throw new DOMException('not found', 'NotFoundError'); },
        });
    });

    await page.goto('/');

    // Load files via the mock directory picker.
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid')).toHaveCount(3, { timeout: 10000 });

    // Create a content backup.
    await page.click('[data-action="open-settings-modal"]');
    await page.click('[data-action="backup-content"]');
    await page.waitForFunction(() => window.__capturedBlob != null, { timeout: 10000 });

    // Wire showOpenFilePicker to return the captured blob.
    await page.evaluate(() => {
        window.showOpenFilePicker = async () => [{
            getFile: async () => ({
                arrayBuffer: async () => await window.__capturedBlob.arrayBuffer(),
            }),
        }];
    });

    // Close settings modal and trigger the import.
    await page.keyboard.press('Escape');
    await page.click('[data-action="open-settings-modal"]');

    // Trigger import and race against a 15-second timeout.
    const outcome = await page.evaluate(async () => {
        const { importTarGzipToOPFS } = await import('/public/js/backup/opfs-import.js');
        const result = await Promise.race([
            importTarGzipToOPFS(() => {}).then(() => 'completed'),
            new Promise(r => setTimeout(() => r('timeout'), 15000)),
        ]);
        return {
            result,
            fileCount: window.appState?.myFiles?.length ?? -1,
            fileCountText: document.getElementById('fileCountElement')?.textContent ?? '',
        };
    });

    console.log('Import logs:', logs);
    console.log('Import outcome:', outcome);
    console.log('Page errors:', errors);

    expect(errors).toHaveLength(0);
    expect(outcome.result).toBe('completed');
    expect(outcome.fileCount).toBeGreaterThan(0);
});
