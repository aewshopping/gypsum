const { test, expect } = require('@playwright/test');
const { setupMockFiles, setupMockFilesMultiParent, setupMockFilesTagCount } = require('./helpers');

test('file.tags is a Map after loading', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await page.click('[data-click-loadfiles]');
  await expect(page.locator('.note-grid')).toHaveCount(3);

  const tagsIsMap = await page.evaluate(() => {
    const file = window.appState.myFiles.find(f => f.filename === 'meeting-notes.md');
    return file.tags instanceof Map;
  });
  expect(tagsIsMap).toBe(true);
});

test('file.tags Map has correct entries for a hierarchical tag', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await page.click('[data-click-loadfiles]');
  await expect(page.locator('.note-grid')).toHaveCount(3);

  const tagEntry = await page.evaluate(() => {
    const file = window.appState.myFiles.find(f => f.filename === 'meeting-notes.md');
    const entry = file.tags.get('project');
    return entry ? { count: entry.count, parents: [...entry.parents] } : null;
  });
  expect(tagEntry).not.toBeNull();
  expect(tagEntry.count).toBe(1);
  expect(tagEntry.parents).toContain('work');
});

test('file.tags captures multiple parents for the same child tag within one file', async ({ page }) => {
  await setupMockFilesMultiParent(page);
  await page.goto('/');
  await page.click('[data-click-loadfiles]');
  await expect(page.locator('.note-grid')).toHaveCount(2);

  const parents = await page.evaluate(() => {
    const file = window.appState.myFiles.find(f => f.filename === 'meeting-notes.md');
    const entry = file.tags.get('project');
    return entry ? [...entry.parents].sort() : null;
  });
  expect(parents).toEqual(['personal', 'work']);
});

test('appState.myParentMap is built with correct parent/child structure', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await page.click('[data-click-loadfiles]');
  await expect(page.locator('.note-grid')).toHaveCount(3);

  const mapInfo = await page.evaluate(() => {
    const pm = window.appState.myParentMap;
    return {
      hasWork: pm.has('work'),
      workHasProject: pm.get('work')?.has('project') ?? false,
      workProjectCount: pm.get('work')?.get('project') ?? 0,
      allHasProject: pm.get('all')?.has('project') ?? false,
      allHasPersonal: pm.get('all')?.has('personal') ?? false,
    };
  });
  expect(mapInfo.hasWork).toBe(true);
  expect(mapInfo.workHasProject).toBe(true);
  expect(mapInfo.workProjectCount).toBe(1);
  expect(mapInfo.allHasProject).toBe(true);
  expect(mapInfo.allHasPersonal).toBe(true);
});

test('orphan tags appear under orphan key in myParentMap', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await page.click('[data-click-loadfiles]');
  await expect(page.locator('.note-grid')).toHaveCount(3);

  // 'personal' only ever appears as #personal (no named parent), so it should be an orphan
  const isOrphan = await page.evaluate(() => {
    const pm = window.appState.myParentMap;
    return pm.get('orphan')?.has('personal') ?? false;
  });
  expect(isOrphan).toBe(true);
});

test('taxonomy displays global file count for a tag, not the per-parent count', async ({ page }) => {
  // 'project' appears in 2 files (under 'work' and 'idea' separately).
  // Per-parent count = 1 each. Global count = 2.
  // Each parent section must show (2), not (1).
  await setupMockFilesTagCount(page);
  await page.goto('/');
  await page.click('[data-click-loadfiles]');
  await expect(page.locator('.note-grid')).toHaveCount(3);

  // Show the taxonomy, then open parent sections to check counts
  await page.click('[data-action="show-tag-taxonomy"]');
  await page.click('details.taxon summary:has(code:text("work"))');
  await expect(
    page.locator('#tag_output [data-tag="project"]').first()
  ).toContainText('(2)');

  // Open 'idea' section and confirm the same global count there
  await page.click('details.taxon summary:has(code:text("idea"))');
  await expect(
    page.locator('#tag_output [data-tag="project"]').nth(1)
  ).toContainText('(2)');
});

test('tag filter still works correctly after TagMap change', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await page.click('[data-click-loadfiles]');
  await expect(page.locator('.note-grid')).toHaveCount(3);

  // Show the taxonomy, then open 'work' to reveal 'project'
  await page.click('[data-action="show-tag-taxonomy"]');
  await page.click('details.taxon summary:has(code:text("work"))');
  await page.click('[data-action="tag-filter"][data-tag="project"]');

  await expect(page.locator('.note-grid')).toHaveCount(1);
  await expect(page.locator('.note-grid').first()).toContainText('meeting-notes');
});
