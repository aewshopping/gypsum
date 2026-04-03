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
 * so that the backup service can write history.gypsum. The written content is
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
          if (name === 'history.gypsum') return backupHandle;
          throw new Error(`Unexpected getFileHandle call for: ${name}`);
        },
      };
    };
  });
}

/**
 * Directory mock with history.gypsum pre-populated with one historical entry for notes.md.
 * Used to test the history select in the file content modal.
 *
 * Live file content : '# My Notes\nCurrent content today #work'
 * Historical entry  : '# My Notes\nOld content from yesterday'
 *                     timestamp: '2025-01-15T09:30:00.000Z'
 *
 * Directory structure:
 *   root/
 *     notes.md  (current version)
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockDirectoryWithHistory(page) {
  await page.addInitScript(() => {
    const historicalEntry = {
      filepath: 'notes.md',
      filename: 'notes.md',
      content: '# My Notes\nOld content from yesterday',
      timestamp: '2025-01-15T09:30:00.000Z',
      event: 'open',
    };
    window.__backupFileContent = JSON.stringify([historicalEntry], null, 2);

    window.showDirectoryPicker = async () => {
      const currentContent = '# My Notes\nCurrent content today #work';
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
        getFile: async () => ({ text: async () => window.__backupFileContent }),
        createWritable: async () => ({
          write: async (content) => { window.__backupFileContent = content; },
          close: async () => {},
        }),
      };

      return {
        kind: 'directory',
        name: 'root',
        values: async function* () {
          yield makeFile('notes.md', currentContent);
        },
        getFileHandle: async (name, _options) => {
          if (name === 'history.gypsum') return backupHandle;
          throw new Error(`Unexpected getFileHandle call for: ${name}`);
        },
      };
    };
  });
}

/**
 * Directory mock with history.gypsum pre-populated using the line-pool format.
 * Used to test diff highlighting.
 *
 * Line pool:
 *   index 0: "# My Notes"
 *   index 1: "Current content today"
 *   index 2: "Old content from yesterday"
 *
 * Snapshots (oldest-first, readBackupHistory reverses them):
 *   snapshot[0]: lineRefs [0, 2] → "# My Notes\nOld content from yesterday"  (historical)
 *   snapshot[1]: lineRefs [0, 1] → "# My Notes\nCurrent content today"        (matches live file)
 *
 * Live file content: "# My Notes\nCurrent content today"
 *
 * On open, saveBackupEntry deduplicates snapshot[1] (same content → timestamp refresh only).
 * History select therefore shows:
 *   v-1 (index 1): "# My Notes\nCurrent content today"  — on-open reference snapshot
 *   v-2 (index 2): "# My Notes\nOld content from yesterday"  — historical entry
 *
 * When v-2 is selected, the diff compares by string:
 *   - current lines: ["# My Notes", "Current content today"]
 *   - historical lines: ["# My Notes", "Old content from yesterday"]
 *   - "Old content from yesterday" is absent from current → highlighted
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockDirectoryWithHistoryLinePool(page) {
  await page.addInitScript(() => {
    const historyData = {
      lines: ['# My Notes', 'Current content today', 'Old content from yesterday'],
      snapshots: [
        { filepath: 'notes.md', filename: 'notes.md', lineRefs: [0, 2], timestamp: '2025-01-15T09:30:00.000Z', event: 'open' },
        { filepath: 'notes.md', filename: 'notes.md', lineRefs: [0, 1], timestamp: '2025-01-15T10:00:00.000Z', event: 'open' },
      ],
    };
    window.__backupFileContent = JSON.stringify(historyData, null, 2);

    const currentContent = '# My Notes\nCurrent content today';
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
      getFile: async () => ({ text: async () => window.__backupFileContent }),
      createWritable: async () => ({
        write: async (content) => { window.__backupFileContent = content; },
        close: async () => {},
      }),
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory',
      name: 'root',
      values: async function* () {
        yield makeFile('notes.md', currentContent);
      },
      getFileHandle: async (name, _options) => {
        if (name === 'history.gypsum') return backupHandle;
        throw new Error(`Unexpected getFileHandle call for: ${name}`);
      },
    });
  });
}

/**
 * Directory mock with full save support (.gypsum folder).
 * Written files are captured in window.__savedFiles (object: filename → content).
 *
 * File: notes.md with content '# My Notes\nSome content here'
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockDirectoryWithSaveSupport(page) {
  await page.addInitScript(() => {
    window.__savedFiles = {};
    window.__backupFileContent = '';

    const fileContent = '# My Notes\nSome content here';

    const makeFile = (name, content) => ({
      kind: 'file', name,
      getFile: async () => ({
        name, size: content.length, lastModified: Date.now(), text: async () => content,
      }),
    });

    const backupHandle = {
      getFile: async () => ({ text: async () => window.__backupFileContent }),
      createWritable: async () => ({
        write: async (c) => { window.__backupFileContent = c; },
        close: async () => {},
      }),
    };

    const gypsumDirHandle = {
      getFileHandle: async (name, _options) => {
        if (!(name in window.__savedFiles)) window.__savedFiles[name] = '';
        return {
          getFile: async () => ({ text: async () => window.__savedFiles[name] }),
          createWritable: async () => ({
            write: async (c) => { window.__savedFiles[name] = c; },
            close: async () => {},
          }),
        };
      },
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { yield makeFile('notes.md', fileContent); },
      getFileHandle: async (name, _options) => {
        if (name === 'history.gypsum') return backupHandle;
        throw new Error(`Unexpected getFileHandle call for: ${name}`);
      },
      getDirectoryHandle: async (name, _options) => {
        if (name === '.gypsum') return gypsumDirHandle;
        throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
      },
    });
  });
}

/**
 * Like setupMockDirectoryWithSaveSupport but also pre-populates history.gypsum
 * with one historical entry, so the history select has a prior version to navigate to.
 *
 * Live file content    : '# My Notes\nCurrent content today'
 * Historical entry     : '# My Notes\nOld content from yesterday' (2025-01-15T09:30:00.000Z)
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockDirectoryWithHistoryAndSave(page) {
  await page.addInitScript(() => {
    window.__savedFiles = {};

    const historicalEntry = {
      filepath: 'notes.md', filename: 'notes.md',
      content: '# My Notes\nOld content from yesterday',
      timestamp: '2025-01-15T09:30:00.000Z', event: 'open',
    };
    window.__backupFileContent = JSON.stringify([historicalEntry], null, 2);

    const currentContent = '# My Notes\nCurrent content today';

    const makeFile = (name, content) => ({
      kind: 'file', name,
      getFile: async () => ({
        name, size: content.length, lastModified: Date.now(), text: async () => content,
      }),
    });

    const backupHandle = {
      getFile: async () => ({ text: async () => window.__backupFileContent }),
      createWritable: async () => ({
        write: async (c) => { window.__backupFileContent = c; },
        close: async () => {},
      }),
    };

    const gypsumDirHandle = {
      getFileHandle: async (name, _options) => {
        if (!(name in window.__savedFiles)) window.__savedFiles[name] = '';
        return {
          getFile: async () => ({ text: async () => window.__savedFiles[name] }),
          createWritable: async () => ({
            write: async (c) => { window.__savedFiles[name] = c; },
            close: async () => {},
          }),
        };
      },
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { yield makeFile('notes.md', currentContent); },
      getFileHandle: async (name, _options) => {
        if (name === 'history.gypsum') return backupHandle;
        throw new Error(`Unexpected getFileHandle call for: ${name}`);
      },
      getDirectoryHandle: async (name, _options) => {
        if (name === '.gypsum') return gypsumDirHandle;
        throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
      },
    });
  });
}

module.exports = { setupMockFiles, setupMockDirectory, setupMockFilesMultiParent, setupMockFilesTagCount, setupMockDirectoryWithWrite, setupMockDirectoryWithHistory, setupMockDirectoryWithHistoryLinePool, setupMockDirectoryWithSaveSupport, setupMockDirectoryWithHistoryAndSave };
