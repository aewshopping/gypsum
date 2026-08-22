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

// Records whether #btn-new-note ever carries the transition-name class. The class can be
// added and removed inside a single tick when transitions run fast, so polling the live DOM
// misses it — watch for the mutation instead.
async function watchNewNoteTransitionClass(page) {
  await page.evaluate(() => {
    const btn = document.getElementById('btn-new-note');
    window.__btnGotTransitionClass = btn.classList.contains('moving-file-content-view');
    new MutationObserver(() => {
      if (btn.classList.contains('moving-file-content-view')) window.__btnGotTransitionClass = true;
    }).observe(btn, { attributes: true, attributeFilter: ['class'] });
  });
}

// Shrinks the page to one card so a link target is absent from the file list, leaving
// nothing for the modal to animate out of except the new-note button.
async function shrinkToOnePage(page) {
  await page.evaluate(async () => {
    const { setPaginationSize } = await import('/public/js/constants.js');
    const { renderFiles } = await import('/public/js/ui/ui-functions-render/a-render-all-files.js');
    setPaginationSize(1);
    renderFiles();
  });
  await expect(page.locator('.note-grid')).toHaveCount(1);
}

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
    await shrinkToOnePage(page);
    await page.locator('a.internal-link[data-link-target="subdir/nested.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await expect(page.locator('#modal-content-text')).toContainText('The nested target');
  });

  test('opening a card-less note leaves no transition name on the new-note button', async ({ page }) => {
    // Two elements sharing view-transition-name silently break the NEXT transition,
    // so the class must be stripped once the open transition settles.
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await shrinkToOnePage(page);
    await page.locator('a.internal-link[data-link-target="subdir/nested.md"]').click();
    await expect(page.locator('#modal-content-text')).toContainText('The nested target');
    await expect(page.locator('#btn-new-note')).not.toHaveClass(/moving-file-content-view/);
  });

  test('closing a card-less note animates back into the new-note button', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await shrinkToOnePage(page);
    await page.locator('a.internal-link[data-link-target="subdir/nested.md"]').click();
    await expect(page.locator('#modal-content-text')).toContainText('The nested target');

    await watchNewNoteTransitionClass(page);
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    expect(await page.evaluate(() => window.__btnGotTransitionClass)).toBe(true);
    await expect(page.locator('#btn-new-note')).not.toHaveClass(/moving-file-content-view/);
  });

  test('closing a card-less note does not park focus on the new-note button', async ({ page }) => {
    // Focus there would turn a stray Enter into a new note.
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await shrinkToOnePage(page);
    await page.locator('a.internal-link[data-link-target="subdir/nested.md"]').click();
    await expect(page.locator('#modal-content-text')).toContainText('The nested target');
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('btn-new-note');
  });

  test('closing returns focus to the card, keeping arrow-key navigation alive', async ({ page }) => {
    // handleKeyboardNavigate ignores keys unless activeElement is .keyboard-navigable, so
    // losing focus on close silently kills card navigation.
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid').first()).toBeVisible();

    const firstId = await page.locator('.note-grid').first().getAttribute('data-file-id');
    await page.locator('.note-grid').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    expect(await page.evaluate(() => document.activeElement?.dataset.fileId)).toBe(firstId);
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => document.activeElement?.dataset.fileId)).not.toBe(firstId);
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
