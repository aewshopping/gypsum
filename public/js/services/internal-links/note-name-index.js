import { appState } from '../store.js';

let _index = null;

/**
 * Builds the lookup maps and the picker list in one pass over appState.myFiles.
 * Two maps are kept because a link may be written either path-qualified
 * ('work/notes.md', which is the internalId itself) or as a bare filename
 * ('notes.md'). Both are keyed lowercase so matching is case-insensitive.
 * @returns {{byPath: Map<string, string>, byFilename: Map<string, string>, names: string[]}}
 */
function build() {
    const byPath = new Map();
    const byFilename = new Map();
    const clashes = new Set();

    for (const file of appState.myFiles) {
        byPath.set(file.filepath.toLowerCase(), file.internalId);

        const key = file.filename.toLowerCase();
        const existing = byFilename.get(key);
        if (existing === undefined) {
            byFilename.set(key, file.internalId);
            continue;
        }
        // Two files share a filename. Shortest path wins, ties broken alphabetically —
        // an arbitrary but stable choice, so a bare link always resolves to the same file.
        clashes.add(key);
        if (file.filepath.length < existing.length ||
            (file.filepath.length === existing.length && file.filepath < existing)) {
            byFilename.set(key, file.internalId);
        }
    }

    // Offer the bare filename where it is unique, the full path where it is not, so every
    // entry the picker inserts resolves back to exactly the file it was chosen from.
    const names = appState.myFiles
        .map(file => clashes.has(file.filename.toLowerCase()) ? file.filepath : file.filename)
        .sort((a, b) => a.localeCompare(b));

    return { byPath, byFilename, names };
}

/**
 * Returns the alphabetically sorted list of link names to offer in the note picker.
 * Extensions are included — a link is always written with one.
 * Result is cached until invalidateNoteNameIndex() is called.
 * @returns {string[]}
 */
export function getNoteNameArray() {
    if (!_index) _index = build();
    return _index.names;
}

/**
 * Resolves the text inside [[...]] to a file's internalId.
 * Tries the full path first so 'work/notes.md' beats a root-level 'notes.md'.
 * Matching is exact apart from case and surrounding whitespace: a name written
 * without its extension does not resolve.
 * @param {string} name - Raw link text, e.g. 'shopping.txt' or 'work/notes.md'.
 * @returns {string|null} The internalId of the matching file, or null if there is none.
 */
export function resolveNoteName(name) {
    if (!_index) _index = build();
    const key = name.trim().toLowerCase();
    return _index.byPath.get(key) ?? _index.byFilename.get(key) ?? null;
}

/**
 * Marks the index stale. Call whenever appState.myFiles gains, loses or renames an entry.
 * @returns {void}
 */
export function invalidateNoteNameIndex() { _index = null; }
