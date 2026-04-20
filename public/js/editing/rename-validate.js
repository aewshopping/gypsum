/**
 * @file Pure validation for the rename-file flow. No DOM or filesystem access.
 */

const VALID_EXTENSIONS = ['.txt', '.md'];
const FORBIDDEN_IN_FILENAME = /[\/\\\x00-\x1f]/;

/**
 * Normalises a folder path: trims, strips leading/trailing slashes, splits on '/',
 * drops empty segments. Returns the cleaned path or null if any segment is '.' or '..'.
 * @param {string} raw
 * @returns {string|null}
 */
function normaliseFolder(raw) {
    const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (trimmed === '') return '';
    const segments = trimmed.split('/').filter(s => s !== '');
    for (const seg of segments) {
        if (seg === '.' || seg === '..') return null;
    }
    return segments.join('/');
}

/**
 * Validates and normalises rename inputs.
 *
 * @param {object} params
 * @param {{filename: string, filepath: string}} params.currentFile
 * @param {string} params.newFolder - User-entered target folder path (may be empty for root).
 * @param {string} params.newName - User-entered new filename.
 * @param {Array<{filename: string, filepath: string}>} params.myFiles
 * @returns {{ok: true, normalizedFolder: string, normalizedName: string, unchanged: boolean} | {ok: false, reason: string}}
 */
export function validateRenameInputs({ currentFile, newFolder, newName, myFiles }) {
    const name = (newName ?? '').trim();
    if (name === '') return { ok: false, reason: 'Filename cannot be empty.' };
    if (FORBIDDEN_IN_FILENAME.test(name)) {
        return { ok: false, reason: 'Filename cannot contain slashes or control characters.' };
    }
    const lowerName = name.toLowerCase();
    if (!VALID_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
        return { ok: false, reason: 'Filename must end in .txt or .md.' };
    }

    const folder = normaliseFolder(newFolder);
    if (folder === null) {
        return { ok: false, reason: "Folder path cannot contain '.' or '..' segments." };
    }

    const newFilepath = folder ? `${folder}/${name}` : name;
    const unchanged = newFilepath === currentFile.filepath;

    if (!unchanged) {
        const collision = myFiles.some(f =>
            f !== currentFile && f.filepath.toLowerCase() === newFilepath.toLowerCase()
        );
        if (collision) {
            return { ok: false, reason: 'A loaded file with that path already exists.' };
        }
    }

    return { ok: true, normalizedFolder: folder, normalizedName: name, unchanged };
}
