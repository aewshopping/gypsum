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
    await typeInEditor(page, ' #p');
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
    await typeInEditor(page, ' #p');
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
    await page.fill('#searchbox', 'tags:p');
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
