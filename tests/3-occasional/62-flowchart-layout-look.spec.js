const { test, expect } = require('@playwright/test');
const { loadFolder, setupMockCellWritingFolder } = require('../helpers');

/**
 * The flowchart's layout, looked at: plans/completed/flowchart-dagre-elk-layout.md.
 *
 * Nothing here asserts pixels. Each test draws a chart and attaches a screenshot, to be compared by
 * eye with plans/reference/flowchart-layout-mockup.png at each of the plan's pauses — what can be said
 * about a layout in numbers is said in tests/2-behaviour/62-flowchart-layout.spec.js.
 */

// The chart in the mockup, as notes: titles from each H1, links and their text from the body.
const MOCKUP = {
  '001.md': '# 001 The best birthday\n\n[[002.md|other presents first]] [[003.md|try to fix]]\n',
  '002.md': '# 002 The robot can wait\n\n[[003.md|try to fix the robot]]\n',
  '003.md': '# 003 Robot fix\n\n[[005.md|open chest panel]] [[006.md|press silver button]] [[004.md|screwdriver in belly button]]\n',
  '004.md': '# 004 Bodge job\n\n[[003.md|try to fix robot]]\n',
  '005.md': '# 005 Gibberish\n\n[[003.md|try to fix robot]]\n',
  '006.md': '# 006 The robot\n',
};

// The same chart in two subgraphs, with 006 in neither: links cross both borders, both ways.
const CHAPTERS = { '001.md': 'birthday', '002.md': 'birthday', '003.md': 'the robot', '004.md': 'the robot', '005.md': 'the robot' };
const GROUPED = Object.fromEntries(Object.entries(MOCKUP).map(([name, text]) =>
  [name, CHAPTERS[name] ? `---\nchapter: ${CHAPTERS[name]}\n---\n${text}` : text]));

// The same chart all in one subgraph, 006 linking twice to a note that does not exist.
const ONE_GROUP = Object.fromEntries(Object.entries(MOCKUP).map(([name, text]) =>
  [name, `---\nchapter: part1\n---\n${text}${name === '006.md' ? '\n[[gone.md]] [[gone.md|again]]\n' : ''}`]));

// Most notes in no subgraph, linking to each other and into and out of the two that exist.
const MIXED = {
  'start.md': '# Start here\n\n[[plan.md|make a plan]] [[shop.md|go shopping]]\n',
  'plan.md': '# The plan\n\n[[chop.md|first chop]] [[weed.md|then weed]]\n',
  'shop.md': '# Shopping\n\n[[cook.md|bring it home]]\n',
  'chop.md': '---\nchapter: kitchen\n---\n# Chop onions\n\n[[cook.md|then]]\n',
  'cook.md': '---\nchapter: kitchen\n---\n# Cook dinner\n\n[[eat.md|serve]]\n',
  'weed.md': '---\nchapter: garden\n---\n# Weed the beds\n\n[[eat.md|come in]]\n',
  'eat.md': '# Eat\n\n[[start.md|tomorrow]]\n',
};

// plans/reference/flowchart-layout-mockup-2-vertical-alignment.png, in two subgraphs: two chains and a spine.
const part = (title, links, chapter = 'part1') => `---\nchapter: ${chapter}\n---\n# ${title}\n\n${links}\n`;
const ALIGNMENT = {
  '001.md': part('001 The best birthday', '[[002.md|other presents first]] [[003.md|try to fix]]'),
  '002.md': part('002 The robot can wait', '[[003.md|try to fix the robot]]'),
  '003.md': part('003 Robot fix', '[[005.md|open chest panel]] [[006.md|press silver button]] [[004.md|screwdriver in belly button]]'),
  '004.md': part('004 Bodge job', '[[003.md|try to fix robot]]'),
  '005.md': part('005 Gibberish', '[[003.md|try to fix robot]]'),
  '006.md': part('006 Activating the robot', '[[008.md|brush teeth]] [[007.md|tidy room]]'),
  '007.md': part('007 robo clean', '[[011.md|brush teeth]]'),
  '008.md': part('008 teeth brush', '[[010.md|robo clean]]'),
  '009.md': part('009 secret message', '[[012.md|go to the chevin]]'),
  '010.md': part('010 robo clean', '[[009.md|secret message]]'),
  '011.md': part('011 brush teeth', '[[009.md|secret message]]'),
  '012.md': part('012 at the chevin', '', 'part2'),
};

// Three subgraphs linked to each other and to notes in none, one link climbing back up.
const ch = (chapter, title, links) => `---\nchapter: ${chapter}\n---\n# ${title}\n\n${links}\n`;
const THREE = {
  'a.md': ch('setup', 'Arrive', '[[b.md|look round]] [[c.md|go in]]'),
  'b.md': ch('setup', 'Look round', '[[d.md|find a key]]'),
  'c.md': ch('middle', 'The hall', '[[e.md|upstairs]] [[d.md|cellar]]'),
  'd.md': ch('middle', 'The cellar', '[[e.md|climb]] [[g.md|tunnel]]'),
  'e.md': ch('middle', 'Upstairs', '[[f.md|the attic]]'),
  'f.md': ch('ending', 'The attic', '[[g.md|jump]]'),
  'g.md': ch('ending', 'Outside', '[[a.md|start again]]'),
  'x.md': '# A side room\n\n[[c.md|back to the hall]]\n',
  'y.md': '# A note\n\n[[f.md|up]] [[x.md]]\n',
};

// The awkward cases together: a link to itself, two links to one note, a diamond, a missing note.
const AWKWARD = {
  'loop.md': '---\nshape: diamond\n---\n# Goes round\n\n[[loop.md|again]] [[next.md|once]] [[next.md|twice]]\n',
  'next.md': '# Next\n\n[[nowhere.md|lost]] [[loop.md]]\n',
  'alone.md': '# On its own\n',
};

async function screenshotChart(page, files, testInfo, roles = {}, theme = null, layout = {}) {
  await page.setViewportSize({ width: 1200, height: 900 });
  await setupMockCellWritingFolder(page, files);
  await page.goto('/');
  await loadFolder(page);
  await page.selectOption('#view-select', 'flowchart');
  if (Object.keys(roles).length || Object.keys(layout).length) {
    await page.click('[data-action="open-flowchart-options"]');
    for (const [role, property] of Object.entries(roles)) await page.selectOption(`#flowchart-role-${role}`, property);
    for (const [setting, value] of Object.entries(layout)) await page.selectOption(`#flowchart-layout-${setting}`, value);
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('.flowchart-node').first()).toBeVisible();
  if (theme) await page.evaluate(id => { document.getElementById(id).checked = true; }, theme);
  const path = testInfo.outputPath('chart.png');
  await page.locator('#output').screenshot({ path });
  await testInfo.attach('chart', { path, contentType: 'image/png' });
}

test('the mockup chart', async ({ page }, testInfo) => {
  await screenshotChart(page, MOCKUP, testInfo);
});

test('the alignment reference: chains in columns, a spine down the middle', async ({ page }, testInfo) => {
  await screenshotChart(page, ALIGNMENT, testInfo, { subgraph: 'chapter' });
});

test('a link to itself, two links to one note, a diamond and a missing note', async ({ page }, testInfo) => {
  await screenshotChart(page, AWKWARD, testInfo, { nodeShape: 'shape' });
});

test('the mockup chart in two subgraphs', async ({ page }, testInfo) => {
  await screenshotChart(page, GROUPED, testInfo, { subgraph: 'chapter' });
});

test('the mockup chart all in one subgraph', async ({ page }, testInfo) => {
  await screenshotChart(page, ONE_GROUP, testInfo, { subgraph: 'chapter' });
});

test('most notes in no subgraph, linking into and out of two', async ({ page }, testInfo) => {
  await screenshotChart(page, MIXED, testInfo, { subgraph: 'chapter' });
});

for (const theme of ['glow', 'calm']) {
  test(`subgraphs in the ${theme} theme`, async ({ page }, testInfo) => {
    await screenshotChart(page, MIXED, testInfo, { subgraph: 'chapter' }, theme);
  });
}

test('the mockup chart left to right', async ({ page }, testInfo) => {
  await screenshotChart(page, MOCKUP, testInfo, {}, null, { direction: 'LR' });
});

test('the mockup chart with arrows merged', async ({ page }, testInfo) => {
  await screenshotChart(page, MOCKUP, testInfo, {}, null, { merge: 'true' });
});

test('three subgraphs linked to each other and to notes in none', async ({ page }, testInfo) => {
  await screenshotChart(page, THREE, testInfo, { subgraph: 'chapter' });
});

test('three subgraphs with arrows merged', async ({ page }, testInfo) => {
  await screenshotChart(page, THREE, testInfo, { subgraph: 'chapter' }, null, { merge: 'true' });
});

test('subgraphs left to right', async ({ page }, testInfo) => {
  await screenshotChart(page, MIXED, testInfo, { subgraph: 'chapter' }, null, { direction: 'LR' });
});
