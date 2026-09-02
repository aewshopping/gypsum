const { test, expect } = require('@playwright/test');
const { setupMockFiles, loadFolder } = require('./helpers');

// One load, every structural assertion. The tag-filter behaviour these structures feed
// is covered by 04-tag-filtering.spec.js.
test('tags parse into a Map and a parent map with the right shape', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);
  await expect(page.locator('.note-grid')).toHaveCount(3);

  const shape = await page.evaluate(() => {
    const file = window.appState.myFiles.find(f => f.filename === 'meeting-notes.md');
    const entry = file.tags.get('project');
    const pm = window.appState.myParentMap;
    return {
      tagsIsMap: file.tags instanceof Map,
      projectCount: entry?.count ?? null,
      projectParents: entry ? [...entry.parents] : null,
      hasWork: pm.has('work'),
      workHasProject: pm.get('work')?.has('project') ?? false,
      workProjectCount: pm.get('work')?.get('project') ?? 0,
      allHasProject: pm.get('all')?.has('project') ?? false,
      allHasPersonal: pm.get('all')?.has('personal') ?? false,
      // 'personal' only ever appears as #personal, with no named parent
      personalIsOrphan: pm.get('orphan')?.has('personal') ?? false,
    };
  });

  expect(shape.projectParents).toContain('work');
  delete shape.projectParents;
  expect(shape).toEqual({
    tagsIsMap: true,
    projectCount: 1,
    hasWork: true,
    workHasProject: true,
    workProjectCount: 1,
    allHasProject: true,
    allHasPersonal: true,
    personalIsOrphan: true,
  });
});
