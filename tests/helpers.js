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

/**
 * Like setupMockFiles but includes a file with the same child tag under two different
 * parents in the same file, to exercise within-file multi-parent tag handling.
 *
 * Files:
 *   - meeting-notes.md: #work/project AND #personal/project in the same file
 *   - shopping.txt:     #personal (orphan)
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockFilesMultiParent(page) {
  await page.addInitScript(() => {
    window.showOpenFilePicker = async () => {
      const files = [
        {
          name: 'meeting-notes.md',
          content: '# Quarterly Review\n\nDiscussion points #work/project and #personal/project',
        },
        {
          name: 'shopping.txt',
          content: 'Shopping list\n\nMilk, eggs, bread #personal',
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
 * Mock files designed to produce a case where a tag's global file count differs
 * from its per-parent count. 'project' appears in two files under two different
 * parents ('work' and 'idea'), so its global count is 2 but each parent's count
 * is only 1. The taxonomy should always display the global count.
 *
 * Files:
 *   - file-a.md: #work/project  (project under work)
 *   - file-b.md: #idea/project  (project under idea)
 *   - file-c.md: #personal      (orphan tag)
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockFilesTagCount(page) {
  await page.addInitScript(() => {
    window.showOpenFilePicker = async () => {
      const files = [
        { name: 'file-a.md', content: 'File A #work/project' },
        { name: 'file-b.md', content: 'File B #idea/project' },
        { name: 'file-c.md', content: 'File C #personal' },
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
 * Like setupMockDirectory but adds write support (getFileHandle + createWritable)
 * so that the backup service can write backup.gypsum. The written content is
 * captured in window.__backupFileContent for test assertions.
 *
 * Directory structure:
 *   root/
 *     notes.md  (single file with a tag)
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockDirectoryWithWrite(page) {
  await page.addInitScript(() => {
    window.__backupFileContent = '';

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

      const backupHandle = {
        getFile: async () => ({
          text: async () => window.__backupFileContent,
        }),
        createWritable: async () => ({
          write: async (content) => { window.__backupFileContent = content; },
          close: async () => {},
        }),
      };

      return {
        kind: 'directory',
        name: 'root',
        values: async function* () {
          yield makeFile('notes.md', '# My Notes\nSome content #work/project');
        },
        getFileHandle: async (name, _options) => {
          if (name === 'backup.gypsum') return backupHandle;
          throw new Error(`Unexpected getFileHandle call for: ${name}`);
        },
      };
    };
  });
}

module.exports = { setupMockFiles, setupMockDirectory, setupMockFilesMultiParent, setupMockFilesTagCount, setupMockDirectoryWithWrite };
