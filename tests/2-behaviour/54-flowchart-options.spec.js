const { test, expect } = require('@playwright/test');
const { loadFolder, appModule, setupMockDirectoryWithFlowchart } = require('../helpers');

// The chart is one block of text, so the assertions here are the text itself rather than a count of
// things on screen. Pinning it whole is what makes the two-pass ordering — every node declared
// before any arrow — something a change has to notice it is breaking.
const source = page => page.locator('.flowchart-code').textContent();

/** The layouts file as the app has written it, parsed. */
const layoutsFile = page => page.evaluate(() => JSON.parse(window.__layoutsFileContent || '{}'));

async function openFlowchart(page) {
  await page.setViewportSize({ width: 1000, height: 900 });
  await setupMockDirectoryWithFlowchart(page);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'flowchart');
  await expect(page.locator('.flowchart-code')).toBeVisible();
}

/** Points a role at a property — or back at its default with '' — and closes the dialog. */
async function setRole(page, role, property) {
  await page.click('[data-action="open-flowchart-options"]');
  await expect(page.locator('#modal-flowchart-options')).toBeVisible();
  await page.selectOption(`#flowchart-role-${role}`, property);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-flowchart-options')).not.toBeVisible();
}

test('the default chart draws from title and links, and writes nothing', async ({ page }) => {
  await openFlowchart(page);

  expect(await source(page)).toBe([
    'flowchart TD',
    '',
    '  1("The crossroads")',
    '  2("The cave")',
    '  3("The long road")',
    '  4("Deeper still")',
    '  5("A note with no chapter")',
    '',
    '  1 --> 2',
    '  1 --> 3',
    '  2 --> 4',
    '  3 --> u1("missing.md")',
  ].join('\n'));

  // Nothing has been chosen, so there is nothing to record — the same restraint saving a layout
  // shows in not inventing one.
  expect(await page.evaluate(() => window.__layoutsFileContent)).toBe('');
});

// The reason the source is built in two passes at all. Mermaid puts a node in the first subgraph it
// is *mentioned* in, so with the edges interleaved "Deeper still" — linked to from inside s1 before
// its own group is reached — would be drawn inside s1 instead of s2.
test('a subgraph groups its nodes, and a link from another group does not steal one', async ({ page }) => {
  await openFlowchart(page);
  await setRole(page, 'subgraph', 'chapter');

  expect(await source(page)).toBe([
    'flowchart TD',
    '',
    '  subgraph s1["one"]',
    '    1("The crossroads")',
    '    2("The cave")',
    '  end',
    '  subgraph s2["two"]',
    '    3("The long road")',
    '    4("Deeper still")',
    '  end',
    '  5("A note with no chapter")',
    '',
    '  1 --> 2',
    '  1 --> 3',
    '  2 --> 4',
    '  3 --> u1("missing.md")',
  ].join('\n'));
});

// crossroads carries `chapter: [one, draft]`. A node can only be in one subgraph, so the rest of
// the list is ignored rather than making the file a member of two.
test('a list subgraph value groups by its first item', async ({ page }) => {
  await openFlowchart(page);
  await setRole(page, 'subgraph', 'chapter');

  expect(await source(page)).toContain('  subgraph s1["one"]\n    1("The crossroads")');
  expect(await source(page)).not.toContain('draft');
});

// tags is a Map<tagName, {count, parents}>, so the names are its keys. Reading its values would put
// [object Object] in every group — and the table already answers this question with .keys().
test('grouping by tags reads the tag names', async ({ page }) => {
  await openFlowchart(page);
  await setRole(page, 'subgraph', 'tags');

  const text = await source(page);
  expect(text).toContain('subgraph s1["start"]');
  expect(text).toContain('subgraph s2["middle"]');
  expect(text).not.toContain('object Object');
  // the notes with no tags are still drawn, outside any group
  expect(text).toContain('  4("Deeper still")');
});

test('a node shape is named by word or by symbol, and anything else draws round', async ({ page }) => {
  await openFlowchart(page);
  await setRole(page, 'nodeShape', 'shape');

  const text = await source(page);
  expect(text).toContain('1{"The crossroads"}');   // shape: diamond
  expect(text).toContain('2{"The cave"}');         // shape: "{}"
  expect(text).toContain('3{"The long road"}');    // shape: "{ }" — spaces are not part of the mark
  expect(text).toContain('4("Deeper still")');     // shape: nonsense
  expect(text).toContain('5(("A note with no chapter"))'); // shape: circle
});

// internalLink holds targets the app has already stripped; a property the user points the role at
// holds what the note says. Without reading those brackets the whole chart draws as u1, u2, ...
test('connectors can be pointed at a property holding the links as written', async ({ page }) => {
  await openFlowchart(page);
  await setRole(page, 'connectors', 'related');
  await setRole(page, 'connectorText', 'why');

  const text = await source(page);
  expect(text).toContain('  1 -->|"push the heavy door"| 2');
  expect(text).toContain('  1 -->|"walk on down the road"| 3');
  // a target naming no loaded file is still its own node, declared where it is first met
  expect(text).toContain('  3 --> u1("missing.md")');
  expect(text).not.toContain('[[');
});

test('a choice is written at once, and choosing the default takes it back out', async ({ page }) => {
  await openFlowchart(page);
  await setRole(page, 'subgraph', 'chapter');

  await expect.poll(() => page.evaluate(() => window.__layoutsFileContent)).not.toBe('');
  let doc = await layoutsFile(page);
  expect(doc.flowchart).toEqual({ subgraph: 'chapter' });
  // no layout was invented on the user's behalf
  expect(doc.layouts).toEqual({});
  expect(doc.active).toBeNull();

  await setRole(page, 'subgraph', '');

  await expect.poll(async () => (await layoutsFile(page)).flowchart).toEqual({});
  // Polled like the file above: the chart is redrawn by the dialog's close, which a busy machine
  // can finish after the file is written.
  await expect.poll(() => source(page)).not.toContain('subgraph');
});

// Assigning a select a value none of its options carries silently blanks it, which is the trap
// syncSortControls() documents — so a folder that has lost the property must still offer it.
test('a stored property the folder does not carry is still in the select', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await setupMockDirectoryWithFlowchart(page);
  await page.addInitScript(() => {
    window.__layoutsFileContent = JSON.stringify({
      layoutVersion: 2, active: null, layouts: {}, propertyTypes: {},
      flowchart: { subgraph: 'gone-from-every-note' },
    });
  });
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'flowchart');
  await page.click('[data-action="open-flowchart-options"]');

  const select = page.locator('#flowchart-role-subgraph');
  await expect(select).toHaveValue('gone-from-every-note');
  await expect(select.locator('option[value="gone-from-every-note"]')).toContainText('not in this folder');
});

// A pure function, so it needs no browser — the arrangement the yaml specs use.
test('nodeShapeFor reads a name, both marks, or the opening mark alone', async () => {
  const { nodeShapeFor } = await appModule('services/flowchart-options.js');
  const { NODE_SHAPES } = await appModule('constants.js');

  for (const shape of Object.values(NODE_SHAPES)) {
    for (const spelling of [shape.value, shape.open + shape.close, shape.open]) {
      expect(nodeShapeFor(spelling).value).toBe(shape.value);
      expect(nodeShapeFor(spelling.toUpperCase()).value).toBe(shape.value);
      // someone writing the marks out spaces them; mermaid's own syntax does not
      expect(nodeShapeFor([...spelling].join(' ')).value).toBe(shape.value);
    }
  }

  for (const nothing of ['', '   ', null, undefined, 'nonsense', 42, new Map()]) {
    expect(nodeShapeFor(nothing).value).toBe(NODE_SHAPES.ROUND.value);
  }
});

// The SVG: one box per note on the page, behind a switch that outlives a trip to another view.
test('the chart switch draws a box per note, and is remembered across views', async ({ page }) => {
  await openFlowchart(page);
  await page.click('label[for="flowchart_render_toggle"]');

  await expect(page.locator('.flowchart-code')).toHaveCount(0);
  expect(await page.locator('.flowchart-node').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')))).toEqual([
    'The crossroads', 'The cave', 'The long road', 'Deeper still', 'A note with no chapter',
  ]);

  await page.selectOption('#view-select', 'table');
  await page.selectOption('#view-select', 'flowchart');
  await expect(page.locator('.flowchart-node')).toHaveCount(5);

  await page.click('label[for="flowchart_render_toggle"]');
  await expect(page.locator('.flowchart-code')).toBeVisible();
});

// The pan-zoom toggle gates the mouse as well as touch — off, a drag belongs to the notes — and a
// re-render leaves the chart where it was.
test('a mouse drag pans only with pan on, and a re-render keeps the zoom and pan', async ({ page }) => {
  await openFlowchart(page);
  await page.click('label[for="flowchart_render_toggle"]');
  const transform = () => page.locator('.pz-group').getAttribute('transform');

  const drag = async () => {
    const box = await page.locator('.pz-svg').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 4 });
    await page.mouse.up();
  };

  await page.locator('.pz-zoom-input').fill('3');
  await drag();
  expect(await transform()).toBe('scale(3 3) translate(0 0)');

  await page.click('.pz-panzoom-check');
  await drag();
  const panned = await transform();
  expect(panned).not.toContain('translate(0 0)');

  await setRole(page, 'nodeText', 'chapter');
  expect(await transform()).toBe(panned);
  await expect(page.locator('.pz-panzoom-check')).toBeChecked();
});

// A box opens its note on release, by data-action like every other open in the app — and only while
// pan is off, since pan on means the chart is for moving.
test('a press on a box opens its note, and does nothing while pan is on', async ({ page }) => {
  await openFlowchart(page);
  await page.click('label[for="flowchart_render_toggle"]');
  const modal = page.locator('#file-content-modal');

  await page.click('.pz-panzoom-check');
  await page.locator('.flowchart-node[aria-label="The cave"]').click({ force: true });
  await expect(modal).not.toBeVisible();

  await page.click('.pz-panzoom-check');

  // A press that began on empty chart opens nothing where it is let go.
  const box = await page.locator('.flowchart-node[aria-label="The cave"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y - 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(modal).not.toBeVisible();

  await page.locator('.flowchart-node[aria-label="The cave"]').click();
  await expect(modal).toBeVisible();
  await expect(page.locator('#file-content-modal')).toHaveAttribute('data-file-id', /cave/);
});
