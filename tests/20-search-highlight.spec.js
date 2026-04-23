const { test, expect } = require('@playwright/test');
const { setupMockFiles, setupMockDirectoryWithHistoryLinePool, setupMockDirectoryWithSaveSupport } = require('./helpers');

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

    test('search creates a match highlight in the file list', async ({ page }) => {
        await setupMockFiles(page);
        await page.goto('/');
        await page.click('[data-click-loadfiles]');
        await expect(page.locator('.note-grid')).toHaveCount(3);

        await page.fill('#searchbox', 'meeting');
        await page.click('#btn_search');
        await expect(page.locator('.note-grid')).toHaveCount(1);

        const hasMatch = await page.evaluate(() => CSS.highlights.has('match'));
        expect(hasMatch).toBe(true);
    });

    test('match highlight has connected ranges after opening the modal', async ({ page }) => {
        await setupMockFiles(page);
        await page.goto('/');
        await page.click('[data-click-loadfiles]');
        await expect(page.locator('.note-grid')).toHaveCount(3);

        await page.fill('#searchbox', 'meeting');
        await page.click('#btn_search');
        await expect(page.locator('.note-grid')).toHaveCount(1);

        await page.locator('.note-grid').first().click();
        await expect(page.locator('#file-content-modal')).toBeVisible();

        expect(await allMatchRangesConnected(page)).toBe(true);
    });

    test('match highlight has connected ranges after toggling render mode', async ({ page }) => {
        await setupMockFiles(page);
        await page.goto('/');
        await page.click('[data-click-loadfiles]');
        await expect(page.locator('.note-grid')).toHaveCount(3);

        await page.fill('#searchbox', 'meeting');
        await page.click('#btn_search');
        await expect(page.locator('.note-grid')).toHaveCount(1);

        await page.locator('.note-grid').first().click();
        await expect(page.locator('#file-content-modal')).toBeVisible();

        // Toggle to text mode (checkbox is styled invisible; click via JS like other tests do)
        await page.evaluate(() => document.getElementById('render_toggle').click());
        await expect(page.locator('#modal-content-text pre')).toBeVisible();
        expect(await allMatchRangesConnected(page)).toBe(true);

        // Toggle back to HTML mode
        await page.evaluate(() => document.getElementById('render_toggle').click());
        await expect(page.locator('#modal-content-text pre')).not.toBeVisible();
        expect(await allMatchRangesConnected(page)).toBe(true);
    });

    test('match highlight has connected ranges after closing the modal', async ({ page }) => {
        await setupMockFiles(page);
        await page.goto('/');
        await page.click('[data-click-loadfiles]');
        await expect(page.locator('.note-grid')).toHaveCount(3);

        await page.fill('#searchbox', 'meeting');
        await page.click('#btn_search');
        await expect(page.locator('.note-grid')).toHaveCount(1);

        await page.locator('.note-grid').first().click();
        await expect(page.locator('#file-content-modal')).toBeVisible();

        await page.click('#modal-close-btn');
        await expect(page.locator('#file-content-modal')).not.toBeVisible();

        // After close, no stale ranges should remain from the cleared modal content.
        expect(await allMatchRangesConnected(page)).toBe(true);
    });

    test('contentEditable keystrokes do not trigger the highlight observer', async ({ page }) => {
        await setupMockDirectoryWithSaveSupport(page);
        await page.goto('/');
        await page.click('[data-click-loadfolder]');
        await expect(page.locator('.note-grid')).toHaveCount(1);

        await page.fill('#searchbox', 'notes');
        await page.click('#btn_search');

        await page.locator('.note-grid').first().click();
        await expect(page.locator('#file-content-modal')).toBeVisible();

        // Switch to text mode so the contentEditable <pre> is in the DOM.
        await page.evaluate(() => document.getElementById('render_toggle').click());
        await expect(page.locator('.text-editor')).toBeVisible();

        // Drain microtasks from the mode-toggle render before installing the spy,
        // so the toggle's own highlight rebuild does not pollute the count.
        await page.evaluate(() => new Promise(r => setTimeout(r, 50)));

        // Spy: CSS.highlights.delete('match') is called unconditionally at the
        // start of every highlightPropMatches() run, making it a reliable proxy
        // for "did the observer fire and dispatch a highlight rebuild?".
        await page.evaluate(() => {
            window.__matchHighlightClears = 0;
            const orig = CSS.highlights.delete.bind(CSS.highlights);
            CSS.highlights.delete = (name) => {
                if (name === 'match') window.__matchHighlightClears++;
                return orig(name);
            };
        });

        // Press Enter in the text editor. This creates a <br> inside the
        // contentEditable <pre> — a childList mutation whose target IS the <pre>
        // element itself. The observer should reject this batch because every
        // mutation record passes m.target.closest('[contenteditable]').
        await page.locator('.text-editor').press('End');
        await page.locator('.text-editor').press('Enter');
        await page.evaluate(() => new Promise(r => setTimeout(r, 50)));
        expect(await page.evaluate(() => window.__matchHighlightClears)).toBe(0);

        // Confirm the spy is working: toggling render mode re-renders
        // #modal-content-text (a non-editable parent), which the observer does
        // NOT filter out. Count should advance from 0 to 1.
        await page.evaluate(() => document.getElementById('render_toggle').click());
        await page.evaluate(() => new Promise(r => setTimeout(r, 50)));
        expect(await page.evaluate(() => window.__matchHighlightClears)).toBe(1);
    });

    test('match highlight has connected ranges after history navigation', async ({ page }) => {
        await setupMockDirectoryWithHistoryLinePool(page);
        await page.goto('/');
        await page.click('[data-click-loadfolder]');
        await expect(page.locator('.note-grid')).toHaveCount(1);

        await page.fill('#searchbox', 'notes');
        await page.click('#btn_search');

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
