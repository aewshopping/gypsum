/**
 * @file Pure validation for filenames and folder paths. No DOM or filesystem access.
 * Used by the rename flow and, via link-target-path.js, by the create-note-from-link flow.
 */

export const VALID_EXTENSIONS = ['.txt', '.md'];
export const FORBIDDEN_IN_FILENAME = /[\/\\\x00-\x1f]/;

/**
 * Normalises a folder path: trims, strips leading/trailing slashes, splits on '/',
 * drops empty segments. Returns the cleaned path or null if any segment is '.',
 * '..', or starts with '.' (hidden folders, which `directory-handler.js` skips
 * on load — renaming into one would silently lose the file), or holds a backslash or a control
 * character, which a filename is refused for and `getDirectoryHandle` throws on.
 * @param {string} raw
 * @returns {string|null}
 */
export function normaliseFolder(raw) {
    const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (trimmed === '') return '';
    const segments = trimmed.split('/').filter(s => s !== '');
    for (const seg of segments) {
        if (seg === '.' || seg === '..') return null;
        if (seg.startsWith('.')) return null;
        if (FORBIDDEN_IN_FILENAME.test(seg)) return null;
    }
    return segments.join('/');
}

/**
 * Takes apart the text of a table's filename cell — the note's whole path, edited as one string —
 * into the folder and the name validateRenameInputs is handed. Pure; the validator still decides.
 *
 * - **Split at the last '/', each segment trimmed**, so `work / plan.md` is `work` and `plan.md`.
 *   Not extractDirFromFilepath, which reads a last segment without a dot as a folder.
 * - **A trailing '/' is an empty name**, asked before empty segments are dropped.
 * - **A name not ending in .txt or .md keeps the extension the note has**: `shopping` on
 *   `note-3.txt` is `shopping.txt`.
 * - **A folder matching a loaded one apart from case takes the loaded one's case**, segment by
 *   segment against every folder prefix the loaded paths hold, stopping at the first that matches
 *   none. A folder with no notes in it is not seen, and that is accepted.
 *   plans/completed/table-rename-filename.md §3.2.
 *
 * @param {string} text - What the cell holds.
 * @param {{filename: string}} currentFile - The note being renamed.
 * @param {Array<{filepath: string}>} myFiles - Every loaded note.
 * @returns {{newFolder: string, newName: string}}
 */
export function readPathText(text, currentFile, myFiles) {
    const segments = text.split('/').map(segment => segment.trim());
    let newName = segments.pop();

    const lower = newName.toLowerCase();
    if (newName !== '' && !VALID_EXTENSIONS.some(ext => lower.endsWith(ext))) {
        const dot = currentFile.filename.lastIndexOf('.');
        newName += currentFile.filename.slice(dot);
    }

    return { newFolder: loadedCase(segments.filter(Boolean), myFiles).join('/'), newName };
}

/**
 * Folder segments with the case of the loaded folders they match.
 * @param {string[]} segments
 * @param {Array<{filepath: string}>} myFiles
 * @returns {string[]}
 */
function loadedCase(segments, myFiles) {
    const prefixes = new Map();
    for (const { filepath } of myFiles) {
        const folders = filepath.split('/').slice(0, -1);
        folders.forEach((_, index) => {
            const prefix = folders.slice(0, index + 1).join('/');
            prefixes.set(prefix.toLowerCase(), prefix);
        });
    }

    const result = [];
    for (const [index, segment] of segments.entries()) {
        const loaded = prefixes.get([...result, segment].join('/').toLowerCase());
        if (!loaded) return [...result, ...segments.slice(index)];
        result.push(loaded.split('/').pop());
    }
    return result;
}

/**
 * Validates and normalises rename inputs.
 *
 * @param {object} params
 * @param {{filename: string, filepath: string}} params.currentFile
 * @param {string} params.newFolder - User-entered target folder path (may be empty for root).
 * @param {string} params.newName - User-entered new filename.
 * @param {Array<{filename: string, filepath: string}>} params.myFiles
 * @returns {{ok: true, normalizedFolder: string, normalizedName: string} | {ok: false, reason: string, unchanged?: boolean}}
 */
export function validateRenameInputs({ currentFile, newFolder, newName, myFiles }) {
    const name = (newName ?? '').trim();
    if (name === '') return { ok: false, reason: 'Filename cannot be empty.' };
    if (name.startsWith('.')) {
        return { ok: false, reason: 'Filename cannot start with a dot.' };
    }
    if (FORBIDDEN_IN_FILENAME.test(name)) {
        return { ok: false, reason: 'Filename cannot contain slashes or control characters.' };
    }
    const lowerName = name.toLowerCase();
    if (!VALID_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
        return { ok: false, reason: 'Filename must end in .txt or .md.' };
    }

    // Asked apart from the dots so the sentence names the right fault; normaliseFolder refuses both.
    if ((newFolder ?? '').split('/').some(segment => FORBIDDEN_IN_FILENAME.test(segment))) {
        return { ok: false, reason: 'Folder names cannot contain backslashes or control characters.' };
    }
    const folder = normaliseFolder(newFolder);
    if (folder === null) {
        return { ok: false, reason: 'Folder names cannot start with a dot or be "." / ".."' };
    }

    const newFilepath = folder ? `${folder}/${name}` : name;
    // Flagged, so the table's filename cell can treat a name typed back as it was as no edit at all.
    if (newFilepath === currentFile.filepath) {
        return { ok: false, unchanged: true, reason: 'The path is unchanged.' };
    }
    if (newFilepath.toLowerCase() === currentFile.filepath.toLowerCase()) {
        // A case-insensitive disk sees one file, so renameFile's copy would land on the original
        // and its delete take the only copy. plans/completed/table-rename-filename.md §3.3.
        return { ok: false, reason: 'Only the case changed — that isn\'t supported yet.' };
    }
    const collision = myFiles.some(f =>
        f !== currentFile && f.filepath.toLowerCase() === newFilepath.toLowerCase()
    );
    if (collision) {
        return { ok: false, reason: 'A loaded file with that path already exists.' };
    }

    return { ok: true, normalizedFolder: folder, normalizedName: name };
}
