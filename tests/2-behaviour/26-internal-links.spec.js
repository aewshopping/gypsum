const { test, expect } = require('@playwright/test');
const { setupMockFilesWithLinks, loadFolder } = require('../helpers');

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
      const textFor = (id) => window.appState.myFiles.find(f => f.internalId === id)?.internalLinkText;
      const hub = window.appState.myFiles.find(f => f.internalId === 'hub.md');
      const nested = window.appState.myFiles.find(f => f.internalId === 'subdir/nested.md');
      return {
        hub: linksFor('hub.md'),
        // regex_title consumes the whole '# ' line, so getInitialTitle has to re-scan for
        // a link in the H1 the same way it does for tags.
        titled: linksFor('titled-link.md'),
        // Properties are registered from myFiles[0] only, so the key must never be omitted.
        noLinks: linksFor('shopping.txt'),
        hubText: textFor('hub.md'),
        noLinksText: textFor('shopping.txt'),
        frontMatter: linksFor('front-matter-links.md'),
        frontMatterText: textFor('front-matter-links.md'),
        frontMatterTitle: window.appState.myFiles
          .find(f => f.internalId === 'front-matter-links.md').title,
        frontMatterTags: [...window.appState.myFiles
          .find(f => f.internalId === 'front-matter-links.md').tags.keys()],
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

    // internalLinkText is the same Map read again, so it is aligned by construction: index 0 is
    // shopping.txt, linked plain on one line and aliased two lines later. The first *non-empty*
    // text fills the slot, so the alias survives the dedupe. The other three carry '' — never
    // their own target, even though that is what such a link renders as.
    expect(collected.hubText).toHaveLength(collected.hub.length);
    expect(collected.hubText).toEqual(['groceries', '', '', '']);
    expect(collected.noLinksText).toEqual([]);

    // Guards the appended capture group: inserting it would shift the destructuring.
    expect(collected.hubTitle).toBe('Hub');
    expect(collected.nestedTitle).toBe('Nested Note');
    expect(collected.nestedTags).toContain('personal');
  });

  // The block is protected from the prose scan, so these come out of the *parsed values* —
  // see CLAUDE.md, *Front matter is data, not prose*.
  test('links declared in front matter values are collected too', async ({ page }) => {
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await loadFolder(page);
    await expect(page.locator('.note-grid').first()).toBeVisible();

    const collected = await page.evaluate(() => {
      const file = window.appState.myFiles.find(f => f.internalId === 'front-matter-links.md');
      return {
        links: file.internalLink,
        text: file.internalLinkText,
        title: file.title,
        tags: [...file.tags.keys()],
      };
    });

    // A quoted scalar, a quoted and an unquoted block list item, a flow list's item, and one
    // buried in prose. shopping.txt is written twice — plain, then aliased — so it appears once,
    // carrying the alias. The body of this note holds no links at all.
    expect(collected.links).toEqual([
      'shopping.txt',
      'gone-from-front-matter.md',
      'subdir/nested.md',
      'ambig.txt',
      'titled-link.md',
    ]);
    expect(collected.text).toEqual(['the groceries', '', '', '', '']);

    // A bare `key: [[a.md]]` is a YAML list holding a list, so the parser strips a bracket off
    // each end and there is nothing left to find. Quote it, or write it as a list item.
    expect(collected.links).not.toContain('not-detected.md');
    // A '#' line inside the block is a YAML comment, not prose, so nothing in it is read.
    expect(collected.links).not.toContain('commented.md');
    // The alias is what the link is called, never what it points at.
    expect(collected.links).not.toContain('the groceries');

    // The block is still not read as prose, which is what the whole value-shaped scan is for:
    // the '#' in a hex colour is not a tag, and the comment line is not this note's title.
    expect(collected.title).toBe('Front Matter Links');
    expect(collected.tags).toEqual([]);
  });

});

// front-matter-links.md declares links in YAML values: `related` holds one, `others` a list of
// two, one of which points at nothing. The table draws all of them.
test.describe('internal links — in table cells', () => {

  async function openTable(page) {
    await page.setViewportSize({ width: 1500, height: 800 });
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await loadFolder(page);
    await page.selectOption('#view-select', 'table');
    await expect(page.locator('.note-table-header')).toBeVisible();
  }

  const rowFor = (page, title) => page.locator('.note-table').filter({ hasText: title }).first();
  const cellFor = (page, title, prop) => rowFor(page, title).locator(`.note-table-cell[data-prop="${prop}"]`);

  test('a link in a front matter cell keeps its brackets and becomes an anchor', async ({ page }) => {
    await openTable(page);
    const cell = cellFor(page, 'Front Matter Links', 'related');

    // The anchor wraps the note's own text rather than replacing it with a label, which is what
    // keeps the cell's text the thing a commit writes back. See render-internal-link.js.
    await expect(cell.locator('a.internal-link')).toHaveText('[[shopping.txt]]');
    await expect(cell.locator('a.internal-link')).toHaveAttribute('data-link-target', 'shopping.txt');
    await expect(cell).toHaveText('[[shopping.txt]]');
  });

  test('a list cell marks each of its links, and an unresolved one is inert', async ({ page }) => {
    await openTable(page);
    const cell = cellFor(page, 'Front Matter Links', 'others');

    // `others` is a list in a column nobody has typed, so it is a shape mismatch — and its links
    // still work, because that is the state every list of links starts life in.
    await expect(cell.locator('a.internal-link')).toHaveText(['[[subdir/nested.md]]']);
    await expect(cell.locator('.internal-link[data-unresolved="true"]'))
      .toHaveText('[[gone-from-front-matter.md]]');
    await expect(cell).toHaveText('[[gone-from-front-matter.md]], [[subdir/nested.md]]');
  });

  test('opening a cell puts its links back to plain text', async ({ page }) => {
    await openTable(page);
    const cell = cellFor(page, 'Front Matter Links', 'related');

    await cell.focus();
    await page.keyboard.press('Enter');
    await expect(cell).toHaveClass(/is-expanded/);

    // One text node and no anchors: the caret, plaintext-only and the commit all get the cell they
    // were written for, and the characters are the same either side of the change.
    await expect(cell.locator('a.internal-link')).toHaveCount(0);
    await expect(cell).toHaveText('[[shopping.txt]]');
    expect(await cell.evaluate(el => el.childNodes.length)).toBe(1);
  });

  test('a link in a cell follows on the second press, not the first', async ({ page }) => {
    await openTable(page);
    const cell = cellFor(page, 'Front Matter Links', 'related');
    const link = cell.locator('a.internal-link');

    // The first press selects the cell, exactly as a press anywhere else in it does. Without this
    // a cell whose link covers its whole width could never be opened for editing.
    await link.click();
    await expect(cell).toHaveClass(/is-selected/);
    await expect(page.locator('#file-content-modal')).not.toBeVisible();

    await link.click();
    await expect(page.locator('#file-content-modal')).toBeVisible();
    await expect(page.locator('#file-content-modal')).toHaveAttribute('data-file-id', 'shopping.txt');
  });

  test('the links column draws the app\'s own targets as anchors', async ({ page }) => {
    await openTable(page);
    await page.click('[data-action="open-column-picker"]');
    await page.locator('#column-picker-list .info-modal-row').filter({ hasText: 'links' }).first()
      .locator('input.toggle').check();
    await page.keyboard.press('Escape');

    // No brackets here: this column is the app's own collection of targets, and none of its cells
    // takes a caret, so there is no text for a bracket to protect.
    const cell = cellFor(page, 'Hub', 'internalLink');
    await expect(cell.locator('a.internal-link').first()).toHaveText('shopping.txt');
    await expect(cell.locator('.internal-link[data-unresolved="true"]')).toHaveText('does-not-exist.md');
  });
});

// Opening a cell takes its anchors down — see cell-editor.js — and the render that follows closing
// it is what puts them back. A cell that was opened and not typed in writes nothing, so for a while
// no render followed and the links simply stopped being links until something else redrew the table.
test.describe('internal links — a cell opened and left alone', () => {

  async function openTable(page) {
    await page.setViewportSize({ width: 1500, height: 800 });
    await setupMockFilesWithLinks(page);
    await page.goto('/');
    await loadFolder(page);
    await page.selectOption('#view-select', 'table');
    await expect(page.locator('.note-table-header')).toBeVisible();
  }

  const rowFor = (page, title) => page.locator('.note-table').filter({ hasText: title }).first();
  const cellFor = (page, title, prop) => rowFor(page, title).locator(`.note-table-cell[data-prop="${prop}"]`);
  const linkCell = (page) => cellFor(page, 'Front Matter Links', 'related');

  /** Opens a cell from the keyboard: a link can cover every pixel of its cell's text. */
  async function openUntouched(page, cell) {
    await cell.focus();
    await page.keyboard.press('Enter');
    await expect(cell).toHaveClass(/is-expanded/);
    await expect(cell.locator('a.internal-link')).toHaveCount(0);   // flattened, as it must be
  }

  test('Enter on an untouched cell leaves its link a link', async ({ page }) => {
    await openTable(page);
    const cell = linkCell(page);
    await openUntouched(page, cell);

    await page.keyboard.press('Enter');
    await expect(cell).not.toHaveClass(/is-expanded/);
    await expect(cell.locator('a.internal-link')).toHaveText('[[shopping.txt]]');

    // and the cell is still the one a press would reopen
    await expect(cell).toHaveClass(/is-selected/);
    await expect(cell).toBeFocused();
  });

  test('Escape on an untouched cell leaves its link a link', async ({ page }) => {
    await openTable(page);
    const cell = linkCell(page);
    await openUntouched(page, cell);

    await page.keyboard.press('Escape');
    await expect(cell).not.toHaveClass(/is-expanded/);
    await expect(cell.locator('a.internal-link')).toHaveText('[[shopping.txt]]');
    await expect(cell).toHaveClass(/is-selected/);
    await expect(cell).toBeFocused();
  });

  test('clicking another cell leaves the link a link, and marks the cell clicked', async ({ page }) => {
    await openTable(page);
    const cell = linkCell(page);
    await openUntouched(page, cell);

    const other = cellFor(page, 'Front Matter Links', 'title');
    await other.click();

    await expect(cell).not.toHaveClass(/is-expanded/);
    await expect(cell.locator('a.internal-link')).toHaveText('[[shopping.txt]]');

    // the render happens while handleCellFocusIn is still running — the cell that was clicked must
    // still end up the selected one
    await expect(other).toHaveClass(/is-selected/);
    await expect(cell).not.toHaveClass(/is-selected/);
  });
});
