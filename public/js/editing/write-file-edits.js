import { saveFileCopy } from './save-file-copy.js';

/**
 * @file Putting a planned note on disk through the verified save, and working out what happened when
 * that save throws part-way.
 */

/**
 * Writes one note's new text, and says which records it made true.
 *
 * @param {object} file - The file object; its handle was fixed when the batch began.
 * @param {string} original - What the plan was made from.
 * @param {string} updated - What the note is to hold.
 * @param {Array<object>} records - The plan's records for this note.
 * @param {FileSystemDirectoryHandle} gypsumDir - Where the verified save's copy goes.
 * @param {Array<object>} written - Collects a snapshot per file written, for the refresh.
 * @returns {Promise<Array<object>|null>} The records, or null if the verify failed. A throw carries
 *   `records` when the note may have changed, and null when it certainly did not.
 */
export async function writeFileEdits(file, original, updated, records, gypsumDir, written) {
    const snapshot = { filepath: file.filepath, filename: file.filename, content: original };
    try {
        if (!await saveFileCopy(snapshot, updated, { gypsumDir, handle: file.handle })) return null;
    } catch (error) {
        // A throw can come after the note was written — from the verify's read, or tidying away the
        // copy in .gypsum — so what the note now holds says what happened. Written: it counts, like
        // any other. Unreadable or something else: the records go with the error all the same,
        // because a journal listing an edit that never happened is refused harmlessly on undo, and
        // one missing an edit that did happen has lost the only copy of the value.
        const now = await readText(file.handle);
        if (now !== updated) {
            error.records = now === original ? null : records;
            throw error;
        }
    }

    // The verified text travels to the refresh, which parses it rather than reading it back again.
    written.push({ ...snapshot, written: updated });
    return records;
}

/**
 * A note's text as it is on disk now, or null when it cannot be read.
 * @param {FileSystemFileHandle} handle
 * @returns {Promise<string|null>}
 */
export async function readText(handle) {
    try {
        return await (await handle.getFile()).text();
    } catch {
        return null;
    }
}
