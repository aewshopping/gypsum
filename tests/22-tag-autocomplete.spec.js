const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder } = require('./helpers');

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

const popup = '.tag-autocomplete-popup';

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
    await page.locator('.tag-autocomplete-item').filter({ hasText: 'personal' }).click();
    await expect(page.locator(popup)).not.toBeVisible();
    expect(await occurrences()).toBe(before + 2);
  });

  test('a long space-free line does not break the backward walk', async ({ page }) => {
    // A base64-encoded image produces one massive line with no spaces. The backward walk
    // is capped, so a '#' on the NEXT line must still trigger, while one typed at the end
    // of the long line itself — with no word boundary in the lookback — must not.
    const longLine = 'A'.repeat(5000);
    await page.addInitScript((line) => {
      window.showDirectoryPicker = async () => ({
        kind: 'directory', name: 'root',
        values: async function* () {
          yield {
            kind: 'file', name: 'base64-test.md',
            getFile: async () => ({
              name: 'base64-test.md',
              size: line.length + 10,
              lastModified: Date.now(),
              text: async () => `${line}\nsome text #personal`,
            }),
          };
        },
      });
    }, longLine);
    await page.goto('/');
    await loadFolder(page);
    await page.locator('.note-grid').first().click();
    await page.evaluate(() => {
      const t = document.getElementById('render_toggle');
      if (!t.checked) t.click();
    });
    await expect(page.locator('#modal-content-text pre')).toBeVisible();

    // Place caret after the <br> that follows the long line (start of "some text...")
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      const br = pre.querySelector('br');
      const range = document.createRange();
      range.setStartAfter(br);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      pre.focus();
    });
    await page.keyboard.type('#p');
    await expect(page.locator(popup)).toBeVisible();
    await page.keyboard.press('Escape');

    // Now at the end of the long line itself, where there is no boundary to find
    await page.locator('#modal-content-text pre').click();
    await page.evaluate(() => {
      const pre = document.querySelector('#modal-content-text pre');
      const range = document.createRange();
      range.setStart(pre.firstChild, pre.firstChild.length);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      pre.focus();
    });
    await page.keyboard.type('#p');
    await expect(page.locator(popup)).not.toBeVisible();
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
    await expect(page.locator('.tag-autocomplete-item')).toHaveCount(1);
    await expect(page.locator('.tag-autocomplete-item').first()).toHaveText('brie');
  });

});

test.describe('tag autocomplete — searchbox', () => {

  test('tags: opens the popup, and arrow keys walk it', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);

    await page.fill('#searchbox', 'tags:');
    await expect(page.locator(popup)).toBeVisible();

    await page.locator('#searchbox').press('ArrowDown');
    await expect(page.locator('.tag-autocomplete-item[data-active="true"]')).toBeVisible();
    await page.locator('#searchbox').press('ArrowDown');
    expect(await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tag-autocomplete-item')];
      return items.findIndex(el => el.dataset.active === 'true');
    })).toBe(1);
  });

  test('clicking an item runs the search immediately', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);

    await page.fill('#searchbox', 'tags:p');
    await expect(page.locator(popup)).toContainText('personal');
    await page.locator('.tag-autocomplete-item').filter({ hasText: 'personal' }).click();
    await expect(page.locator(popup)).not.toBeVisible();
    // shopping.txt and big-ideas.md both have #personal
    await expect(page.locator('.note-grid')).toHaveCount(2);
  });

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

  // The searchbox carries data-tip, and the tooltip writes anchor-name inline on whatever
  // it points at. Hovering the box first is the ordinary way to reach it, so the popup has
  // to stay anchored to the box afterwards. Geometry, not visibility: a popup that has lost
  // its anchor still passes toBeVisible(), it just renders at the foot of <body>.
  test('the popup sits under the searchbox even after its tooltip has shown', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);

    await page.hover('#searchbox');
    await expect(page.locator('#tooltip')).toBeVisible();

    await page.fill('#searchbox', 'tags:');
    await expect(page.locator(popup)).toBeVisible();

    const box = await page.locator('#searchbox').boundingBox();
    const pop = await page.locator(popup).boundingBox();
    expect(Math.abs(pop.x - box.x)).toBeLessThan(4);
    expect(pop.y - (box.y + box.height)).toBeGreaterThanOrEqual(0);
    expect(pop.y - (box.y + box.height)).toBeLessThan(12);
  });

});
