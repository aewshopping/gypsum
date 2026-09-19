const { test, expect } = require('@playwright/test');
const {
  setupMockFilesBrokenYaml, setupMockFiles, setupMockFilesUnreadable,
  setupMockFilesAllUnreadable, setupMockFilesShadowingYaml, loadFolder, showFilenames,
} = require('../helpers');

test('unreadable yaml gets an errorOnLoad summary, and the nudge filters to those files', async ({ page }) => {
  await setupMockFilesBrokenYaml(page);
  await page.goto('/');
  await loadFolder(page);

  const errors = await page.evaluate(() =>
    window.appState.myFiles
      .map(file => [file.filename, file.errorOnLoad])
      .sort((a, b) => a[0].localeCompare(b[0]))
  );

  expect(errors).toEqual([
    ['broken-yaml.md', 'yaml: 2 lines skipped'],
    ['clean-yaml.md', null],
    ['half-broken.md', 'yaml: 1 line skipped'],
  ]);

  const nudge = page.locator('#fileCountElement .load-error-nudge');
  await expect(nudge).toHaveText('2 yaml errors');

  await expect(page.locator('.note-grid')).toHaveCount(3);
  await nudge.click();

  await expect(page.locator('.note-grid')).toHaveCount(2);
  await showFilenames(page);
  const names = page.locator('.note-grid [data-prop="filename"]');
  await expect(names).toHaveCount(2);
  const shown = await names.allInnerTexts();
  expect(shown.map(text => text.trim()).sort()).toEqual(['broken-yaml.md', 'half-broken.md']);
});

test('no nudge appears when every file reads cleanly', async ({ page }) => {
  await setupMockFiles(page);
  await page.goto('/');
  await loadFolder(page);

  await expect(page.locator('#fileCountElement')).toContainText('files loaded: 3');
  await expect(page.locator('#fileCountElement .load-error-nudge')).toHaveCount(0);
});

test('front matter cannot overwrite core file properties, and says so', async ({ page }) => {
  await setupMockFilesShadowingYaml(page);
  await page.goto('/');
  await loadFolder(page);

  const shadowed = await page.evaluate(() => {
    const file = window.appState.myFiles.find(f => f.internalId === 'shadow.md');
    return {
      filename: file.filename,
      handleIsString: typeof file.handle === 'string',
      errorOnLoad: file.errorOnLoad,
      title: file.title,
    };
  });

  expect(shadowed.filename).toBe('shadow.md');   // not the 'fake.md' the front matter asked for
  expect(shadowed.handleIsString).toBe(false);   // still a real file handle
  expect(shadowed.errorOnLoad).toBe('yaml: keys "handle", "filename" ignored');
  expect(shadowed.title).toBe('Shadowed');       // title is NOT reserved, so it still applies
});

test('an unreadable file is skipped, and the rest of the folder still loads', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await setupMockFilesUnreadable(page);
  await page.goto('/');
  await loadFolder(page);

  await expect(page.locator('.note-grid')).toHaveCount(2);
  const note = page.locator('#fileCountElement .load-error-note');
  await expect(note).toHaveText('1 unreadable');
  // Unlike the yaml nudge there is nothing to filter to, so it is not clickable
  await expect(note).toHaveAttribute('data-tip', /skipped/);
  expect(await note.getAttribute('data-action')).toBeNull();
  expect(pageErrors).toEqual([]);
});

test('a folder where every file is unreadable loads to empty without crashing', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await setupMockFilesAllUnreadable(page);
  await page.goto('/');
  await loadFolder(page);

  expect(await page.evaluate(() => window.appState.myFiles.length)).toBe(0);
  await expect(page.locator('#fileCountElement')).toContainText('2 unreadable');
  expect(pageErrors).toEqual([]);
});

// ---------------------------------------------------------------- front matter is data, not prose

/**
 * A folder whose front matter blocks hold text that looks like prose: a '#' inside a value, a
 * '[[link]]' inside a value, and a YAML comment at column 0. None of it is the note's.
 */
async function setupMockFilesFrontMatterText(page) {
  await page.addInitScript(() => {
    const files = {
      // The comment comes before the real H1, so it would win if the title were still scanned here.
      'scan.md': '---\n# a comment, not a title\nstatus: "#notatag"\nrelated: "[[ghost.md]]"\n---\n' +
                 '# Real Title\n\nBody #realtag and a link to [[shopping.txt]]\n',
      // Nothing but a comment inside the block, so the title has to fall back past it.
      'comment-only.md': '---\n# just a comment\nkey: value\n---\nPlain first line\n',
      // An H1 above the block is outside it, and still the title.
      'above.md': '# Title Above\n\n---\nday: Monday\n---\n',
      'shopping.txt': 'Shopping list\n',
      'named.md': '---\ncolor: coral\n---\n# Named\n',
      'hex6.md': '---\ncolor: "#ffffff"\n---\n# Hex Six\n',
      'hex4.md': '---\ncolor: "#ffff"\n---\n# Hex Four\n',
    };
    const makeFile = (name, c) => ({
      kind: 'file', name,
      getFile: async () => ({ name, size: c.length, lastModified: Date.now(), text: async () => c }),
    });
    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () {
        for (const [name, content] of Object.entries(files)) yield makeFile(name, content);
      },
      getFileHandle: async () => { throw new Error('no backup'); },
    });
  });

  await page.goto('/');
  await loadFolder(page);
}

/** One file object's fields, by filename. */
const fileFields = (page, filename) => page.evaluate(name => {
  const file = window.appState.myFiles.find(f => f.filename === name);
  return { title: file.title, tags: [...file.tags.keys()], links: file.internalLink, color: file.color };
}, filename);

test('a hash or a link inside front matter is part of a value, not a tag or a link', async ({ page }) => {
  await setupMockFilesFrontMatterText(page);

  const scan = await fileFields(page, 'scan.md');

  // The body's own tag and link are collected as they always were...
  expect(scan.tags).toEqual(['realtag']);
  expect(scan.links).toEqual(['shopping.txt']);

  // ...and the block's are not. `status: "#notatag"` is a value that happens to start with a hash,
  // which is exactly what a hex colour is; `related: "[[ghost.md]]"` is a value, not a link, and it
  // is not counted as broken either.
  expect(scan.tags).not.toContain('notatag');
  expect(scan.links).not.toContain('ghost.md');
});

test('a YAML comment is not the note title, wherever the real one is', async ({ page }) => {
  await setupMockFilesFrontMatterText(page);

  // The comment sits above the H1 in the file, so it used to win.
  expect((await fileFields(page, 'scan.md')).title).toBe('Real Title');

  // With no H1 at all the title falls back past the block, which it always did — the two paths
  // now agree, where before only the fallback skipped the block.
  expect((await fileFields(page, 'comment-only.md')).title).toBe('Plain first line');

  // An H1 above the block is outside it, and unaffected.
  expect((await fileFields(page, 'above.md')).title).toBe('Title Above');
});

test('a colour is a front matter value: a name bare, a hex quoted and carrying its hash', async ({ page }) => {
  await setupMockFilesFrontMatterText(page);

  expect((await fileFields(page, 'named.md')).color).toBe('coral');
  expect((await fileFields(page, 'hex6.md')).color).toBe('#ffffff');
  expect((await fileFields(page, 'hex4.md')).color).toBe('#ffff');   // #RGBA is a CSS colour too

  // And the hash in a colour adds no tag, which is the pair of rules working together: it is only
  // safe to write a '#' into front matter because nothing in there is scanned for tags.
  expect((await fileFields(page, 'hex6.md')).tags).toEqual([]);
});
