import { appState } from '../services/store.js';
import { SAVE_FOLDER } from '../constants.js';
import { refreshFilesNow } from './refresh-file-state.js';
import { planFileEdits } from './plan-file-edits.js';
import { writeFileEdits, readText } from './write-file-edits.js';

/** How many files are in flight at once. Measured, not guessed — §6.2 of plans/completed/table-delete-column.md. */
const POOL_SIZE = 16;

/**
 * @file The one writer every table batch goes through: bytes into front matter, a file at a time.
 *
 * It is the batch: grouping by file, the pool, when a throw stops it, and the one refresh. What a
 * note's text becomes is plan-file-edits.js's answer, and putting it on disk is write-file-edits.js's.
 * Together they know about spans, splicing and the write; save-cell-edit.js above them knows about
 * types and format. The split is load-bearing — see CLAUDE.md, *Writing a cell edit back to the note*. A cell
 * edit, an undo and a column delete all arrive here, so all three are made safe and fast together.
 */

/**
 * Puts already-converted text into the files, one verified write per file.
 *
 * `raw` is the text to write into the key's whole value span, the separating space included — or a
 * function returning it, given the shape the file already has at that key, which only this layer can
 * know. `items`, on a list edit, is what the cell now holds, item by item: when exactly
 * one of them has changed, that item's span is spliced and every other byte is left alone, a comment
 * sitting between two items included. `expect`, when given, is what the value span must currently
 * say for the edit to happen at all — the check an undo needs, stated as data so that it happens
 * inside the read this write already does rather than in a read of its own with a window between the
 * two. Undo passes it, and so does a column delete's second pass.
 *
 * A key the note does not have is appended to the end of its block, and a note with no block at all
 * is given one. Not an edge case: a column exists because *some* file carries that key, so the empty
 * cells in every other row are exactly the ones someone wants to fill in.
 *
 * **And the mirror of it: a key cleared to nothing is taken out, line and all.** `raw` of `''` is
 * what says so — see toYamlText, which can say it and nothing else. The column does not go with the
 * key: it stays because the layout asked for it, faded to say it now holds nothing, and the header
 * menu is where it is finally removed. That is what makes deleting a key safe, and why the rule this
 * replaced ("clearing writes an empty value and keeps the key") could not be dropped on its own.
 *
 * **Every file is written and only then is the list rendered, once.** A batch reaching the refresh
 * one file at a time would be a sort, a filter pass and a view transition per file, interrupting
 * one another — and the caller could not mark the cells it changed, because the rows do not exist
 * until the render has run. See plans/completed/table-undo-stack.md §10.2.
 *
 * `resort` is whether the refresh puts the files back in sort order. True by default, because a
 * written file's last modified time has moved and that is what the table is sorted by until someone
 * says otherwise. The one caller that passes false is a cell being finished with: there the move is
 * held until focus leaves the row, which is ui-functions-table/pending-row-move.js's business, not
 * this module's.
 *
 * **A few files at a time, not one after another.** The files are independent, and a verified write
 * is two `createWritable()` cycles, so a folder-wide batch is dominated by waiting on the file
 * system — measured at 13.3s for 1,000 files one at a time. Each file's own edits still go back to
 * front, and the verified two-write save is kept: concurrency is the saving, not dropping the
 * safety. plans/completed/table-delete-column.md §6.
 *
 * **The folder is fixed when the batch starts.** The directory handle and every file's own handle
 * are taken once, here, so a folder loaded while a long batch runs cannot receive the rest of its
 * writes. §6.2a.
 *
 * **The table never writes into a note it shows as locked**: a line the parser skipped, a key written
 * twice, or a key the app reserves. Asked of the bytes on disk, like the rest of the check, so a note
 * fixed by hand since load is written. §5.1, §5.3.
 *
 * `anchor`, on an undo re-creating a removed key, is the key it sat under — see keySplice — and
 * `keepKey` says '' means a bare key rather than no key. A removal's record carries its `anchor`.
 *
 * @param {Array<{internalId: string, property: string, raw: string|Function, items?: string[],
 *   expect?: string, anchor?: string|null, keepKey?: boolean}>} rawEdits
 * @param {{resort?: boolean, write?: boolean, onProgress?: Function, beforeRefresh?: Function}} [options] - `resort` false
 *   leaves the list in the order it is in. `write` false does everything but the write and the
 *   refresh — the plan pass a journal is made from (§8.3). `onProgress(done, total)` is called as
 *   each file finishes, written or not. `beforeRefresh(records)` runs once the writes are done and
 *   before the render, and returns the ids of files to re-check in it (§10.5).
 * @returns {Promise<Array<{internalId: string, property: string, before: string, after: string,
 *   existed: boolean}>>} One record per edit that changed a file, holding the key's whole value
 *   span before and after. This is what an undo entry is made of, and what a partly-applied undo
 *   hands to the redo stack — so an edit the check refused is simply absent from it.
 */
export async function applyRawEdits(rawEdits, { resort = true, write = true, onProgress, beforeRefresh } = {}) {
    const byFile = new Map();
    for (const edit of rawEdits) {
        if (!byFile.has(edit.internalId)) byFile.set(edit.internalId, []);
        byFile.get(edit.internalId).push(edit);
    }

    const dirHandle = appState.dirHandle;
    const filesById = new Map(appState.myFiles.map(file => [file.internalId, file]));
    const gypsumDir = write && byFile.size > 0
        ? await dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true })
        : null;

    const jobs = [...byFile];
    const results = new Array(jobs.length);
    const written = [];
    let next = 0;
    let done = 0;
    let failed = null;

    const worker = async () => {
        while (next < jobs.length && failed === null) {
            const index = next++;
            const [internalId, fileEdits] = jobs[index];
            try {
                results[index] = await editFile(filesById.get(internalId), fileEdits, gypsumDir, write, written);
            } catch (error) {
                // **Before the first note is written, a throw is the batch dying; after it, one note
                // being skipped.** A folder that cannot be written fails on its first file, so a
                // throw once a note has gone through says the folder works and something touched
                // this one file — Chrome's "state cached in an interface object" when a file changes
                // between the verify's getFile() and its read. The files not yet started are then
                // left alone, and the error goes to the caller once the files already written have
                // been refreshed; a journal written before this began still holds every edit, and
                // undo refuses the ones that never happened. §8.3.
                results[index] = error.records ?? null;
                if (written.length === 0) failed ??= error;
                else console.warn(`Skipped ${internalId}: its write threw.`, error);
            }
            onProgress?.(++done, jobs.length);
        }
    };

    try {
        await Promise.all(Array.from({ length: Math.min(POOL_SIZE, jobs.length) }, worker));
        if (failed !== null) throw failed;
    } finally {
        // Now rather than at the next idle moment: the user has just pressed a key to finish with this
        // cell and is watching the table. Autosave's deferral is for a save nobody asked for.
        //
        // **Re-sorted unless the caller says otherwise.** Every write moves the file's last modified
        // time, which is what the table is sorted by until someone says otherwise — so a list that kept
        // its old order was saying the file had not been touched. An undo takes the sort at once, being
        // nowhere near the rows; a cell being finished with holds it until focus leaves the row.
        //
        // Awaited, so that by the time this returns the rows the caller may want to mark are the ones
        // on screen.
        //
        // `beforeRefresh` hears what was applied before the one render, and names files whose issues
        // must be re-checked in it though nothing was written to them — an undo's refused notes.
        const records = results.flat().filter(Boolean);
        const recheck = failed === null && beforeRefresh ? beforeRefresh(records) : new Set();
        if (written.length > 0 || recheck.size > 0) await refreshFilesNow(written, resort, recheck);
    }

    return results.flat().filter(Boolean);
}

/**
 * Reads one file, works out its splices, and writes it — or, with `write` false, stops short of
 * the write.
 *
 * @param {object|undefined} file - The file object, or undefined if it is no longer loaded.
 * @param {Array<object>} fileEdits - This file's edits, in the order they were asked for.
 * @param {FileSystemDirectoryHandle|null} gypsumDir - Where the verified save's copy goes.
 * @param {boolean} write - False for a plan pass.
 * @param {Array<object>} written - Collects a snapshot per file written, for the refresh.
 * @returns {Promise<Array<object>|null>} This file's records, or null if nothing changed.
 */
async function editFile(file, fileEdits, gypsumDir, write, written) {
    // A file gone since the entry was made — deleted, or a saved undo entry from before a rename
    // outside the app — is refused, like any edit that cannot be checked. §8.4.
    if (!file?.handle) return null;

    const original = await readText(file.handle);
    if (original === null) return null;
    const plan = planFileEdits(original, fileEdits, file.internalId);
    if (!plan || !write) return plan?.records ?? null;
    return writeFileEdits(file, original, plan.updated, plan.records, gypsumDir, written);
}
