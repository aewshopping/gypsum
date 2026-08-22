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
    await expect(page.locator('#modal-content-text pre code')).toContainText('[[fenced-only.md]]');
    await expect(page.locator('#modal-content-text p code')).toContainText('[[inline-only.md]]');
    // Only the four out-of-code links produced anchors (shopping, nested, alias).
    await expect(page.locator('#modal-content-text a.internal-link')).toHaveCount(3);
  });

});

// Records whether #offscreen-note-target ever carries the transition-name class. The class can
// be added and removed inside a single tick when transitions run fast, so polling the live DOM
// misses it — watch for the mutation instead.
async function watchOffscreenTargetTransitionClass(page) {
  await page.evaluate(() => {
    const btn = document.getElementById('offscreen-note-target');
    window.__offscreenGotTransitionClass = btn.classList.contains('moving-file-content-view');
    new MutationObserver(() => {
      if (btn.classList.contains('moving-file-content-view')) window.__offscreenGotTransitionClass = true;
    }).observe(btn, { attributes: true, attributeFilter: ['class'] });
  });
}

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

  test('a link opens a note that has no card on screen', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await shrinkToOnePage(page);
    await page.locator('a.internal-link[data-link-target="subdir/nested.md"]').click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await expect(page.locator('#modal-content-text')).toContainText('The nested target');
  });

  test('opening a card-less note leaves no transition name on the off-screen target', async ({ page }) => {
    // Two elements sharing view-transition-name silently break the NEXT transition,
    // so the class must be stripped once the open transition settles.
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await shrinkToOnePage(page);
    await page.locator('a.internal-link[data-link-target="subdir/nested.md"]').click();
    await expect(page.locator('#modal-content-text')).toContainText('The nested target');
    await expect(page.locator('#offscreen-note-target')).not.toHaveClass(/moving-file-content-view/);
  });

  test('closing a card-less note animates back into the off-screen target', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await shrinkToOnePage(page);
    await page.locator('a.internal-link[data-link-target="subdir/nested.md"]').click();
    await expect(page.locator('#modal-content-text')).toContainText('The nested target');

    await watchOffscreenTargetTransitionClass(page);
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    expect(await page.evaluate(() => window.__offscreenGotTransitionClass)).toBe(true);
    await expect(page.locator('#offscreen-note-target')).not.toHaveClass(/moving-file-content-view/);
  });

  test('closing a card-less note does not park focus on the off-screen target', async ({ page }) => {
    // The target is inert and unfocusable; focus must stay off it.
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await openHub(page);
    await shrinkToOnePage(page);
    await page.locator('a.internal-link[data-link-target="subdir/nested.md"]').click();
    await expect(page.locator('#modal-content-text')).toContainText('The nested target');
    await page.click('[data-action="close-file-content-modal"]');
    await expect(page.locator('#file-content-modal')).not.toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('offscreen-note-target');
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

test.describe('internal links — internalLink property', () => {

  // Collected during the initial folder parse, in the same single matchAll pass that
  // already extracts title and tags — no extra scan of the file.

  const linksFor = (page, id) => page.evaluate(
    (fileId) => window.appState.myFiles.find(f => f.internalId === fileId)?.internalLink,
    id);

  test('link targets are collected on load', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid').first()).toBeVisible();
    const links = await linksFor(page, 'hub.md');
    expect(links).toContain('shopping.txt');
    expect(links).toContain('subdir/nested.md');
  });

  test('raw text is stored, so targets with no matching file are kept', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid').first()).toBeVisible();
    // Proves ids are not resolved at parse time — an unresolved link would vanish.
    expect(await linksFor(page, 'hub.md')).toContain('does-not-exist.md');
  });

  test('the alias is stripped and a repeated target appears once', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid').first()).toBeVisible();
    const links = await linksFor(page, 'hub.md');
    expect(links).not.toContain('groceries');
    // hub.md links to shopping.txt twice: once plain, once aliased.
    expect(links.filter(l => l === 'shopping.txt')).toHaveLength(1);
  });

  test('links inside code fences and inline code are not collected', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid').first()).toBeVisible();
    const links = await linksFor(page, 'hub.md');
    // These targets appear ONLY inside code, so dedupe cannot mask a leak.
    expect(links).not.toContain('fenced-only.md');
    expect(links).not.toContain('inline-only.md');
    // The four real links, deduped: shopping.txt (plain + aliased), subdir/nested.md,
    // does-not-exist.md, and the extensionless 'shopping' — raw text, so it is kept.
    expect(links).toEqual(['shopping.txt', 'subdir/nested.md', 'does-not-exist.md', 'shopping']);
  });

  test('a link in the H1 title is collected', async ({ page }) => {
    // regex_title consumes the whole '# ' line, so the combined regex never sees a link
    // there — getInitialTitle has to re-scan, the same way it does for tags.
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid').first()).toBeVisible();
    expect(await linksFor(page, 'titled-link.md')).toEqual(['shopping.txt']);
  });

  test('a file with no links still carries the key as an empty array', async ({ page }) => {
    // Properties are registered from myFiles[0] only, so the key must never be omitted.
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid').first()).toBeVisible();
    expect(await linksFor(page, 'shopping.txt')).toEqual([]);
  });

  test('title, tags and colour still parse correctly alongside links', async ({ page }) => {
    // Guards the appended capture group: inserting it would shift the destructuring.
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await page.click('[data-click-loadfolder]');
    await expect(page.locator('.note-grid').first()).toBeVisible();
    const hub = await page.evaluate(() => {
      const f = window.appState.myFiles.find(x => x.internalId === 'hub.md');
      return { title: f.title, tags: [...f.tags.keys()] };
    });
    expect(hub.title).toBe('Hub');
    const nested = await page.evaluate(() => {
      const f = window.appState.myFiles.find(x => x.internalId === 'subdir/nested.md');
      return { title: f.title, tags: [...f.tags.keys()] };
    });
    expect(nested.title).toBe('Nested Note');
    expect(nested.tags).toContain('personal');
  });

});
