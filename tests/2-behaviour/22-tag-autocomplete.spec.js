const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder } = require('../helpers');

// setupMockFiles has files with: #work/project, #personal, #color/coral

async function loadFiles(page) {
  await loadFolder(page);
  await expect(page.locator('.note-grid').first()).toBeVisible();
}

async function openEditorInTextMode(page) {
  await loadFiles(page);
  await page.locator('.note-grid').first().click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
}

// Types text at the end of the editor pre element.
async function typeInEditor(page, text) {
  await page.locator('#modal-content-text pre').click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
}

const popup = '.ac-picker-popup';

test.describe('tag autocomplete — editor', () => {

  test('the popup opens on #<letter>, and space or backspace dismisses it', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);

    await typeInEditor(page, ' #p');
    await expect(page.locator(popup)).toBeVisible();
    await expect(page.locator(popup)).toContainText('personal');

    await page.keyboard.type(' ');
    await expect(page.locator(popup)).not.toBeVisible();

    await typeInEditor(page, '#p');
    await expect(page.locator(popup)).toBeVisible();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(page.locator(popup)).not.toBeVisible();
  });

  test('Escape dismisses it, leaving the typed text; Tab+Enter and a click insert the tag', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);

    // Which note opens first depends on the sort, and End lands at the end of a line rather
    // than the file, so count insertions instead of matching on position.
    const editorText = () => page.locator('#modal-content-text pre').textContent();
    const occurrences = async () => ((await editorText()).match(/#personal/g) ?? []).length;
    const before = await occurrences();

    await typeInEditor(page, ' #p');
    await expect(page.locator(popup)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(popup)).not.toBeVisible();
    expect(await editorText()).toContain('#p');
    expect(await occurrences()).toBe(before);

    // Tab moves to the first item, Enter inserts it — the half-typed '#per' becomes '#personal'
    await page.keyboard.type('er');
    await expect(page.locator(popup)).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator(popup)).not.toBeVisible();
    expect(await occurrences()).toBe(before + 1);

    // And the same by clicking an item
    await typeInEditor(page, ' #p');
    await expect(page.locator(popup)).toBeVisible();
    await page.locator('.ac-picker-item').filter({ hasText: 'personal' }).click();
    await expect(page.locator(popup)).not.toBeVisible();
    expect(await occurrences()).toBe(before + 2);
  });

  test('a child-only tag and a same-name parented tag show as the bare name once', async ({ page }) => {
    // File 1 has #brie (orphan), File 2 has #cheese/brie (parented).
    // buildParentMap classifies 'brie' as a family tag (appears under cheese),
    // so the old code never emitted the bare 'brie' entry. The fix uses the
    // 'all' key which deduplicates to the child name regardless of parenting.
    await page.addInitScript(() => {
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () {
          yield { kind: 'file', name: 'a.md', getFile: async () => ({ name: 'a.md', size: 10, lastModified: Date.now(), text: async () => '# A\n#brie' }) };
          yield { kind: 'file', name: 'b.md', getFile: async () => ({ name: 'b.md', size: 10, lastModified: Date.now(), text: async () => '# B\n#cheese/brie' }) };
        },
      });
    });
    await page.goto('/');
    await loadFolder(page);
    await page.locator('.note-grid').first().click();
    await page.evaluate(() => {
      const t = document.getElementById('render_toggle');
      if (!t.checked) t.click();
    });
    await expect(page.locator('#modal-content-text pre')).toBeVisible();
    await typeInEditor(page, ' #b');
    await expect(page.locator(popup)).toBeVisible();
    // 'brie' should appear exactly once (not as 'cheese/brie')
    await expect(page.locator('.ac-picker-item')).toHaveCount(1);
    await expect(page.locator('.ac-picker-item').first()).toHaveText('brie');
  });

});

test.describe('tag autocomplete — searchbox', () => {

  test('Enter runs the search, both with the popup open and after dismissing it', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);

    // Enter with no active item — popup closes and the search runs
    await page.fill('#searchbox', 'tags:personal');
    await expect(page.locator(popup)).toBeVisible();
    await page.locator('#searchbox').press('Enter');
    await expect(page.locator(popup)).not.toBeVisible();
    await expect(page.locator('.note-grid')).toHaveCount(2);

    // Escape-dismissing the popup must not leave the Enter handler broken
    await page.fill('#searchbox', 'tags:p');
    await expect(page.locator(popup)).toBeVisible();
    await page.locator('#searchbox').press('Escape');
    await expect(page.locator(popup)).not.toBeVisible();
    await page.fill('#searchbox', 'personal');
    await page.locator('#searchbox').press('Enter');
    await expect(page.locator('.note-grid')).toHaveCount(2);
  });

});

// The same picker, in the other place a note name is wanted: a front matter value. What differs
// from the editor is where the popup lives — outside the cell, because the cell is contenteditable
// and the commit writes its whole textContent.
test.describe('note picker — table cell', () => {

  // ref: a text column holding a link; people: a list column; due: a date; count: a number.
  async function setupCells(page) {
    await page.addInitScript(() => {
      window.showDirectoryPicker = async () => {
        const mk = (n, c) => ({ kind: 'file', name: n,
          getFile: async () => ({ name: n, size: c.length, lastModified: Date.now(), text: async () => c }) });
        return { kind: 'directory', name: 'root', values: async function* () {
          yield mk('alpha.md', '---\nref: plain\npeople:\n  - John Smith\ndue: 2026-03-01\ncount: 3\n---\n# Alpha\n');
          yield mk('shopping.txt', 'Shopping list\n');
          yield mk('quarterly.md', '# Quarterly\n');
        } };
      };
    });
  }

  async function openTable(page) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await setupCells(page);
    await page.goto('/');
    await loadFolder(page);
    await page.selectOption('#view-select', 'table');
    await expect(page.locator('.note-table-header')).toBeVisible();
  }

  const cellFor = (page, prop) => page.locator('.note-table').filter({ hasText: 'Alpha' }).first()
    .locator(`.note-table-cell[data-prop="${prop}"]`);

  /** Opens a cell from the keyboard and puts the caret at the end of its text. */
  async function openCell(page, cell) {
    await cell.focus();
    await page.keyboard.press('Enter');
    await expect(cell).toHaveClass(/is-expanded/);
    await page.keyboard.press('End');
  }

  /** Sets a column's type through the column picker, the way a user would. */
  async function setType(page, property, value) {
    await page.click('[data-action="open-column-picker"]');
    await page.locator(`.info-modal-row[data-property="${property}"] .column-picker-type`).click();
    await page.locator(`[data-action="column-type-set"][data-value="${value}"]`).click();
    await page.keyboard.press('Escape');
    await page.click('[data-action="close-column-picker"]');
    await expect(page.locator('#modal-columns')).not.toBeVisible();
  }

  test('[[ in a text cell opens the picker, and the popup is not inside the cell', async ({ page }) => {
    await openTable(page);
    const cell = cellFor(page, 'ref');
    await openCell(page, cell);
    await page.keyboard.type(' [[sh');

    await expect(page.locator(popup)).toBeVisible();
    await expect(page.locator(popup)).toContainText('shopping.txt');

    // The one invariant whose breach silently writes the popup's text into a note.
    await expect(cell.locator(popup)).toHaveCount(0);
  });

  test('clicking a suggestion inserts it and leaves the cell open', async ({ page }) => {
    await openTable(page);
    const cell = cellFor(page, 'ref');
    await openCell(page, cell);
    await page.keyboard.type(' [[sh');
    await expect(page.locator(popup)).toBeVisible();

    await page.locator(`${popup} .ac-picker-item`, { hasText: 'shopping.txt' }).click();

    await expect(cell).toHaveText('plain [[shopping.txt]]');
    await expect(cell).toHaveClass(/is-expanded/);   // the click-outside exemption
    await expect(page.locator(popup)).not.toBeVisible();
  });

  test('Tab then Enter inserts; Escape closes the popup, a second Escape the cell', async ({ page }) => {
    await openTable(page);
    const cell = cellFor(page, 'ref');
    await openCell(page, cell);

    await page.keyboard.type(' [[sh');
    await expect(page.locator(popup)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(popup)).not.toBeVisible();
    await expect(cell).toHaveClass(/is-expanded/);   // one level at a time
    await page.keyboard.press('Escape');
    await expect(cell).not.toHaveClass(/is-expanded/);

    await openCell(page, cell);
    await page.keyboard.type(' [[sh');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(cell).toHaveText('plain [[shopping.txt]]');
    await expect(cell).toHaveClass(/is-expanded/);
  });

  test('Enter with nothing active closes the popup and finishes the cell', async ({ page }) => {
    await openTable(page);
    const cell = cellFor(page, 'ref');
    await openCell(page, cell);
    await page.keyboard.type(' [[sh');
    await expect(page.locator(popup)).toBeVisible();

    await page.keyboard.press('Enter');   // no item highlighted
    await expect(page.locator(popup)).not.toBeVisible();   // not left orphaned
    await expect(cell).not.toHaveClass(/is-expanded/);
  });

  test('a list cell completes, and its item marks still cover the items', async ({ page }) => {
    await openTable(page);
    await setType(page, 'people', 'array');
    const cell = cellFor(page, 'people');
    await openCell(page, cell);

    await page.keyboard.type(', [[sh');
    await expect(page.locator(popup)).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');

    await expect(cell).toHaveText('John Smith, [[shopping.txt]]');
    const marked = await page.evaluate(() => {
      const cell = document.querySelector('.note-table-cell.is-expanded[data-prop="people"]');
      const h = CSS.highlights.get('list-item');
      return h ? [...h].filter(r => r.startContainer.parentElement === cell).map(r => r.toString()) : [];
    });
    expect(marked).toEqual(['John Smith', '[[shopping.txt]]']);
  });

  test('a date cell and a number cell offer nothing', async ({ page }) => {
    await openTable(page);
    // Both are front matter properties the app has no schema for, so they are text columns until
    // someone types them — and a text column completes, correctly. The types are what this is about.
    await setType(page, 'count', 'number');
    await setType(page, 'due', 'date');

    const number = cellFor(page, 'count');
    await openCell(page, number);
    await page.keyboard.type(' [[sh');
    await expect(page.locator(popup)).not.toBeVisible();
    await page.keyboard.press('Escape');

    const date = cellFor(page, 'due');
    await date.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('End');
    await page.keyboard.type(' [[sh');
    await expect(page.locator(popup)).not.toBeVisible();
  });
});
