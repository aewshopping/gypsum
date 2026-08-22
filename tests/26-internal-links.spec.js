const { test, expect } = require('@playwright/test');
const { setupMockFilesWithLinks } = require('./helpers');

// setupMockFilesWithLinks: hub.md links to shopping.txt, subdir/nested.md, a missing
// file, and an extensionless name; plus fenced/inline-code links that must stay literal.

async function openHub(page) {
  await page.click('[data-click-loadfolder]');
  await expect(page.locator('.note-grid').first()).toBeVisible();
  await page.locator('.note-grid', { hasText: 'Hub' }).click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
}

async function openHubInTextMode(page) {
  await openHub(page);
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
}

test.describe('internal links — rendering', () => {

  test('a plain link renders as an anchor carrying the resolved file id', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    const link = page.locator('a.internal-link[data-link-target="shopping.txt"]').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveText('shopping.txt');
  });

  test('a path-qualified link resolves to the nested file', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await expect(page.locator('a.internal-link[data-link-target="subdir/nested.md"]')).toBeVisible();
  });

  test('an aliased link shows the alias but targets the file', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    const link = page.locator('a.internal-link', { hasText: 'groceries' });
    await expect(link).toHaveAttribute('data-link-target', 'shopping.txt');
  });

  test('a link to a missing file renders inert, with no anchor', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await expect(page.locator('span.internal-link[data-unresolved="true"]', { hasText: 'does-not-exist.md' })).toBeVisible();
    await expect(page.locator('a.internal-link', { hasText: 'does-not-exist.md' })).toHaveCount(0);
  });

  test('a name without its extension does not resolve', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    // 'shopping' must not fall back to shopping.txt — matching is exact apart from case.
    await expect(page.locator('span.internal-link[data-unresolved="true"]', { hasText: /^shopping$/ })).toBeVisible();
  });

  test('links inside code fences and inline code stay literal', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await expect(page.locator('#modal-content-text pre code')).toContainText('[[shopping.txt]]');
    await expect(page.locator('#modal-content-text p code')).toContainText('[[shopping.txt]]');
    // Only the four out-of-code links produced anchors (shopping, nested, alias).
    await expect(page.locator('#modal-content-text a.internal-link')).toHaveCount(3);
  });

});

test.describe('internal links — navigation', () => {

  test('clicking a link closes the current note and opens the linked one', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await page.locator('a.internal-link[data-link-target="shopping.txt"]').first().click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await expect(page.locator('#modal-content-text')).toContainText('Milk, eggs, bread');
    await expect(page.locator('#modal-content-text')).not.toContainText('A plain link to');
  });

  test('a link opens a note that has no card on screen', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    // Shrink the page so only one card is rendered; the link target is then absent
    // from the DOM and there is nothing to animate the modal out of.
    await page.evaluate(async () => {
      const { setPaginationSize } = await import('/public/js/constants.js');
      const { renderFiles } = await import('/public/js/ui/ui-functions-render/a-render-all-files.js');
      setPaginationSize(1);
      renderFiles();
    });
    await expect(page.locator('.note-grid')).toHaveCount(1);
    await page.locator('a.internal-link[data-link-target="subdir/nested.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await expect(page.locator('#modal-content-text')).toContainText('The nested target');
  });

  test('unsaved changes are warned about, and cancelling keeps the current note open', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHubInTextMode(page);
    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' dirty');
    await page.evaluate(() => {
      const t = document.getElementById('render_toggle');
      if (t.checked) t.click();
    });
    await page.locator('a.internal-link[data-link-target="shopping.txt"]').first().click();
    await expect(page.locator('#modal-unsaved-warning')).toBeVisible();
    await page.click('[data-action="warning-cancel"]');
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await expect(page.locator('#modal-content-text')).toContainText('A plain link to');
  });

});

test.describe('internal links — note picker', () => {

  test('typing [[ opens the picker listing filenames with extensions', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHubInTextMode(page);
    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type('\n[[');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await expect(page.locator('.tag-autocomplete-popup')).toContainText('shopping.txt');
  });

  test('selecting a note inserts a complete link with closing brackets', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHubInTextMode(page);
    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type('\n[[shop');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#modal-content-text pre')).toContainText('[[shopping.txt]]');
    await expect(page.locator('.tag-autocomplete-popup')).toHaveCount(0);
  });

  test('a query containing spaces still matches — the caret walk must not stop at a space', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHubInTextMode(page);
    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type('\n[[my long');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await expect(page.locator('.tag-autocomplete-popup')).toContainText('my long note.md');
  });

});
