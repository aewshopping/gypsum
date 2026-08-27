const { test, expect } = require('@playwright/test');

// A <dialog> is display:none until opened. Styling #modal-history with an unconditional
// `display: flex` overrode that and put the modal on the landing page — this pins the fix.
test('the history modal is not on screen until it is opened', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#modal-history')).not.toBeVisible();
  await expect(page.locator('#modal-settings')).not.toBeVisible();
});
