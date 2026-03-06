import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:8000/index.html');
});

test('fullscreen toggle button is visible in modal and works', async ({ page }) => {
  console.log('Starting test...');
  // Mock window.showOpenFilePicker
  await page.addInitScript(() => {
    window.showOpenFilePicker = async () => {
      console.log('Mock showOpenFilePicker called');
      return [
        {
          kind: 'file',
          name: 'test.md',
          getFile: async () => new File(['# Test Content\n\nThis is a test file.'], 'test.md', { type: 'text/markdown' }),
        }
      ];
    };
  });

  // Load files
  console.log('Clicking load files button...');
  await page.click('button[data-click-loadfiles]');

  // Wait for the file to be loaded and rendered in the list
  console.log('Waiting for file card...');
  const fileCard = page.locator('.note-card').first();
  await expect(fileCard).toBeVisible({ timeout: 10000 });

  // Open the modal
  console.log('Opening modal...');
  await fileCard.click();

  const modal = page.locator('#file-content-modal');
  await expect(modal).toBeVisible();

  // Check for the fullscreen button
  console.log('Checking fullscreen button...');
  const fullscreenBtn = modal.locator('button[data-action="toggle-modal-fullscreen"]');
  await expect(fullscreenBtn).toBeVisible();

  // Verify it has the correct icon/text
  await expect(fullscreenBtn).toHaveText('⛶');

  // Mock requestFullscreen on the modal element
  await page.evaluate(() => {
    const modal = document.getElementById('file-content-modal');
    modal.requestFullscreen = async () => {
      console.log('Mock requestFullscreen called');
      Object.defineProperty(document, 'fullscreenElement', {
        value: modal,
        configurable: true
      });
      modal.dispatchEvent(new Event('fullscreenchange', { bubbles: true }));
    };
    document.exitFullscreen = async () => {
      console.log('Mock exitFullscreen called');
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        configurable: true
      });
      document.dispatchEvent(new Event('fullscreenchange', { bubbles: true }));
    };
  });

  // Click fullscreen button
  console.log('Clicking fullscreen button...');
  await fullscreenBtn.click();

  // Check if it's considered fullscreen in our mock
  const isFullscreen = await page.evaluate(() => document.fullscreenElement !== null);
  console.log('Is fullscreen:', isFullscreen);
  expect(isFullscreen).toBe(true);

  // Take screenshot
  console.log('Taking screenshot...');
  await page.screenshot({ path: 'screenshots/fullscreen-modal.png' });

  // Click again to exit
  console.log('Clicking fullscreen button to exit...');
  await fullscreenBtn.click();
  const isNotFullscreen = await page.evaluate(() => document.fullscreenElement === null);
  console.log('Is not fullscreen:', isNotFullscreen);
  expect(isNotFullscreen).toBe(true);
  console.log('Test finished successfully.');
});
