const { test, expect } = require('@playwright/test');
const { setupMockFiles, setupMockFilesMultiParent } = require('./helpers');

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

test('tag filter still works correctly after TagMap change', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await page.click('[data-click-loadfiles]');
  await expect(page.locator('.note-grid')).toHaveCount(3);

  // 'project' is under 'work' — open that parent in the taxonomy sidebar
  await page.click('details.taxon summary:has(code:text("work"))');
  await page.click('[data-action="tag-filter"][data-tag="project"]');

  await expect(page.locator('.note-grid')).toHaveCount(1);
  await expect(page.locator('.note-grid').first()).toContainText('meeting-notes');
});
