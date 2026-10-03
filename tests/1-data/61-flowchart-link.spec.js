const { test, expect } = require('@playwright/test');
const { loadFolder, setupMockCellWritingFolder } = require('../helpers');

// A link drawn on the flowchart is written into the note it is dragged from, after a dialog that
// says exactly what will be written; drawn onto empty chart it makes a new note to link to. See
// plans/completed/flowchart-view.md steps 5 and 6.
const LINKED = {
  'start.md': '---\nrelated: "[[one.md]]"\nwhy: [go left]\n---\n# Start\n\nBody with [[one.md]].\n',
  'one.md': '# One\n',
  'two.md': '# Two\n',
};

const note = (page, name) => page.evaluate(n => window.__files[n], name);
const box = (page, label) => page.locator(`.flowchart-node[aria-label="${label}"]`);

async function openChart(page, roles = {}, files = LINKED) {
  await page.setViewportSize({ width: 1200, height: 900 });
  await setupMockCellWritingFolder(page, files);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'flowchart');
  if (Object.keys(roles).length) {
    await page.click('[data-action="open-flowchart-options"]');
    for (const [role, property] of Object.entries(roles)) await page.selectOption(`#flowchart-role-${role}`, property);
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('.flowchart-node').first()).toBeVisible();
  // Pan starts on; off, a press and a drag reach the notes.
  await page.click('.pz-panzoom-check');
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

test('a drag that comes back to its own box, or ends off the chart, writes nothing and opens nothing', async ({ page }) => {
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

/** A point on the chart's empty background: the <svg> itself, not anything drawn in it. */
async function emptyPoint(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('.flowchart-svg');
    const r = svg.getBoundingClientRect();
    for (let y = r.bottom - 30; y > r.top; y -= 20) {
      for (let x = r.right - 30; x > r.left; x -= 20) {
        if (document.elementFromPoint(x, y) === svg) return [x, y];
      }
    }
    return null;
  });
}

/** Drags from a box to empty chart, and waits for the new note dialog. */
async function dragToEmpty(page, fromLabel) {
  const a = await box(page, fromLabel).boundingBox();
  const to = await emptyPoint(page);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 8 });
  // Over empty chart a stub with a + rides on the line's end; letting go takes it away.
  await expect(page.locator('.flowchart-drag-ghost')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.flowchart-drag-ghost')).toHaveCount(0);
  await expect(page.locator('#modal-flowchart-new-note')).toBeVisible();
}

test('a drag to empty chart makes the next note-N.txt, links it, and opens nothing', async ({ page }) => {
  await openChart(page);
  const before = await note(page, 'start.md');

  await dragToEmpty(page, 'Start');
  const name = page.locator('#flowchart-new-note-name');
  await expect(name).toHaveValue('note-1.txt');
  // The stem is selected, so typing replaces it and keeps the extension.
  expect(await name.evaluate(input => input.value.slice(input.selectionStart, input.selectionEnd))).toBe('note-1');
  await expect(page.locator('#flowchart-new-note-forecast')).toContainText('[[note-1.txt]] to flowChartLink in start.md');

  // Cancel creates nothing and writes nothing.
  await page.click('#modal-flowchart-new-note .btn-action[data-action="flowchart-new-note-cancel"]');
  expect(await note(page, 'note-1.txt')).toBeUndefined();
  expect(await note(page, 'start.md')).toBe(before);

  await dragToEmpty(page, 'Start');
  await page.keyboard.type('idea');
  await page.click('#flowchart-new-note-confirm');

  await expect.poll(() => note(page, 'idea.txt')).toBe('');
  await expect.poll(() => note(page, 'start.md')).toBe(
    '---\nrelated: "[[one.md]]"\nwhy: [go left]\nflowChartLink:\n  - "[[idea.txt]]"\n---\n# Start\n\nBody with [[one.md]].\n');
  // Drawn under its filename, the node text's fallback — no title was written into it.
  await expect(box(page, 'idea.txt')).toBeVisible();
  await expect(page.locator('#file-content-modal')).not.toBeVisible();

  // Undo from the history — the chart's one undo button — takes the link back out; the note stays.
  await expect(page.locator('#table-undo-btn')).toHaveCount(0);
  await page.click('#table-undo-list-btn');
  await page.locator('#undo-list .undo-list-row').first().click();
  await expect.poll(() => note(page, 'start.md')).toBe(before);
  expect(await note(page, 'idea.txt')).toBe('');
});

test('a name a loaded note has is refused in the new note dialog', async ({ page }) => {
  await openChart(page);
  await dragToEmpty(page, 'Start');
  await page.fill('#flowchart-new-note-name', 'Two.md');
  await expect(page.locator('#flowchart-new-note-problem')).toContainText('already exists');
  await expect(page.locator('#flowchart-new-note-confirm')).toBeDisabled();
});

test('filtered out, a new note is still on the chart as a stub, and a stub opens its note', async ({ page }) => {
  await openChart(page);
  await page.fill('#searchbox', 'Start');
  await page.press('#searchbox', 'Enter');
  await expect(page.locator('.flowchart-node')).toHaveCount(1);

  // one.md is filtered out: a stub, labelled as its box would be, which takes a dragged link —
  // refused here only because Start already links to it.
  const stub = page.locator('.flowchart-stub.is-filtered[aria-label="One"]');
  // The filter's row grows in above the chart a moment later, and the drawing scales with the
  // viewer: a drag aimed before that ends is aimed at where the boxes were.
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)));
  const b = await stub.boundingBox();
  const a = await box(page, 'Start').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#output-report')).toContainText('Start already links to');

  await dragToEmpty(page, 'Start');
  await page.click('#flowchart-new-note-confirm');
  await expect(page.locator('.flowchart-stub.is-filtered[aria-label="note-1.txt"]')).toBeVisible();

  await stub.click();
  await expect(page.locator('#file-content-modal')).toBeVisible();
});

test('a press on a note that does not exist creates it where its link looks, and writes no note', async ({ page }) => {
  await openChart(page, {}, { ...LINKED, 'two.md': '# Two\n\nSee [[idea]].\n' });
  const before = await note(page, 'two.md');

  // Its stub is an empty outline reading "+ idea", and the link into it is dashed.
  const stub = page.locator('.flowchart-stub.is-missing[aria-label="idea"]');
  await expect(stub).toContainText('+ idea');
  await expect(page.locator('.flowchart-edge.is-missing')).toHaveCount(1);

  await stub.click();
  await expect(page.locator('#flowchart-new-note-title')).toHaveText('Create linked note');
  // The name is the one the link finds, and cannot be changed.
  await expect(page.locator('#flowchart-new-note-name')).toHaveValue('idea.txt');
  await expect(page.locator('#flowchart-new-note-name')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('#flowchart-new-note-forecast')).toContainText('which “Two” links to already');
  await page.click('#flowchart-new-note-confirm');

  await expect.poll(() => note(page, 'idea.txt')).toBe('');
  expect(await note(page, 'two.md')).toBe(before);
  await expect(page.locator('#output-report')).toContainText('created idea.txt');
  // The link now finds a note: drawn as a box, nothing missing, and nothing opened.
  await expect(box(page, 'idea.txt')).toBeVisible();
  await expect(page.locator('.flowchart-edge.is-missing')).toHaveCount(0);
  await expect(page.locator('#file-content-modal')).not.toBeVisible();
  // The dialog's other use is back to normal: an editable name.
  await dragToEmpty(page, 'Start');
  await expect(page.locator('#flowchart-new-note-name')).toHaveJSProperty('readOnly', false);
});
