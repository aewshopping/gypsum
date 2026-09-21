const { join } = require('path');
const { pathToFileURL } = require('url');

/**
 * Injects a mock version of window.showDirectoryPicker into the page
 * before the app's JavaScript runs. This lets tests simulate loading
 * files without triggering the native file picker dialog.
 *
 * The three test files cover the main scenarios:
 *   - meeting-notes.md: has a markdown title, a unique tag (project), unique filename text
 *   - shopping.txt:     plain text file (no markdown title), personal tag
 *   - big-ideas.md:     carries a legacy '#color/coral' tag, which is an ordinary tag and colours
 *                       nothing — colour is a front matter key now; shares personal with shopping.txt
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockFiles(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({
          name,
          size: content.length,
          lastModified: Date.now(),
          text: async () => content,
        }),
      });
      return {
        kind: 'directory', name: 'root',
        values: async function* () {
          yield makeFile('meeting-notes.md', '# Quarterly Review\n\nDiscussion points for the quarter #work/project');
          yield makeFile('shopping.txt', 'Shopping list\n\nMilk, eggs, bread #personal');
          yield makeFile('big-ideas.md', '# Big Ideas\n\nLong term thinking #personal #color/coral');
        },
      };
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
        getDirectoryHandle: async (name, _options) => {
          if (name === '.gypsum') return {
            getFileHandle: async (n, _opts) => {
              if (n === 'history.gypsum') return backupHandle;
              throw new Error(`Unexpected getFileHandle call for: ${n}`);
            },
          };
          throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
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
        getDirectoryHandle: async (name, _options) => {
          if (name === '.gypsum') return {
            getFileHandle: async (n, _opts) => {
              if (n === 'history.gypsum') return backupHandle;
              throw new Error(`Unexpected getFileHandle call for: ${n}`);
            },
          };
          throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
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
      getDirectoryHandle: async (name, _options) => {
        if (name === '.gypsum') return {
          getFileHandle: async (n, _opts) => {
            if (n === 'history.gypsum') return backupHandle;
            throw new Error(`Unexpected getFileHandle call for: ${n}`);
          },
        };
        throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
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
    window.__originalFiles = {};
    window.__deletedFiles = {};
    window.__backupFileContent = '';

    const fileContent = '# My Notes\nSome content here';

    // __writeGate lets a test hold the write to the original file open, which is the only way
    // to stand inside a save that is still running — a real disk takes long enough for a click
    // to land there, and these mock writes resolve in a microtask. Unset, it costs nothing.
    const makeFile = (name, content) => ({
      kind: 'file', name,
      getFile: async () => ({
        name, size: content.length, lastModified: Date.now(),
        text: async () => window.__originalFiles[name] ?? content,
      }),
      createWritable: async () => ({
        write: async (c) => {
          if (window.__writeGate) await window.__writeGate;
          window.__originalFiles[name] = c;
        },
        close: async () => {},
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
      getFileHandle: async (name, options) => {
        if (name === 'history.gypsum') return backupHandle;
        // The real API throws NotFoundError for a file that does not exist unless create is
        // set. Creating regardless made every read look like a write to the assertions below.
        if (!(name in window.__savedFiles)) {
          if (!options?.create) throw new Error(`NotFoundError: ${name}`);
          window.__savedFiles[name] = '';
        }
        return {
          getFile: async () => ({ text: async () => window.__savedFiles[name] }),
          createWritable: async () => ({
            write: async (c) => { window.__savedFiles[name] = c; },
            close: async () => {},
          }),
        };
      },
      removeEntry: async (name) => { window.__deletedFiles[name] = true; delete window.__savedFiles[name]; },
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { yield makeFile('notes.md', fileContent); },
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
      getFileHandle: async (name, options) => {
        if (name === 'history.gypsum') return backupHandle;
        // The real API throws NotFoundError for a file that does not exist unless create is
        // set. Creating regardless made every read look like a write to the assertions below.
        if (!(name in window.__savedFiles)) {
          if (!options?.create) throw new Error(`NotFoundError: ${name}`);
          window.__savedFiles[name] = '';
        }
        return {
          getFile: async () => ({ text: async () => window.__savedFiles[name] }),
          createWritable: async () => ({
            write: async (c) => { window.__savedFiles[name] = c; },
            close: async () => {},
          }),
        };
      },
      removeEntry: async (name) => { delete window.__savedFiles[name]; },
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { yield makeFile('notes.md', currentContent); },
      getDirectoryHandle: async (name, _options) => {
        if (name === '.gypsum') return gypsumDirHandle;
        throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
      },
    });
  });
}

/**
 * Directory mock with full delete support. Tracks files written to .gypsum/trash/
 * in window.__trashFiles (name → content string). Also handles history.gypsum
 * for the close-backup entry written by doClose() on delete confirmation.
 *
 * Directory structure:
 *   root/
 *     notes.md  (single file with a tag)
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockDirectoryWithDeleteSupport(page) {
  await page.addInitScript(() => {
    window.__trashFiles = {};
    window.__backupFileContent = '';
    const fileContent = '# My Notes\nSome content here #work/project';
    const makeFile = (name, content) => ({
      kind: 'file', name,
      getFile: async () => ({ name, size: content.length, lastModified: Date.now(), text: async () => content }),
    });
    const backupHandle = {
      getFile: async () => ({ text: async () => window.__backupFileContent }),
      createWritable: async () => ({ write: async (c) => { window.__backupFileContent = c; }, close: async () => {} }),
    };
    const trashDirHandle = {
      getFileHandle: async (name, _options) => {
        if (!(name in window.__trashFiles)) window.__trashFiles[name] = '';
        return {
          getFile: async () => ({ text: async () => window.__trashFiles[name] }),
          createWritable: async () => ({ write: async (c) => { window.__trashFiles[name] = c; }, close: async () => {} }),
        };
      },
    };
    const gypsumDirHandle = {
      getFileHandle: async (name, _options) => {
        if (name === 'history.gypsum') return backupHandle;
        throw new Error(`Unexpected getFileHandle in .gypsum: ${name}`);
      },
      getDirectoryHandle: async (name, _options) => {
        if (name === 'trash') return trashDirHandle;
        throw new Error(`Unexpected getDirectoryHandle in .gypsum: ${name}`);
      },
    };
    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { yield makeFile('notes.md', fileContent); },
      getDirectoryHandle: async (name, _options) => {
        if (name === '.gypsum') return gypsumDirHandle;
        throw new Error(`Unexpected getDirectoryHandle: ${name}`);
      },
    });
  });
}

/**
 * Directory with a file that already carries a colour, with full save support.
 * File: notes.md with content '---\ncolor: {colourName}\n---\n\n# My Notes\nText below'
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [colourName] - The colour, written verbatim after the colon, so pass it the way a
 *   note would hold it: a named colour bare, a hex quoted and carrying its '#'.
 */
async function setupMockDirectoryForColorExisting(page, colourName = 'coral') {
  await page.addInitScript((colour) => {
    window.__savedFiles = {};
    window.__originalFiles = {};
    window.__backupFileContent = '';
    const fileContent = `---\ncolor: ${colour}\n---\n\n# My Notes\nText below`;
    const makeFile = (name, content) => ({
      kind: 'file', name,
      getFile: async () => ({
        name, size: content.length, lastModified: Date.now(),
        text: async () => window.__originalFiles[name] ?? content,
      }),
      createWritable: async () => ({
        write: async (c) => { window.__originalFiles[name] = c; },
        close: async () => {},
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
      getFileHandle: async (name, options) => {
        if (name === 'history.gypsum') return backupHandle;
        // The real API throws NotFoundError for a file that does not exist unless create is
        // set. Creating regardless made every read look like a write to the assertions below.
        if (!(name in window.__savedFiles)) {
          if (!options?.create) throw new Error(`NotFoundError: ${name}`);
          window.__savedFiles[name] = '';
        }
        return {
          getFile: async () => ({ text: async () => window.__savedFiles[name] }),
          createWritable: async () => ({
            write: async (c) => { window.__savedFiles[name] = c; },
            close: async () => {},
          }),
        };
      },
      removeEntry: async (name) => { delete window.__savedFiles[name]; },
    };
    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () { yield makeFile('notes.md', fileContent); },
      getDirectoryHandle: async (name, _options) => {
        if (name === '.gypsum') return gypsumDirHandle;
        throw new Error(`Unexpected: ${name}`);
      },
    });
  }, colourName);
}

/**
 * Injects a mock directory whose notes contain [[internal links]] of every shape the
 * parser has to handle: resolved, path-qualified, aliased, unresolved, extension-less
 * (which must NOT resolve) and one inside a code fence.
 *
 * Directory structure:
 *   root/
 *     hub.md              links out to everything
 *     shopping.txt        link target, also reachable as a bare filename
 *     my long note.md     filename with spaces, for the autocomplete trigger
 *     front-matter-links.md  links declared in YAML values, not in the body
 *     subdir/
 *       nested.md         link target that must be reached path-qualified
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockFilesWithLinks(page) {
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

      const hub = [
        '# Hub',
        '',
        'A plain link to [[shopping.txt]] here.',
        'A path link to [[subdir/nested.md]] here.',
        'An aliased link to [[shopping.txt|groceries]] here.',
        'A broken link to [[does-not-exist.md]] here.',
        'An extensionless link to [[shopping]] here.',
        '',
        '```',
        'a fenced [[fenced-only.md]] link',
        '```',
        '',
        'And `an inline [[inline-only.md]] link` too.',
      ].join('\n');

      return makeDir('root', [
        makeFile('hub.md', hub),
        makeFile('shopping.txt', 'Shopping list\n\nMilk, eggs, bread #personal'),
        makeFile('my long note.md', '# My Long Note\n\nNothing to see.'),
        makeFile('titled-link.md', '# See [[shopping.txt]]\n\nThe link lives in the H1.'),
        makeFile('extensionless.md', [
          '# Extensionless',
          '',
          'A path link to [[subdir/nested]] here.',
          'An aliased link to [[shopping | the groceries]] here.',
          'Both types exist for [[ambig]] here.',
        ].join('\n')),
        makeFile('ambig.txt', 'The .txt one, which an extensionless link should prefer.'),
        makeFile('ambig.md', '# Ambig\n\nThe .md one.'),
        // Both faults at once, so errorOnLoad carries a yaml and a links segment together.
        // Appended, never prepended: myFiles[0] is what registers the properties.
        makeFile('both-faults.md', [
          '---',
          'a line with no colon',
          '---',
          '',
          '# Both Faults',
          '',
          'A broken link to [[also-missing.md]] here.',
        ].join('\n')),
        // Every front matter shape a link can be written in, plus the two that must NOT be
        // read as one. Appended, never prepended, for the same reason as both-faults.md.
        makeFile('front-matter-links.md', [
          '---',
          '# a comment mentioning [[commented.md]]',
          'related: "[[shopping.txt]]"',
          'aliased: "[[ shopping.txt | the groceries ]]"',
          'others:',
          '  - "[[gone-from-front-matter.md]]"',
          '  - [[subdir/nested.md]]',
          'flow: [ "[[ambig.txt]]" ]',
          'prose: see [[titled-link.md]] for more',
          'bare: [[not-detected.md]]',
          'color: "#ffffff"',
          '---',
          '',
          '# Front Matter Links',
          '',
          'No links in the body.',
        ].join('\n')),
        makeDir('subdir', [
          makeFile('nested.md', '# Nested Note\n\nThe nested target. #personal'),
        ]),
      ]);
    };
  });
}

/**
 * Injects a mock version of window.showDirectoryPicker whose files include one with a filename
 * that offers no break opportunities — no spaces, hyphens or slashes. Used to check that a name
 * like that wraps instead of widening the page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockFilesLongName(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({
          name,
          size: content.length,
          lastModified: Date.now(),
          text: async () => content,
        }),
      });
      return {
        kind: 'directory', name: 'root',
        values: async function* () {
          yield makeFile('averyveryextremelylongfilenamewithabsolutelynobreakopportunities.md', '# Long\n\nA note whose filename cannot be broken #personal');
          yield makeFile('shopping.txt', 'Shopping list\n\nMilk, eggs, bread #personal');
          yield makeFile('big-ideas.md', '# Big Ideas\n\nLong term thinking #personal #color/coral');
        },
      };
    };
  });
}

/**
 * Injects a mock version of window.showDirectoryPicker into the page before the app's
 * JavaScript runs. Two of the three files have front matter the forgiving YAML parser cannot
 * fully read, so the load-error nudge and the errorOnLoad property both have something to
 * report.
 *
 *   - broken-yaml.md: two unreadable lines (no colon, and no parent key for the list item)
 *   - half-broken.md: one unreadable line, alongside front matter that parses fine
 *   - clean-yaml.md:  front matter that reads cleanly, so errorOnLoad stays null
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockFilesBrokenYaml(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({
          name,
          size: content.length,
          lastModified: Date.now(),
          text: async () => content,
        }),
      });
      return {
        kind: 'directory', name: 'root',
        values: async function* () {
          yield makeFile('broken-yaml.md', '---\ntitle: Broken Note\nthis line has no colon\n- orphaned list item\n---\n\n# Broken Note\n\nBody text #personal');
          yield makeFile('half-broken.md', '---\ntitle: Half Broken\nalso missing a colon\n---\n\n# Half Broken\n\nBody text #personal');
          yield makeFile('clean-yaml.md', '---\ntitle: Clean Note\npeople:\n  - alice\n---\n\n# Clean Note\n\nBody text #personal');
        },
      };
    };
  });
}

/**
 * Injects a mock picker with three notes whose front matter uses the list shapes the parser
 * learned to read: flush with the key, indented with a tab, and inline in brackets.
 *
 * @param {import('@playwright/test').Page} page
 */
/**
 * Injects a mock picker whose notes carry a `tags` key holding something that is not a tag.
 *
 * Its own helper rather than three more files in setupMockFilesYamlShapes, whose contents existing
 * tests count and assert on.
 *
 * `tags: false` and `tags: null` are the cases a truthiness guard skipped: the guard wrapped the
 * `delete yamlData.tags` as well as the merge, so the key survived into the spread and `file.tags`
 * held a boolean where every view expects the TagMap. A bare `tags:` is the control — the parser
 * emits no key at all for it, so it was never able to break.
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockFilesFalsyTags(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({
          name,
          size: content.length,
          lastModified: Date.now(),
          text: async () => content,
        }),
      });
      return {
        kind: 'directory', name: 'root',
        values: async function* () {
          yield makeFile('false-tags.md', '---\ntags: false\n---\n\n# False\n\nBody text.');
          yield makeFile('null-tags.md', '---\ntags: null\n---\n\n# Null\n\nBody text.');
          yield makeFile('bare-tags.md', '---\ntags:\n---\n\n# Bare\n\nBody #real');
        },
      };
    };
  });
}

async function setupMockFilesYamlShapes(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({
          name,
          size: content.length,
          lastModified: Date.now(),
          text: async () => content,
        }),
      });
      return {
        kind: 'directory', name: 'root',
        values: async function* () {
          yield makeFile('flush.md', '---\nstatus: draft\npeople:\n- alice\n- bob\n---\n\n# Flush\n\nBody text.');
          yield makeFile('tabbed.md', '---\nstatus: done\npeople:\n\t- carol\n---\n\n# Tabbed\n\nBody text.');
          yield makeFile('flow.md', '---\nstatus: live\npeople: ["ada lovelace", alan]\n---\n\n# Flow\n\nBody text.');
        },
      };
    };
  });
}

/**
 * Injects a mock picker where one of three files cannot be read — simulating a file deleted or
 * its permission revoked between the directory being listed and the file being opened. The other
 * two must still load.
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockFilesUnreadable(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({
          name,
          size: content.length,
          lastModified: Date.now(),
          text: async () => content,
        }),
      });
      return {
        kind: 'directory', name: 'root',
        values: async function* () {
          yield makeFile('readable-one.md', '# One\n\nBody text #work');
          yield {
            kind: 'file', name: 'vanished.md',
            getFile: async () => {
              throw new DOMException('A requested file could not be found', 'NotFoundError');
            },
          };
          yield makeFile('readable-two.md', '# Two\n\nBody text #work');
        },
      };
    };
  });
}

/**
 * Injects a mock picker where every file is unreadable, so nothing survives the load. Exercises
 * the same empty-appState path an empty folder takes.
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockFilesAllUnreadable(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () {
        for (const name of ['gone-a.md', 'gone-b.md']) {
          yield {
            kind: 'file', name,
            getFile: async () => {
              throw new DOMException('A requested file could not be found', 'NotFoundError');
            },
          };
        }
      },
    });
  });
}

/**
 * Injects a mock picker with one file whose front matter uses keys that collide with core file
 * object properties. Those keys must be dropped rather than allowed to overwrite app-owned data —
 * a bogus `handle` would break save, rename, delete and content search.
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockFilesShadowingYaml(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const makeFile = (name, content) => ({
        kind: 'file', name,
        getFile: async () => ({
          name,
          size: content.length,
          lastModified: Date.now(),
          text: async () => content,
        }),
      });
      return {
        kind: 'directory', name: 'root',
        values: async function* () {
          yield makeFile('shadow.md', '---\ntitle: Shadowed\nhandle: oops\nfilename: fake.md\n---\n\n# Shadowed\n\nBody #work');
          yield makeFile('normal.md', '# Normal\n\nBody #work');
        },
      };
    };
  });
}

/**
 * Injects a mock picker for an empty folder that supports creating notes: root-level
 * getFileHandle throws for { create: false } — which is how findUnusedFilename settles on
 * note-1.txt — and returns a writable handle for { create: true }.
 *
 * Files created through it persist in window.__createdFiles, so a note survives being re-read
 * by getFileDataAndMetadata after it is written. Sub-directories are supported (the delete path
 * copies into .gypsum/trash first), backed by the same map under a path prefix.
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockEmptyDirectoryWithCreate(page) {
  await page.addInitScript(() => {
    window.__createdFiles = new Map();

    const makeHandle = (path, name) => ({
      kind: 'file', name,
      getFile: async () => {
        const content = window.__createdFiles.get(path) ?? '';
        return {
          name,
          size: content.length,
          lastModified: Date.now(),
          text: async () => content,
        };
      },
      createWritable: async () => ({
        write: async (content) => { window.__createdFiles.set(path, content); },
        close: async () => {},
      }),
    });

    // Only the root directory lists files — sub-directories exist to receive trashed copies,
    // and the app never enumerates them.
    const makeDir = (prefix) => ({
      kind: 'directory', name: prefix || 'root',
      values: async function* () {
        if (prefix) return;
        for (const path of window.__createdFiles.keys()) {
          if (!path.includes('/')) yield makeHandle(path, path);
        }
      },
      getDirectoryHandle: async (name) => makeDir(`${prefix}${name}/`),
      getFileHandle: async (name, options = {}) => {
        const path = `${prefix}${name}`;
        if (options.create) {
          if (!window.__createdFiles.has(path)) window.__createdFiles.set(path, '');
          return makeHandle(path, name);
        }
        if (window.__createdFiles.has(path)) return makeHandle(path, name);
        throw new DOMException(`${name} not found`, 'NotFoundError');
      },
      removeEntry: async (name) => { window.__createdFiles.delete(`${prefix}${name}`); },
    });

    window.showDirectoryPicker = async () => makeDir('');
  });
}

/**
 * Injects a mock window.showDirectoryPicker over a writable folder seeded with two notes,
 * for the create-a-note-from-an-unresolved-link flow. Sub-directories are created on demand
 * and record their files under a path prefix, so a note created at 'a/b/c.txt' shows up in
 * window.__createdFiles under that full path and its folders in window.__createdDirs.
 * Only the root enumerates, which is all the folder load walks.
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockDirectoryWithNoteCreation(page) {
  await page.addInitScript(() => {
    window.__createdFiles = new Map([
      ['hub.md', '# Hub\n\nA link to [[shopping.txt]] here.\n'],
      ['shopping.txt', 'Milk, eggs, bread'],
    ]);
    window.__createdDirs = new Set();

    const makeHandle = (path, name) => ({
      kind: 'file', name,
      getFile: async () => {
        const content = window.__createdFiles.get(path) ?? '';
        return {
          name,
          size: content.length,
          lastModified: Date.now(),
          text: async () => content,
        };
      },
      createWritable: async () => ({
        write: async (content) => { window.__createdFiles.set(path, content); },
        close: async () => {},
      }),
    });

    const makeDir = (prefix) => ({
      kind: 'directory', name: prefix || 'root',
      values: async function* () {
        if (prefix) return;
        for (const path of window.__createdFiles.keys()) {
          if (!path.includes('/')) yield makeHandle(path, path);
        }
      },
      getDirectoryHandle: async (name) => {
        window.__createdDirs.add(`${prefix}${name}`);
        return makeDir(`${prefix}${name}/`);
      },
      // create: true returns an existing file untouched, as the real API does.
      getFileHandle: async (name, options = {}) => {
        const path = `${prefix}${name}`;
        if (window.__createdFiles.has(path)) return makeHandle(path, name);
        if (options.create) {
          window.__createdFiles.set(path, '');
          return makeHandle(path, name);
        }
        throw new DOMException(`${name} not found`, 'NotFoundError');
      },
      removeEntry: async (name) => { window.__createdFiles.delete(`${prefix}${name}`); },
    });

    window.showDirectoryPicker = async () => makeDir('');
  });
}

/**
 * Imports one of the app's modules straight into Node, for a test of a function that has nothing to
 * do with a page.
 *
 * The app is plain ES modules with no bundler, so node can load one as it stands. Reaching a pure
 * function through a browser meant loading the whole app — a hundred-odd requests — for a test that
 * takes a string and returns one: tests/1-data/44-yaml-parser.spec.js and tests/1-data/48-yaml-value-write.spec.js
 * spent about two and a half minutes of the suite's time between them doing that.
 *
 * @param {string} path - Path under public/js, e.g. 'services/file-parsing/yaml-parse.js'.
 * @returns {Promise<object>} The module.
 */
function appModule(modulePath) {
  const url = pathToFileURL(join(__dirname, '../public/js', modulePath)).href;
  // new Function, because Playwright compiles these spec files as CommonJS and rewrites a plain
  // import() into a require(), which cannot load an ES module. This one is compiled at run time,
  // so it is the real import().
  return esmImport(url);
}

const esmImport = new Function('url', 'return import(url)');

/**
 * Turns "animate view changes" on or off, the setting rather than a copy of it.
 *
 * Off is what the suite runs with, and it is a large part of why it runs in the time it does: a
 * view transition holds the page still and uninteractive for the length of its animation, so every
 * click that followed a re-render waited out a second of card animation before Playwright would
 * call the target actionable. The transitions themselves are covered by
 * tests/2-behaviour/50-render-transitions.spec.js, which turns them back on.
 *
 * @param {import('@playwright/test').Page} page
 * @param {boolean} wanted
 */
async function setViewTransitions(page, wanted) {
  await page.evaluate((on) => {
    const box = document.getElementById('view-transitions-enabled');
    if (box) box.checked = on;
  }, wanted);
}

/**
 * Clicks the mock folder picker. The folder button lives inside the recent files panel, so the
 * panel is opened to reach it and closed again afterwards, leaving the app in the state it starts
 * in — otherwise every later measurement would be shifted by the width of an open panel.
 *
 * Animation goes off first, before anything has been rendered — see setViewTransitions.
 *
 * @param {import('@playwright/test').Page} page
 */
async function loadFolder(page) {
  await setViewTransitions(page, false);
  await page.click('#btn-recent-toggle');
  await page.click('[data-action="load-folder"]');
  await page.click('#btn-recent-close');
}

/**
 * Switches to the cards view. The app opens in the peek view, which renders each note's title
 * and content preview but not its filename — tests that identify a note by filename have to
 * ask for the view that shows one.
 *
 * @param {import('@playwright/test').Page} page
 */
async function showFilenames(page) {
  await page.selectOption('#view-select', 'cards');
}


/**
 * Directory mock with layout support: .gypsum/table_layouts.gypsum is readable and writable,
 * and its content is exposed as window.__layoutsFileContent for tests to seed and assert on.
 *
 * Two files with different property sets, so there is more than one column to reorder, hide and
 * measure. Set window.__layoutsFileContent before loadFolder() to start from a saved layout.
 *
 * longProp adds a front matter key long enough to break a row that has no answer for one, for the
 * tests that check the column picker's alignment.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{longProp?: boolean}} [options]
 */
async function setupMockDirectoryWithLayouts(page, { longProp = false } = {}) {
  await page.addInitScript((useLongProp) => {
    window.__layoutsFileContent = '';
    window.__backupFileContent = '';
    window.__longPropName = 'an_extremely_long_user_defined_property_name_indeed';

    const makeFile = (name, content) => ({
      kind: 'file', name,
      getFile: async () => ({
        name, size: content.length, lastModified: Date.now(),
        text: async () => content,
      }),
    });

    const stringHandle = (key) => ({
      getFile: async () => ({ text: async () => window[key] }),
      createWritable: async () => ({
        write: async (c) => { window[key] = c; },
        close: async () => {},
      }),
    });

    const gypsumDirHandle = {
      getFileHandle: async (name, _options) => {
        if (name === 'table_layouts.gypsum') return stringHandle('__layoutsFileContent');
        if (name === 'history.gypsum') return stringHandle('__backupFileContent');
        throw new Error(`Unexpected getFileHandle call for: ${name}`);
      },
      // An empty string is the mock's "no such file": JSON.parse('') throws, which is the same
      // path readLayouts takes for a file that is not there.
      removeEntry: async (name) => {
        if (name === 'table_layouts.gypsum') { window.__layoutsFileContent = ''; return; }
        throw new Error(`Unexpected removeEntry call for: ${name}`);
      },
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () {
        yield makeFile('alpha.md', '# Alpha\nFirst note #work/project');
        const extra = useLongProp ? `${window.__longPropName}: yes\n` : '';
        yield makeFile('beta.md', `---\ndate: 2024-03-02\npeople: [Ada]\n${extra}---\n# Beta\nSecond note`);
      },
      getDirectoryHandle: async (name, _options) => {
        if (name === '.gypsum') return gypsumDirHandle;
        throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
      },
    });
  }, longProp);
}


/**
 * Injects a mock directory shaped for the flowchart view: notes that link to each other through
 * front matter, and the extra keys the options dialog can be pointed at.
 *
 * Neither existing mock would do. setupMockDirectoryWithLayouts has the .gypsum write support that
 * table_layouts.gypsum needs but its notes carry no links, and setupMockFilesWithLinks has the
 * links and no .gypsum handle — so this is the first with both. The layouts file is exposed as
 * window.__layoutsFileContent, exactly as in setupMockDirectoryWithLayouts, and can be seeded
 * before loadFolder().
 *
 * **Every file carries a fixed lastModified**, descending in the order written below, because the
 * default sort is by that field and the tests pin the generated source line for line. With one
 * timestamp shared between them the node numbers shuffled between runs.
 *
 * What each note is for:
 * - crossroads: a list `chapter`, so the first-item rule has something to be wrong about; two
 *   links, with `why` holding their labels for the custom-connectors case
 * - cave: the symbol spelling of a shape, and a link onward
 * - road: a link naming no file, for the unresolved-node branch
 * - deeper: a shape name that is not one, and no links — a leaf inside a subgraph that another
 *   subgraph links to, which is the node that used to get swallowed
 * - loose: no chapter at all, so the ungrouped bucket is never empty
 *
 * @param {import('@playwright/test').Page} page
 */
async function setupMockDirectoryWithFlowchart(page) {
  await page.addInitScript(() => {
    window.__layoutsFileContent = '';
    window.__backupFileContent = '';

    const makeFile = (name, content, lastModified) => ({
      kind: 'file', name,
      getFile: async () => ({ name, size: content.length, lastModified, text: async () => content }),
    });

    const stringHandle = (key) => ({
      getFile: async () => ({ text: async () => window[key] }),
      createWritable: async () => ({
        write: async (c) => { window[key] = c; },
        close: async () => {},
      }),
    });

    const gypsumDirHandle = {
      getFileHandle: async (name, _options) => {
        if (name === 'table_layouts.gypsum') return stringHandle('__layoutsFileContent');
        if (name === 'history.gypsum') return stringHandle('__backupFileContent');
        throw new Error(`Unexpected getFileHandle call for: ${name}`);
      },
      removeEntry: async (name) => {
        if (name === 'table_layouts.gypsum') { window.__layoutsFileContent = ''; return; }
        throw new Error(`Unexpected removeEntry call for: ${name}`);
      },
    };

    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'root',
      values: async function* () {
        yield makeFile('crossroads.md', [
          '---',
          'chapter: [one, draft]',
          'shape: diamond',
          'related:',
          '  - "[[cave.md]]"',
          '  - "[[road.md]]"',
          'why:',
          '  - push the heavy door',
          '  - walk on down the road',
          '---',
          '# The crossroads',
          '',
          'Tagged #story/start here.',
        ].join('\n'), 5000),
        yield makeFile('cave.md', [
          '---',
          'chapter: one',
          'shape: "{}"',
          'related: "[[deeper.md]]"',
          '---',
          '# The cave',
          '',
          'Tagged #story/middle here.',
        ].join('\n'), 4000),
        yield makeFile('road.md', [
          '---',
          'chapter: two',
          'shape: "{ }"',
          'related: "[[missing.md]]"',
          '---',
          '# The long road',
        ].join('\n'), 3000),
        yield makeFile('deeper.md', [
          '---',
          'chapter: two',
          'shape: nonsense',
          '---',
          '# Deeper still',
        ].join('\n'), 2000),
        yield makeFile('loose.md', [
          '---',
          'shape: circle',
          '---',
          '# A note with no chapter',
        ].join('\n'), 1000);
      },
      getDirectoryHandle: async (name, _options) => {
        if (name === '.gypsum') return gypsumDirHandle;
        throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
      },
    });
  });
}

module.exports = { loadFolder, setViewTransitions, appModule, showFilenames, setupMockFiles, setupMockFilesBrokenYaml, setupMockFilesYamlShapes, setupMockFilesFalsyTags, setupMockFilesUnreadable, setupMockFilesAllUnreadable, setupMockFilesShadowingYaml, setupMockEmptyDirectoryWithCreate, setupMockFilesLongName, setupMockDirectoryWithWrite, setupMockDirectoryWithHistory, setupMockDirectoryWithHistoryLinePool, setupMockDirectoryWithSaveSupport, setupMockDirectoryWithHistoryAndSave, setupMockDirectoryWithDeleteSupport, setupMockDirectoryForColorExisting, setupMockFilesWithLinks, setupMockDirectoryWithNoteCreation, setupMockDirectoryWithLayouts, setupMockDirectoryWithFlowchart };
