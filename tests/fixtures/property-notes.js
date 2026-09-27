/**
 * The notes a folder-wide property change is tested against — a column delete
 * (tests/1-data/54-delete-property.spec.js) and a rename (57-rename-property.spec.js), and the node
 * test of a rename's bytes in 49-table-cell-writing.spec.js. Shared, because each shape is a way the
 * bytes around a key can go wrong, and a shape added for one should be tried by the others.
 *
 * What each note is for is said in the delete spec's header. RENAME_NOTES adds three shapes a rename
 * cares about more than a delete does, since a rename has to put the key back where it was:
 *   commented.md — a comment above the key, one on an item, and one after the list's last item.
 *   crowded.md   — a blank line and a comment between the key above and `people`: a gap of three.
 *   first.md     — `people` the first key, with a blank line under the opening separator.
 * They are kept apart from NOTES so the delete spec's counts are not moved by them.
 */
const NOTES = {
  'flow.md': '---\nstatus: draft\npeople: [ann, bob]\nnote: x\n---\n# Flow\n',
  'block.md': '---\nkind: x\npeople:\n    - ann\n    - bob\n# after the list\nstatus: live\n---\n# Block\n',
  'quoted.md': '---\npeople: "ann, bob"\nstatus: draft\n---\n# Quoted\n',
  'last.md': '---\nstatus: draft\npeople: ann\n---\n# Last\n',
  'only.md': '---\npeople: ann\n---\n# Only\n',
  'bare.md': '---\nstatus: draft\npeople:\nnote: y\n---\n# Bare\n',
  'crlf.md': '---\r\nstatus: draft\r\npeople:\r\n  - ann\r\n  - bob\r\nnote: z\r\n---\r\n# Crlf\r\n',
  'lookalike.md': '---\npeoples: a\nPeople: b\npeople2: c\n---\n# Lookalike\n\npeople: x\n',
  'none.md': '# None\n\nNo front matter.\n',
  'broken.md': '---\npeople: ann\nthis line has no colon\n---\n# Broken\n',
  'shadow.md': '---\npeople: ann\nfilename: fake.md\n---\n# Shadow\n',
  'dup.md': '---\npeople: ann\nstatus: draft\npeople:\n  - bob\n---\n# Dup\n',
  'nokey.md': '---\nstatus: draft\n---\n# Nokey\n',
};

const RENAME_NOTES = {
  ...NOTES,
  'commented.md': '---\ntitle: Planning\n# who came\npeople:\n  - ann   # chair\n  - bob\n# end of list\nstatus: draft\n---\n# Commented\n',
  'crowded.md': '---\nkind: x\n\n# people below\n\npeople: [ann]\nstatus: draft\n---\n# Crowded\n',
  'first.md': '---\n\npeople: ann\nstatus: draft\n---\n# First\n',
};

/**
 * A folder of `notes` behind a mock of the File System Access API that records what is read and
 * written. The mock records every write per file, can fail a named file's write (verify fails), make
 * it throw — at once, or only once another note has been written — or make the read that verifies it
 * throw once after the write has landed, and runs window.__betweenPasses when a journal reaches
 * undo.gypsum: the moment between the plan pass and the write pass. The journal it waits for is the
 * batch kind in window.__betweenPassesKind, 'delete-property' unless a test says otherwise.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, string>} [notes]
 * @returns {Promise<void>}
 */
async function setupPropertyFolder(page, notes = NOTES) {
  await page.addInitScript((notes) => {
    window.__files = { ...notes };
    window.__saved = {};
    window.__writes = {};
    window.__reads = {};
    window.__failWrite = new Set();
    window.__throwWrite = new Set();
    window.__throwLater = new Set();
    window.__throwVerify = new Set();
    window.__pickerCalls = 0;

    const mk = (name) => ({
      kind: 'file', name,
      getFile: async () => {
        window.__reads[name] = (window.__reads[name] ?? 0) + 1;
        if (!(name in window.__files)) throw Object.assign(new Error('gone'), { name: 'NotFoundError' });
        if (window.__writes[name] && window.__throwVerify.delete(name)) {
          throw Object.assign(new Error('state cached in an interface object'), { name: 'InvalidStateError' });
        }
        return {
          name, size: window.__files[name].length, lastModified: Date.now(),
          text: async () => window.__files[name],
        };
      },
      createWritable: async () => {
        if (window.__throwWrite.has(name)) throw new Error(`the write of ${name} died`);
        if (window.__throwLater.has(name)) {
          while (Object.keys(window.__writes).length === 0) await new Promise(r => setTimeout(r, 5));
          throw new Error(`the write of ${name} died`);
        }
        return {
          write: async (content) => {
            window.__writes[name] = (window.__writes[name] ?? 0) + 1;
            if (!window.__failWrite.has(name)) window.__files[name] = content;
          },
          close: async () => {},
        };
      },
    });

    const gypsumDir = {
      getFileHandle: async (name, options) => {
        if (!(name in window.__saved)) {
          if (!options?.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
          window.__saved[name] = '';
        }
        return {
          getFile: async () => ({ text: async () => window.__saved[name] }),
          createWritable: async () => ({
            write: async (content) => {
              window.__saved[name] = content;
              if (name === 'undo.gypsum' && content.includes(window.__betweenPassesKind ?? 'delete-property') && window.__betweenPasses) {
                const hook = window.__betweenPasses;
                window.__betweenPasses = null;
                await hook();
              }
            },
            close: async () => {},
          }),
        };
      },
      removeEntry: async (name) => { delete window.__saved[name]; },
    };

    window.showDirectoryPicker = async () => {
      window.__pickerCalls++;
      return {
        kind: 'directory', name: 'root',
        values: async function* () { for (const name of Object.keys(window.__files)) yield mk(name); },
        getDirectoryHandle: async (name) => {
          if (name === '.gypsum') return gypsumDir;
          throw new Error(`Unexpected getDirectoryHandle call for: ${name}`);
        },
      };
    };
  }, notes);
}

module.exports = { NOTES, RENAME_NOTES, setupPropertyFolder };
