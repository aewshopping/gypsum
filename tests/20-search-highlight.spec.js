const { test, expect } = require('@playwright/test');
const { setupMockFiles, setupMockDirectoryWithHistoryLinePool, loadFolder, showFilenames } = require('./helpers');

// Verifies that every Range in the 'match' CSS highlight points to a live DOM
// node. Stale ranges (produced when highlighted nodes are removed from the DOM
// without rebuilding the highlight) would have startContainer.isConnected === false.
async function allMatchRangesConnected(page) {
    return page.evaluate(() => {
        const h = CSS.highlights.get('match');
        if (!h) return true;
        return [...h].every(r => r.startContainer.isConnected);
    });
}

async function waitForHistoryOptions(page, count) {
    await page.waitForFunction((n) => {
        const sel = document.getElementById('file-content-history-select');
        return sel && sel.options.length >= n;
    }, count);
}

test.describe('search highlight (match) lifecycle', () => {

    test('the highlight survives opening a note and toggling render mode', async ({ page }) => {
        await setupMockFiles(page);
        await page.goto('/');
        await loadFolder(page);
        await expect(page.locator('.note-grid')).toHaveCount(3);
        // 'meeting' only appears in the filename, which only the cards view renders
        await showFilenames(page);

        await page.fill('#searchbox', 'meeting');
        await page.press('#searchbox', 'Enter');
        await expect(page.locator('.note-grid')).toHaveCount(1);

        expect(await page.evaluate(() => CSS.highlights.has('match'))).toBe(true);

        await page.locator('.note-grid').first().click();
        await expect(page.locator('#file-content-modal')).toBeVisible();
        expect(await allMatchRangesConnected(page)).toBe(true);

        // Toggle to text mode (checkbox is styled invisible; click via JS like other tests do)
        await page.evaluate(() => document.getElementById('render_toggle').click());
        await expect(page.locator('#modal-content-text pre')).toBeVisible();
        expect(await allMatchRangesConnected(page)).toBe(true);

        await page.evaluate(() => document.getElementById('render_toggle').click());
        await expect(page.locator('#modal-content-text pre')).not.toBeVisible();
        expect(await allMatchRangesConnected(page)).toBe(true);
    });

    test('the highlight survives history navigation', async ({ page }) => {
        await setupMockDirectoryWithHistoryLinePool(page);
        await page.goto('/');
        await loadFolder(page);
        await expect(page.locator('.note-grid')).toHaveCount(1);

        await page.fill('#searchbox', 'notes');
        await page.press('#searchbox', 'Enter');

        await page.locator('.note-grid').first().click();
        await expect(page.locator('#file-content-modal')).toBeVisible();
        await waitForHistoryOptions(page, 3);

        expect(await allMatchRangesConnected(page)).toBe(true);

        // Navigate to historical version — modal content is re-rendered
        await page.selectOption('#file-content-history-select', { index: 2 });
        expect(await allMatchRangesConnected(page)).toBe(true);

        // Navigate back to current version — another re-render
        await page.selectOption('#file-content-history-select', { value: 'current' });
        expect(await allMatchRangesConnected(page)).toBe(true);
    });

});
