const { test, expect } = require('@playwright/test');
const { loadFolder, setupMockCellWritingFolder } = require('../helpers');

// A link drawn on the flowchart is written into the note it is dragged from, after a dialog that
// says exactly what will be written. See plans/flowchart-view.md step 5.
const LINKED = {
  'start.md': '---\nrelated: "[[one.md]]"\nwhy: [go left]\n---\n# Start\n\nBody with [[one.md]].\n',
  'one.md': '# One\n',
  'two.md': '# Two\n',
};

const note = (page, name) => page.evaluate(n => window.__files[n], name);
const box = (page, label) => page.locator(`.flowchart-node[aria-label="${label}"]`);

async function openChart(page, roles = {}) {
  await page.setViewportSize({ width: 1200, height: 900 });
  await setupMockCellWritingFolder(page, LINKED);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'flowchart');
  if (Object.keys(roles).length) {
    await page.click('[data-action="open-flowchart-options"]');
    for (const [role, property] of Object.entries(roles)) await page.selectOption(`#flowchart-role-${role}`, property);
    await page.keyboard.press('Escape');
  }
  await page.click('label[for="flowchart_render_toggle"]');
}

/** Drags from one box to another with the mouse, and waits for the dialog. */
async function drag(page, fromLabel, toLabel) {
  const a = await box(page, fromLabel).boundingBox();
  const b = await box(page, toLabel).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

const dialog = page => page.locator('#modal-unsaved-warning');

test('with the default connectors, a drag writes the link into flowChartLink — after the dialog', async ({ page }) => {
  await openChart(page);
  const before = await note(page, 'start.md');

  await drag(page, 'Start', 'Two');
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator('#modal-unsaved-warning-text')).toContainText('flowChartLink: [[two.md]]');
  // Nothing reaches the file until the dialog says so; cancel leaves it untouched and opens nothing.
  await page.click('#modal-unsaved-warning-cancel');
  expect(await note(page, 'start.md')).toBe(before);
  await expect(page.locator('#file-content-modal')).not.toBeVisible();

  await drag(page, 'Start', 'Two');
  await page.click('#modal-unsaved-warning-proceed');
  await expect.poll(() => note(page, 'start.md')).toBe(
    '---\nrelated: "[[one.md]]"\nwhy: [go left]\nflowChartLink:\n  - "[[two.md]]"\n---\n# Start\n\nBody with [[one.md]].\n');

  // The redraw reads the new link back out of the note: a new arrow, and no text — the person adds
  // that in the note.
  await expect(page.locator('.flowchart-edge')).toHaveCount(2);
  await expect(page.locator('.flowchart-edge-label')).toHaveCount(0);

  // One undo puts the note back exactly.
  await page.evaluate(async () => {
    const { reverseBatch } = await import('/public/js/table-undo/undo-stacks.js');
    const { appState } = await import('/public/js/services/store.js');
    await reverseBatch('undo', appState.undoStack.length - 1);
  });
  await expect.poll(() => note(page, 'start.md')).toBe(before);
});

test('a property of the user\'s own: a single value becomes a list, and no text list is touched', async ({ page }) => {
  await openChart(page, { connectors: 'related', connectorText: 'why' });

  await drag(page, 'Start', 'Two');
  await page.click('#modal-unsaved-warning-proceed');
  await expect.poll(() => note(page, 'start.md')).toBe(
    '---\nrelated:\n  - "[[one.md]]"\n  - "[[two.md]]"\nwhy: [go left]\n---\n# Start\n\nBody with [[one.md]].\n');
});

test('a link that already exists is refused with a reason, and nothing is written', async ({ page }) => {
  await openChart(page);
  const before = await note(page, 'start.md');

  await drag(page, 'Start', 'One');
  await expect(page.locator('#output-report')).toContainText('Start already links to One');
  await expect(dialog(page)).not.toBeVisible();
  expect(await note(page, 'start.md')).toBe(before);
});

test('a drag that comes back to its own box, or ends on empty chart, writes nothing and opens nothing', async ({ page }) => {
  await openChart(page);
  const before = await note(page, 'start.md');
  const a = await box(page, 'Start').boundingBox();
  const centre = [a.x + a.width / 2, a.y + a.height / 2];

  await page.mouse.move(...centre);
  await page.mouse.down();
  await page.mouse.move(centre[0] + 200, centre[1] + 150, { steps: 5 });
  await page.mouse.move(...centre, { steps: 5 });
  await page.mouse.up();

  await page.mouse.move(...centre);
  await page.mouse.down();
  await page.mouse.move(centre[0], centre[1] - 400, { steps: 5 });
  await page.mouse.up();

  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator('#file-content-modal')).not.toBeVisible();
  await expect(page.locator('.flowchart-drag-line')).toHaveCount(0);
  expect(await note(page, 'start.md')).toBe(before);
});
