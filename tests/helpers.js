/**
 * Injects a mock version of window.showOpenFilePicker into the page
 * before the app's JavaScript runs. This lets tests simulate loading
 * files without triggering the native file picker dialog.
 *
 * The three test files cover the main scenarios:
 *   - meeting-notes.md: has a markdown title, a unique tag (project), unique filename text
 *   - shopping.txt:     plain text file (no markdown title), personal tag
 *   - big-ideas.md:     has a color tag, shares the personal tag with shopping.txt
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockFiles(page) {
  await page.addInitScript(() => {
    window.showOpenFilePicker = async () => {
      const files = [
        {
          name: 'meeting-notes.md',
          content: '# Quarterly Review\n\nDiscussion points for the quarter #work/project',
        },
        {
          name: 'shopping.txt',
          content: 'Shopping list\n\nMilk, eggs, bread #personal',
        },
        {
          name: 'big-ideas.md',
          content: '# Big Ideas\n\nLong term thinking #personal #color/coral',
        },
      ];

      return files.map(({ name, content }) => ({
        getFile: async () => ({
          name,
          size: content.length,
          lastModified: Date.now(),
          text: async () => content,
        }),
      }));
    };
  });
}

/**
 * Injects a mock version of window.showDirectoryPicker into the page
 * before the app's JavaScript runs. Simulates a directory tree with files
 * at multiple levels of nesting to test recursive traversal.
 *
 * Directory structure:
 *   root/
 *     top-level.md        (direct child)
 *     other.txt           (direct child)
 *     subdir/
 *       nested.md         (one level deep)
 *       deep/
 *         very-nested.txt (two levels deep)
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockDirectory(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const makeFile = (name, content) => ({
        kind: 'file',
        name,
        getFile: async () => ({
          name,
          size: content.length,
          lastModified: Date.now(),
          text: async () => content,
        }),
      });
      const makeDir = (name, entries) => ({
        kind: 'directory',
        name,
        values: async function* () { yield* entries; },
      });

      return makeDir('root', [
        makeFile('top-level.md', '# Top Level\n#work/project'),
        makeFile('other.txt', 'Other file'),
        makeDir('subdir', [
          makeFile('nested.md', '# Nested\n#personal'),
          makeDir('deep', [
            makeFile('very-nested.txt', 'Deep file'),
          ]),
        ]),
      ]);
    };
  });
}

module.exports = { setupMockFiles, setupMockDirectory };
