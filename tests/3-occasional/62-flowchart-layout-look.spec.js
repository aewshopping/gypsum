const { test, expect } = require('@playwright/test');
const { loadFolder, setupMockCellWritingFolder } = require('../helpers');

/**
 * The flowchart's layout, looked at: plans/flowchart-dagre-elk-layout.md.
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

// The awkward cases together: a link to itself, two links to one note, a diamond, a missing note.
const AWKWARD = {
  'loop.md': '---\nshape: diamond\n---\n# Goes round\n\n[[loop.md|again]] [[next.md|once]] [[next.md|twice]]\n',
  'next.md': '# Next\n\n[[nowhere.md|lost]] [[loop.md]]\n',
  'alone.md': '# On its own\n',
};

async function screenshotChart(page, files, testInfo, roles = {}) {
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
  const path = testInfo.outputPath('chart.png');
  await page.locator('#output').screenshot({ path });
  await testInfo.attach('chart', { path, contentType: 'image/png' });
}

test('the mockup chart', async ({ page }, testInfo) => {
  await screenshotChart(page, MOCKUP, testInfo);
});

test('a link to itself, two links to one note, a diamond and a missing note', async ({ page }, testInfo) => {
  await screenshotChart(page, AWKWARD, testInfo, { nodeShape: 'shape' });
});
