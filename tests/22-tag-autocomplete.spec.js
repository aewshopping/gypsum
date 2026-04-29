const { test, expect } = require('@playwright/test');
const { setupMockFiles } = require('./helpers');

// setupMockFiles has files with: #work/project, #personal, #color/coral

async function loadFiles(page) {
  await page.click('[data-click-loadfiles]');
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

test.describe('tag autocomplete — editor', () => {

  test('popup appears when typing #<letter> after a space', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #p');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await expect(page.locator('.tag-autocomplete-popup')).toContainText('personal');
  });

  test('popup appears when typing # at the start of a line (after a <br>)', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    // The renderer converts \n → <br> in the pre's innerHTML.
    // Place the caret directly after the first <br> so the bug is isolated:
    // Range.toString() drops <br> nodes, making '#' look mid-word to the regex.
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
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
  });

  test('popup appears after a <br> that follows a very long space-free line (base64 scenario)', async ({ page }) => {
    // A base64-encoded image produces one massive line with no spaces. Without a
    // character cap on the backward walk, typing '#' on the NEXT line would still
    // scan or allocate the entire preceding text. Verify correctness is preserved.
    const longLine = 'A'.repeat(5000); // simulate base64 — no spaces, no newlines
    await page.addInitScript((line) => {
      window.showOpenFilePicker = async () => [{
        getFile: async () => ({
          name: 'base64-test.md',
          size: line.length + 10,
          lastModified: Date.now(),
          text: async () => `${line}\nsome text #personal`,
        }),
      }];
    }, longLine);
    await page.goto('/');
    await page.click('[data-click-loadfiles]');
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
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
  });

  test('popup does not appear when # is preceded only by base64-like characters on the same line', async ({ page }) => {
    // Typing '#' immediately after a long run of alphanumerics (no space/newline
    // boundary within the lookback window) must not trigger autocomplete.
    const longLine = 'A'.repeat(5000);
    await page.addInitScript((line) => {
      window.showOpenFilePicker = async () => [{
        getFile: async () => ({
          name: 'base64-test.md',
          size: line.length,
          lastModified: Date.now(),
          text: async () => line,
        }),
      }];
    }, longLine);
    await page.goto('/');
    await page.click('[data-click-loadfiles]');
    await page.locator('.note-grid').first().click();
    await page.evaluate(() => {
      const t = document.getElementById('render_toggle');
      if (!t.checked) t.click();
    });
    await expect(page.locator('#modal-content-text pre')).toBeVisible();
    // Place caret at the end of the long line and type '#p'
    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type('#p');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
  });

  test('popup appears on bare # (shows all tags)', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
  });

  test('popup does not appear when # follows a letter (mid-word)', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, 'foo#p');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
  });

  test('popup updates as user types more letters', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #p');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await page.keyboard.type('e');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await expect(page.locator('.tag-autocomplete-item')).toHaveCount(1);
    await expect(page.locator('.tag-autocomplete-item').first()).toContainText('personal');
  });

  test('popup dismisses when a space is typed after trigger', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #p');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await page.keyboard.type(' ');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
  });

  test('popup dismisses when backspace removes the # character', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #p');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
  });

  test('Escape dismisses popup and leaves typed text intact', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #p');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
    const text = await page.locator('#modal-content-text pre').textContent();
    expect(text).toContain('#p');
  });

  test('Tab highlights the first item', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #p');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('.tag-autocomplete-item[data-active="true"]')).toBeVisible();
  });

  test('Tab then Enter inserts the selected tag', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #per');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
    const text = await page.locator('#modal-content-text pre').textContent();
    expect(text).toMatch(/#personal/);
  });

  test('Tab twice selects (Tab on active item)', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #per');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
    const text = await page.locator('#modal-content-text pre').textContent();
    expect(text).toMatch(/#personal/);
  });

  test('clicking an item inserts the tag', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #p');
    await page.locator('.tag-autocomplete-item').filter({ hasText: 'personal' }).click();
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
    const text = await page.locator('#modal-content-text pre').textContent();
    expect(text).toMatch(/#personal/);
  });

  test('clicking outside the popup dismisses it', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #p');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await page.locator('#file-content-header').click();
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
  });

  test('Ctrl+S is not consumed when popup is open', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await openEditorInTextMode(page);
    await typeInEditor(page, ' #p');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    // Ctrl+S should not throw or break the page
    await page.keyboard.press('Control+s');
    // Page must remain functional (popup may or may not still be visible)
    await expect(page.locator('#file-content-modal')).toBeVisible();
  });

});

test.describe('tag autocomplete — searchbox', () => {

  test('popup appears when typing tags:<letters>', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);
    await page.fill('#searchbox', 'tags:p');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await expect(page.locator('.tag-autocomplete-popup')).toContainText('personal');
  });

  test('popup does not appear without the tags: prefix', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);
    await page.fill('#searchbox', 'personal');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
  });

  test('clicking an item fills the searchbox value', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);
    await page.fill('#searchbox', 'tags:p');
    await page.locator('.tag-autocomplete-item').filter({ hasText: 'personal' }).click();
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
    await expect(page.locator('#searchbox')).toHaveValue('tags:personal');
  });

  test('Tab then Tab selects into searchbox', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);
    await page.fill('#searchbox', 'tags:per');
    await page.locator('#searchbox').press('Tab');
    await page.locator('#searchbox').press('Tab');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
    await expect(page.locator('#searchbox')).toHaveValue('tags:personal');
  });

  test('Enter with no active item dismisses popup and runs search', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);
    await page.fill('#searchbox', 'tags:personal');
    // Trigger the autocomplete popup
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    // Press Enter without navigating — popup should close and search should run
    await page.locator('#searchbox').press('Enter');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
    // shopping.txt and big-ideas.md both have #personal
    await expect(page.locator('.note-grid')).toHaveCount(2);
  });

  test('Enter after click-selection runs search', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);
    await page.fill('#searchbox', 'tags:p');
    await page.locator('.tag-autocomplete-item').filter({ hasText: 'personal' }).click();
    await expect(page.locator('#searchbox')).toHaveValue('tags:personal');
    // Now press Enter to run the search
    await page.locator('#searchbox').press('Enter');
    await expect(page.locator('.note-grid')).toHaveCount(2);
  });

  test('Escape dismisses popup without changing searchbox value', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);
    await page.fill('#searchbox', 'tags:p');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await page.locator('#searchbox').press('Escape');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
    await expect(page.locator('#searchbox')).toHaveValue('tags:p');
  });

});

test.describe('tag autocomplete — tag list contents', () => {

  test('child-only tag and same-name parented tag both show as the bare child name once', async ({ page }) => {
    // File 1 has #brie (orphan), File 2 has #cheese/brie (parented).
    // buildParentMap classifies 'brie' as a family tag (appears under cheese),
    // so the old code never emitted the bare 'brie' entry. The fix uses the
    // 'all' key which deduplicates to the child name regardless of parenting.
    await page.addInitScript(() => {
      window.showOpenFilePicker = async () => [
        {
          getFile: async () => ({
            name: 'a.md', size: 10, lastModified: Date.now(),
            text: async () => '# A\n#brie',
          }),
        },
        {
          getFile: async () => ({
            name: 'b.md', size: 10, lastModified: Date.now(),
            text: async () => '# B\n#cheese/brie',
          }),
        },
      ];
    });
    await page.goto('/');
    await page.click('[data-click-loadfiles]');
    await page.locator('.note-grid').first().click();
    await page.evaluate(() => {
      const t = document.getElementById('render_toggle');
      if (!t.checked) t.click();
    });
    await expect(page.locator('#modal-content-text pre')).toBeVisible();
    await page.locator('#modal-content-text pre').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' #b');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    // 'brie' should appear exactly once (not as 'cheese/brie')
    await expect(page.locator('.tag-autocomplete-item')).toHaveCount(1);
    await expect(page.locator('.tag-autocomplete-item').first()).toHaveText('brie');
  });

});

test.describe('tag autocomplete — regression guards', () => {

  test('Enter search still works after autocomplete popup is dismissed', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);
    // Open and dismiss popup
    await page.fill('#searchbox', 'tags:p');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await page.locator('#searchbox').press('Escape');
    await expect(page.locator('.tag-autocomplete-popup')).not.toBeVisible();
    // Set a plain search value and press Enter
    await page.fill('#searchbox', 'personal');
    await page.locator('#searchbox').press('Enter');
    await expect(page.locator('.note-grid')).toHaveCount(2);
  });

  test('ArrowDown navigates to next item', async ({ page }) => {
    await setupMockFiles(page);
    await page.goto('/');
    await loadFiles(page);
    await page.fill('#searchbox', 'tags:');
    await expect(page.locator('.tag-autocomplete-popup')).toBeVisible();
    await page.locator('#searchbox').press('ArrowDown');
    await expect(page.locator('.tag-autocomplete-item[data-active="true"]')).toBeVisible();
    await page.locator('#searchbox').press('ArrowDown');
    const activeIdx = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tag-autocomplete-item')];
      return items.findIndex(el => el.dataset.active === 'true');
    });
    expect(activeIdx).toBe(1);
  });

});
