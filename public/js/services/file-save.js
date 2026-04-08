/**
 * Extracts the directory portion of a filepath, handling both cases:
 *   - filepath includes the filename: 'subdir/notes.md' → 'subdir', 'notes.md' → ''
 *   - filepath is already a pure directory: 'subdir' → 'subdir', '' → ''
 * Detection: if the last path segment (after the final '/') contains a '.', it is
 * treated as a filename and stripped. Otherwise the whole value is a directory path.
 * @param {string} filepath
 * @returns {string}
 */
function extractDirFromFilepath(filepath) {
    const lastSlash = filepath.lastIndexOf('/');
    const lastSegment = lastSlash === -1 ? filepath : filepath.slice(lastSlash + 1);
    if (lastSegment.includes('.')) {
        return lastSlash === -1 ? '' : filepath.slice(0, lastSlash);
    }
    return filepath;
}

/**
 * Builds the .gypsum save filename for a given file.
 * Top-level files: '{filename}-save.gypsum'
 * Files in subdirectories: '{safeDir}-{filename}-save.gypsum'
 * @param {string} filepath
 * @param {string} filename
 * @returns {string}
 */
export function buildSaveFilename(filepath, filename) {
    const dirPart = extractDirFromFilepath(filepath);
    const safeDir = dirPart.replace(/[/\\]/g, '-');
    return safeDir
        ? `${safeDir}-${filename}-save.gypsum`
        : `${filename}-save.gypsum`;
}

/**
 * Converts a contentEditable pre element's innerHTML to plain text for saving.
 * Replaces <br> tags with newlines and decodes HTML entities.
 * @param {string} innerHTML
 * @returns {string}
 */
export function decodeModalHtml(innerHTML) {
    return innerHTML
        .replace(/<br>/gi, '\n')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

/**
 * Writes content to a named file inside gypsumDir, then reads it back to verify.
 * @param {FileSystemDirectoryHandle} gypsumDir
 * @param {string} filename
 * @param {string} content
 * @returns {Promise<boolean>} true if the written content matches what was read back
 */
export async function writeAndVerify(gypsumDir, filename, content) {
    const handle = await gypsumDir.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    const savedText = await (await handle.getFile()).text();
    return savedText === content;
}

/**
 * Writes content directly to a FileSystemFileHandle, then reads it back to verify.
 * @param {FileSystemFileHandle} fileHandle
 * @param {string} content
 * @returns {Promise<boolean>} true if the written content matches what was read back
 */
export async function writeAndVerifyHandle(fileHandle, content) {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    const savedText = await (await fileHandle.getFile()).text();
    return savedText === content;
}
