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

async function switchToTxt(page) {
  await page.evaluate(() => {
    const t = document.getElementById('render_toggle');
    if (!t.checked) t.click();
  });
  await expect(page.locator('#modal-content-text pre')).toBeVisible();
}

async function editContent(page) {
  await page.evaluate(() => {
    const pre = document.querySelector('#modal-content-text pre');
    pre.textContent = 'edited content';
    pre.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function clickBackdrop(page) {
  await page.evaluate(() => {
    document.getElementById('file-content-modal')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const modal = '#file-content-modal';
const warning = '#modal-unsaved-warning';
const closeBtn = '[data-action="close-file-content-modal"]';

test.describe('unsaved changes alert', () => {

  test('no warning when closing without edits via close button', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await page.click(closeBtn);
    await expect(page.locator(modal)).not.toBeVisible();
    await expect(page.locator(warning)).not.toBeVisible();
  });

  test('no warning when closing without edits via Escape', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(modal)).not.toBeVisible();
    await expect(page.locator(warning)).not.toBeVisible();
  });

  test('close button shows warning and keeps modal open when there are unsaved edits', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.click(closeBtn);
    await expect(page.locator(warning)).toBeVisible();
    await expect(page.locator(modal)).toBeVisible();
  });

  test('backdrop click shows warning and keeps modal open when there are unsaved edits', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await clickBackdrop(page);
    await expect(page.locator(warning)).toBeVisible();
    await expect(page.locator(modal)).toBeVisible();
  });

  test('Escape key shows warning and keeps modal open when there are unsaved edits', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(warning)).toBeVisible();
    await expect(page.locator(modal)).toBeVisible();
  });

  test('second close button click discards changes and closes', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.click(closeBtn); // first: warning
    await page.click(closeBtn); // second: discard
    await expect(page.locator(modal)).not.toBeVisible();
    await expect(page.locator(warning)).not.toBeVisible();
  });

  test('second backdrop click discards changes and closes', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await clickBackdrop(page); // first: warning
    await clickBackdrop(page); // second: discard
    await expect(page.locator(modal)).not.toBeVisible();
    await expect(page.locator(warning)).not.toBeVisible();
  });

  test('second Escape key press discards changes and closes', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.keyboard.press('Escape'); // first: warning
    await page.keyboard.press('Escape'); // second: discard
    await expect(page.locator(modal)).not.toBeVisible();
    await expect(page.locator(warning)).not.toBeVisible();
  });

  test('warning triggered by close button, confirmed by Escape', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.click(closeBtn);          // first: warning
    await page.keyboard.press('Escape'); // second: discard
    await expect(page.locator(modal)).not.toBeVisible();
  });

  test('warning triggered by Escape, confirmed by close button', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.keyboard.press('Escape'); // first: warning
    await page.click(closeBtn);          // second: discard
    await expect(page.locator(modal)).not.toBeVisible();
  });

  test('warning state resets when modal is reopened', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.click(closeBtn); // first: warning
    await page.click(closeBtn); // second: closes
    await expect(page.locator(modal)).not.toBeVisible();

    // Reopen — pendingClose and warning should be reset
    await page.locator('.note-grid').first().click();
    await expect(page.locator(modal)).toBeVisible();
    await expect(page.locator(warning)).not.toBeVisible();
    await page.click(closeBtn);
    await expect(page.locator(modal)).not.toBeVisible();
  });

});
