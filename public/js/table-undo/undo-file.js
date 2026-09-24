/**
 * @file Reads and writes .gypsum/undo.gypsum — both undo stacks, saved whole.
 *
 * Saved because after a column delete the undo entry is the only copy of what was removed: table
 * writes take no history snapshot, so a stack that died with the tab took the values with it. A
 * stale entry is safe to keep, because every undo checks the note still says what the edit left
 * there and refuses it otherwise. See plans/table-delete-column.md §8.
 *
 * It knows the file's shape and nothing about what an entry means. appState.undoStack and redoStack
 * stay the single source of truth; this is their copy on disk, the relationship propertyTypes has
 * with table_layouts.gypsum.
 *
 * **The values in it are kept in plain text**, as history.gypsum keeps whole notes. "Clear undo
 * history" in the undo list is the way to be rid of them.
 */

import { appState } from '../services/store.js';
import { SAVE_FOLDER, UNDO_FILENAME } from '../constants.js';
import { writeAndVerify } from '../services/file-save.js';

/** Stamped on write so a later shape has something to branch on. No migration code — §8.2. */
const UNDO_VERSION = 1;

/**
 * Whether one parsed batch is shaped like a batch. The file is hand-editable, so this is a
 * boundary: a batch that is not what undo expects would throw half-way through an undo.
 * @param {*} batch
 * @returns {boolean}
 */
const isBatch = (batch) =>
    batch !== null && typeof batch === 'object' && Array.isArray(batch.edits)
    && batch.edits.every(edit => edit !== null && typeof edit === 'object'
        && typeof edit.internalId === 'string' && typeof edit.property === 'string'
        && typeof edit.before === 'string' && typeof edit.after === 'string');

/**
 * Both stacks as the text of undo.gypsum, or empty stacks when it cannot be used.
 *
 * Unparseable JSON, an unknown `undoVersion` or a batch that is not a batch all start empty and
 * warn to the console — the same rule table_layouts.gypsum follows. A folder with no file starts
 * empty and says nothing, since that is simply a folder nobody has edited from the table.
 *
 * @param {string|null} text - The file's contents, or null when there is no file.
 * @returns {{undo: Array<object>, redo: Array<object>}}
 */
export function parseUndoFile(text) {
    const empty = { undo: [], redo: [] };
    if (text === null) return empty;

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        console.warn(`${UNDO_FILENAME} could not be read; starting with no undo history.`);
        return empty;
    }
    if (parsed?.undoVersion !== UNDO_VERSION
        || !Array.isArray(parsed.undo) || !Array.isArray(parsed.redo)
        || !parsed.undo.every(isBatch) || !parsed.redo.every(isBatch)) {
        console.warn(`${UNDO_FILENAME} is not in a shape this version reads; starting with no undo history.`);
        return empty;
    }
    return { undo: parsed.undo, redo: parsed.redo };
}

/**
 * Reads the loaded folder's undo.gypsum.
 * @returns {Promise<{undo: Array<object>, redo: Array<object>}>}
 */
export async function readUndoFile() {
    // A save still running for the folder just left must land there before its stacks are replaced.
    await chain;

    let text = null;
    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: false });
        const handle = await gypsumDir.getFileHandle(UNDO_FILENAME, { create: false });
        text = await (await handle.getFile()).text();
    } catch {
        // No .gypsum, or no file in it: nothing has been edited from the table in this folder.
    }
    return parseUndoFile(text);
}

// **One write at a time, and always the latest state.** A cell edit does not wait for its save, so
// two quick edits would otherwise have two writables open on one file — whichever closed last would
// win, and that could be the older stack. A save asked for while one runs only marks the file dirty;
// the next write takes whatever the stacks hold when it starts. §8.2.
let chain = Promise.resolve(true);
let pending = null;
let pendingDir = null;

/**
 * Writes both stacks to the folder's undo.gypsum.
 *
 * A caller that waits — the column delete's journal — waits for a write that includes its batch:
 * either the one queued behind a running write, which reads the stacks only when it starts, or a
 * fresh one.
 *
 * @param {FileSystemDirectoryHandle} [dirHandle] - The folder to write into. A batch passes the one
 *   it captured when it began, so a folder loaded meanwhile is not written into. §6.2a.
 * @returns {Promise<boolean>} Whether the write that includes this state was verified.
 */
export function saveUndoFile(dirHandle = appState.dirHandle) {
    pendingDir = dirHandle;
    if (pending) return pending;

    pending = chain = chain.then(async () => {
        const dir = pendingDir;
        pending = null;
        return writeStacks(dir);
    });
    return pending;
}

/**
 * @param {FileSystemDirectoryHandle|null} dirHandle
 * @returns {Promise<boolean>}
 */
async function writeStacks(dirHandle) {
    if (!dirHandle) return false;
    const text = JSON.stringify({
        undoVersion: UNDO_VERSION,
        undo: appState.undoStack,
        redo: appState.redoStack,
    });
    try {
        const gypsumDir = await dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true });
        const verified = await writeAndVerify(gypsumDir, UNDO_FILENAME, text);
        if (!verified) console.warn(`${UNDO_FILENAME} did not verify after writing.`);
        return verified;
    } catch (err) {
        console.warn(`${UNDO_FILENAME} could not be written:`, err);
        return false;
    }
}
