const { test, expect } = require('@playwright/test');
const { setupMockDirectoryWithHistory } = require('./helpers');

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

// The render toggle checkbox is visually hidden inside a CSS slider label.
// Use JS click to avoid Playwright's viewport/visibility checks.
async function switchToTxt(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
}

async function switchToHtml(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (t.checked) t.click();
  });
}

test.describe('contentEditable state in TXT mode', () => {

  test('pre is editable when viewing current version', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);

    await switchToTxt(page);

    const editable = await page.evaluate(() =>
      document.querySelector('#modal-content-text pre')?.contentEditable
    );
    expect(editable).toBe('plaintext-only');
  });

  test('pre is not editable when viewing a historical version', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    // on-open snapshot (v-1) + historical entry (v-2) = 3 total
    await waitForHistoryOptions(page, 3);

    await page.selectOption('#file-content-history-select', { index: 2 });
    await switchToTxt(page);

    const editable = await page.evaluate(() =>
      document.querySelector('#modal-content-text pre')?.contentEditable
    );
    expect(editable).toBe('false');
  });

  test('pre becomes editable again after returning to current', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);

    await page.selectOption('#file-content-history-select', { index: 2 });
    await switchToTxt(page);
    await page.selectOption('#file-content-history-select', { value: 'current' });

    const editable = await page.evaluate(() =>
      document.querySelector('#modal-content-text pre')?.contentEditable
    );
    expect(editable).toBe('plaintext-only');
  });

  test('edits in TXT mode survive a history round-trip (no HTML toggle)', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);

    await switchToTxt(page);
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      pre.textContent = 'my edited content';
      pre.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.selectOption('#file-content-history-select', { index: 2 });
    await expect(page.locator('#modal-content-text')).toContainText('Old content from yesterday');

    await page.selectOption('#file-content-history-select', { value: 'current' });

    const preText = await page.locator('#modal-content-text pre').textContent();
    expect(preText).toBe('my edited content');
  });

  test('edits synced via HTML toggle survive a history round-trip', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);

    await switchToTxt(page);
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      pre.textContent = 'my edited content';
      pre.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Toggle to HTML — this syncs file_content via handleToggleRenderText
    await switchToHtml(page);

    await page.selectOption('#file-content-history-select', { index: 2 });
    await expect(page.locator('#modal-content-text')).toContainText('Old content from yesterday');

    await page.selectOption('#file-content-history-select', { value: 'current' });
    await switchToTxt(page);

    const preText = await page.locator('#modal-content-text pre').textContent();
    expect(preText).toBe('my edited content');
  });

  test('newlines typed in TXT mode (browser <br> insertion) are preserved in HTML view', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);

    await switchToTxt(page);
    // Simulate pressing Enter in plaintext-only contenteditable — browser inserts \n, not <br>
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      pre.textContent = 'paragraph one\n\nparagraph two';
      pre.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await switchToHtml(page);

    // \n\n in the raw text is a markdown paragraph break → two separate <p> elements.
    const html = await page.locator('#modal-content-text').innerHTML();
    expect(html).toMatch(/<p>.*paragraph one.*<\/p>/s);
    expect(html).toMatch(/<p>.*paragraph two.*<\/p>/s);
  });

  test('toggling in history view does not pollute current_file_content', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await waitForHistoryOptions(page, 3);

    // Switch to history and toggle TXT→HTML
    await page.selectOption('#file-content-history-select', { index: 2 });
    await switchToTxt(page);
    await switchToHtml(page);

    // Return to current — should show original current content, not historical
    await page.selectOption('#file-content-history-select', { value: 'current' });
    await expect(page.locator('#modal-content-text')).toContainText('Current content today');
    await expect(page.locator('#modal-content-text')).not.toContainText('Old content from yesterday');
  });

});
