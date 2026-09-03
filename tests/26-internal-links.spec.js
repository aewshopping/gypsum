const { test, expect } = require('@playwright/test');
const { setupMockFilesWithLinks, loadFolder } = require('./helpers');

// setupMockFilesWithLinks: hub.md links to shopping.txt, subdir/nested.md, a missing
// file, and an extensionless name; plus fenced/inline-code links that must stay literal.
// extensionless.md carries the path-qualified, aliased and .txt-vs-.md extensionless cases.

async function openHub(page) {
  await loadFolder(page);
  await expect(page.locator('.note-grid').first()).toBeVisible();
  await page.locator('.note-grid', { hasText: 'Hub' }).click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
}

async function openExtensionless(page) {
  await loadFolder(page);
  await expect(page.locator('.note-grid').first()).toBeVisible();
  await page.locator('.note-grid[data-file-id="extensionless.md"]').click();
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

/** Types at the end of the editor, then reads back what the picker offers. */
async function typeAtEnd(page, text) {
  await page.locator('#modal-content-text pre').click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
}

test.describe('internal links — rendering', () => {

  test('plain, path-qualified, aliased and missing links each render correctly', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);

    const plain = page.locator('a.internal-link[data-link-target="shopping.txt"]').first();
    await expect(plain).toBeVisible();
    await expect(plain).toHaveText('shopping.txt');

    await expect(page.locator('a.internal-link[data-link-target="subdir/nested.md"]')).toBeVisible();

    // The alias is what the reader sees; the target is still the file
    await expect(page.locator('a.internal-link', { hasText: 'groceries' }))
      .toHaveAttribute('data-link-target', 'shopping.txt');

    // A name with no extension falls back to .txt
    await expect(page.locator('a.internal-link', { hasText: /^shopping$/ }))
      .toHaveAttribute('data-link-target', 'shopping.txt');

    // A link to a missing file renders inert, with no anchor at all
    await expect(page.locator('span.internal-link[data-unresolved="true"]', { hasText: 'does-not-exist.md' })).toBeVisible();
    await expect(page.locator('a.internal-link', { hasText: 'does-not-exist.md' })).toHaveCount(0);

    // Links inside code fences and inline code stay literal
    await expect(page.locator('#modal-content-text pre code')).toContainText('[[fenced-only.md]]');
    await expect(page.locator('#modal-content-text p code')).toContainText('[[inline-only.md]]');
    // Four of the five out-of-code links resolved; only does-not-exist.md did not.
    await expect(page.locator('#modal-content-text a.internal-link')).toHaveCount(4);
    await expect(page.locator('#modal-content-text span.internal-link[data-unresolved="true"]')).toHaveCount(1);
  });

  test('extensionless links prefer .txt, fall back to .md, and keep their alias', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openExtensionless(page);

    // No .txt for this one, so .md wins
    await expect(page.locator('a.internal-link', { hasText: /^subdir\/nested$/ }))
      .toHaveAttribute('data-link-target', 'subdir/nested.md');

    // Both exist — .txt takes precedence
    await expect(page.locator('a.internal-link', { hasText: /^ambig$/ }))
      .toHaveAttribute('data-link-target', 'ambig.txt');

    await expect(page.locator('a.internal-link', { hasText: 'the groceries' }))
      .toHaveAttribute('data-link-target', 'shopping.txt');
  });

});

// Shrinks the page to one card so a link target is absent from the file list, leaving
// nothing for the modal to animate out of except the off-screen target.
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

  test('a link opens a note that has no card on screen, and closes cleanly', async ({ page }) => {
    // Two elements sharing view-transition-name silently break the NEXT transition, and the
    // off-screen target is inert, so focus must not be parked on it either.
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await shrinkToOnePage(page);

    await page.locator('a.internal-link[data-link-target="subdir/nested.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await expect(page.locator('#modal-content-text')).toContainText('The nested target');
    await expect(page.locator('#offscreen-note-target')).not.toHaveClass(/moving-file-content-view/);

    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();
    await expect(page.locator('#offscreen-note-target')).not.toHaveClass(/moving-file-content-view/);
    expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('offscreen-note-target');
  });

  test('closing returns focus to the card, keeping arrow-key navigation alive', async ({ page }) => {
    // handleKeyboardNavigate ignores keys unless activeElement is .keyboard-navigable, so
    // losing focus on close silently kills card navigation.
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await loadFolder(page);
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

  test('typing [[ lists the notes, and selecting one inserts a complete link', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHubInTextMode(page);

    await typeAtEnd(page, '\n[[');
    await expect(page.locator('.ac-picker-popup')).toBeVisible();
    await expect(page.locator('.ac-picker-popup')).toContainText('shopping.txt');

    await page.keyboard.type('shop');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#modal-content-text pre')).toContainText('[[shopping.txt]]');
    await expect(page.locator('.ac-picker-popup')).toHaveCount(0);
  });

  test('a note in a folder is offered by its full path, and the inserted link resolves', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHubInTextMode(page);

    await typeAtEnd(page, '\n[[nested');
    await expect(page.locator('.ac-picker-item')).toHaveCount(1);
    await expect(page.locator('.ac-picker-item')).toHaveText('subdir/nested.md');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#modal-content-text pre')).toContainText('[[subdir/nested.md]]');

    // Back to html view: the inserted link must resolve, not render inert.
    await page.evaluate(() => {
      const toggle = document.getElementById('render_toggle');
      if (toggle.checked) toggle.click();
    });
    await expect(page.locator('a.internal-link[data-link-target="subdir/nested.md"]').last()).toBeVisible();
  });

  test('a folder name matches the notes inside it, and a query with spaces still matches', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHubInTextMode(page);

    await typeAtEnd(page, '\n[[subdir');
    await expect(page.locator('.ac-picker-item')).toHaveText('subdir/nested.md');
    await page.keyboard.press('Escape');

    // The caret walk must not stop at the space in the query
    await typeAtEnd(page, '\n[[my long');
    await expect(page.locator('.ac-picker-popup')).toBeVisible();
    await expect(page.locator('.ac-picker-popup')).toContainText('my long note.md');
  });

});

test.describe('internal links — internalLink property', () => {

  // Collected during the initial folder parse, in the same single matchAll pass that
  // already extracts title and tags — no extra scan of the file.

  test('link targets are collected on load, raw and deduped, ignoring code', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await loadFolder(page);
    await expect(page.locator('.note-grid').first()).toBeVisible();

    const collected = await page.evaluate(() => {
      const linksFor = (id) => window.appState.myFiles.find(f => f.internalId === id)?.internalLink;
      const hub = window.appState.myFiles.find(f => f.internalId === 'hub.md');
      const nested = window.appState.myFiles.find(f => f.internalId === 'subdir/nested.md');
      return {
        hub: linksFor('hub.md'),
        // regex_title consumes the whole '# ' line, so getInitialTitle has to re-scan for
        // a link in the H1 the same way it does for tags.
        titled: linksFor('titled-link.md'),
        // Properties are registered from myFiles[0] only, so the key must never be omitted.
        noLinks: linksFor('shopping.txt'),
        hubTitle: hub.title,
        nestedTitle: nested.title,
        nestedTags: [...nested.tags.keys()],
      };
    });

    // The four real links, deduped and in source order: shopping.txt appears twice
    // (plain + aliased) but once here; does-not-exist.md is kept because raw text is
    // stored, not resolved ids; 'shopping' is the extensionless one, also raw.
    // fenced-only.md and inline-only.md appear ONLY inside code, so dedupe cannot mask a leak.
    expect(collected.hub).toEqual(['shopping.txt', 'subdir/nested.md', 'does-not-exist.md', 'shopping']);
    expect(collected.hub).not.toContain('groceries');
    expect(collected.titled).toEqual(['shopping.txt']);
    expect(collected.noLinks).toEqual([]);

    // Guards the appended capture group: inserting it would shift the destructuring.
    expect(collected.hubTitle).toBe('Hub');
    expect(collected.nestedTitle).toBe('Nested Note');
    expect(collected.nestedTags).toContain('personal');
  });

});
