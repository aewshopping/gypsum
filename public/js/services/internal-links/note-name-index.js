import { appState } from '../store.js';
import { VALID_EXTENSIONS } from '../../editing/rename-validate.js';

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
 * Extensions are included: the picker always writes a link that resolves exactly,
 * even though resolveNoteName would also accept the name without one.
 * Result is cached until invalidateNoteNameIndex() is called.
 * @returns {string[]}
 */
export function getNoteNameArray() {
    if (!_index) _index = build();
    return _index.names;
}

/**
 * Resolves the text inside [[...]] to a file's internalId.
 * A name written without a supported extension is tried again with '.txt' and then
 * '.md' appended, so '[[bob]]' finds 'bob.txt' — and keeps resolving after the link
 * has been used to create that file, which is written as '.txt'. Each candidate is
 * tried as a full path before a bare filename, so 'work/notes.md' beats a root-level
 * 'notes.md'. Matching is otherwise exact apart from case and surrounding whitespace.
 * @param {string} name - Raw link text, e.g. 'shopping.txt', 'work/notes.md' or 'bob'.
 * @returns {string|null} The internalId of the matching file, or null if there is none.
 */
export function resolveNoteName(name) {
    if (!_index) _index = build();
    const key = name.trim().toLowerCase();
    const candidates = VALID_EXTENSIONS.some(ext => key.endsWith(ext))
        ? [key]
        : [key, ...VALID_EXTENSIONS.map(ext => key + ext)];

    for (const candidate of candidates) {
        const fileId = _index.byPath.get(candidate) ?? _index.byFilename.get(candidate);
        if (fileId !== undefined) return fileId;
    }
    return null;
}

/**
 * Marks the index stale. Call whenever appState.myFiles gains, loses or renames an entry.
 * @returns {void}
 */
export function invalidateNoteNameIndex() { _index = null; }
