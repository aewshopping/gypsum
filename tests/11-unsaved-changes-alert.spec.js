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
    const modal = document.getElementById('file-content-modal');
    modal.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const modal = '#file-content-modal';
const warningDialog = '#modal-unsaved-warning';
const closeBtn = '[data-action="close-file-content-modal"]';
const discardBtn = '[data-action="discard-modal-changes"]';
const keepBtn = '[data-action="keep-modal-editing"]';

test.describe('unsaved changes alert', () => {

  test('no warning dialog when closing without edits via close button', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await page.click(closeBtn);
    await expect(page.locator(modal)).not.toBeVisible();
    await expect(page.locator(warningDialog)).not.toBeVisible();
  });

  test('no warning dialog when closing without edits via Escape', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(modal)).not.toBeVisible();
    await expect(page.locator(warningDialog)).not.toBeVisible();
  });

  test('close button shows warning dialog when there are unsaved edits', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.click(closeBtn);
    await expect(page.locator(warningDialog)).toBeVisible();
    await expect(page.locator(modal)).toBeVisible();
  });

  test('backdrop click shows warning dialog when there are unsaved edits', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await clickBackdrop(page);
    await expect(page.locator(warningDialog)).toBeVisible();
    await expect(page.locator(modal)).toBeVisible();
  });

  test('Escape key shows warning dialog when there are unsaved edits', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(warningDialog)).toBeVisible();
    await expect(page.locator(modal)).toBeVisible();
  });

  test('"Discard changes" closes the warning dialog and the modal', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.click(closeBtn);
    await expect(page.locator(warningDialog)).toBeVisible();
    await page.click(discardBtn);
    await expect(page.locator(warningDialog)).not.toBeVisible();
    await expect(page.locator(modal)).not.toBeVisible();
  });

  test('"Keep editing" closes the warning dialog and leaves the modal open', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.click(closeBtn);
    await expect(page.locator(warningDialog)).toBeVisible();
    await page.click(keepBtn);
    await expect(page.locator(warningDialog)).not.toBeVisible();
    await expect(page.locator(modal)).toBeVisible();
  });

  test('Escape on the warning dialog acts as "Keep editing"', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.keyboard.press('Escape'); // opens warning dialog
    await expect(page.locator(warningDialog)).toBeVisible();
    await page.keyboard.press('Escape'); // closes warning dialog (keep editing)
    await expect(page.locator(warningDialog)).not.toBeVisible();
    await expect(page.locator(modal)).toBeVisible();
  });

  test('warning dialog triggered by backdrop, confirmed by "Discard changes"', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await clickBackdrop(page);
    await expect(page.locator(warningDialog)).toBeVisible();
    await page.click(discardBtn);
    await expect(page.locator(modal)).not.toBeVisible();
  });

  test('warning state resets when modal is reopened after discard', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.click(closeBtn);
    await page.click(discardBtn);
    await expect(page.locator(modal)).not.toBeVisible();

    // Reopen — no warning dialog on a clean open
    await page.locator('.note-grid').first().click();
    await expect(page.locator(modal)).toBeVisible();
    await expect(page.locator(warningDialog)).not.toBeVisible();
    await page.click(closeBtn);
    await expect(page.locator(modal)).not.toBeVisible();
  });

  test('edits are preserved after dismissing the warning dialog with "Keep editing"', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);
    await page.click(closeBtn);
    await page.click(keepBtn);
    // Content should still be the edited version
    const text = await page.locator('#modal-content-text pre').textContent();
    expect(text).toBe('edited content');
  });

  test('beforeunload is prevented when tab/browser is closed with unsaved changes', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    await switchToTxt(page);
    await editContent(page);

    const wasPrevented = await page.evaluate(() => {
      const evt = new Event('beforeunload', { cancelable: true, bubbles: true });
      window.dispatchEvent(evt);
      return evt.defaultPrevented;
    });
    expect(wasPrevented).toBe(true);
  });

  test('beforeunload is not prevented when tab/browser is closed without unsaved changes', async ({ page }) => {
    await setupMockDirectoryWithHistory(page);
    await page.goto('/');
    await openModal(page);
    // No edits made

    const wasPrevented = await page.evaluate(() => {
      const evt = new Event('beforeunload', { cancelable: true, bubbles: true });
      window.dispatchEvent(evt);
      return evt.defaultPrevented;
    });
    expect(wasPrevented).toBe(false);
  });

});
