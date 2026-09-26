import { appState } from '../services/store.js';
import { SAVE_FOLDER } from '../constants.js';
import { RESERVED_KEYS } from '../services/file-parsing/file-info.js';
import { parseYaml, readValue, isQuoted } from '../services/file-parsing/yaml-parse.js';
import { findFrontMatterIndices } from '../services/file-parsing/yaml-find.js';
import { toYamlItem } from '../services/file-parsing/yaml-value-write.js';
import { newBlock, keySplice, keyAbove } from './front-matter-splice.js';
import { saveFileCopy } from './save-file-copy.js';
import { refreshFilesNow } from './refresh-file-state.js';

/** How many files are in flight at once. Measured, not guessed — §6.2 of plans/completed/table-delete-column.md. */
const POOL_SIZE = 16;

/**
 * @file The one writer every table batch goes through: bytes into front matter, a file at a time.
 *
 * It knows about spans, splicing and the write; save-cell-edit.js above it knows about types and
 * format. The split is load-bearing — see CLAUDE.md, *Writing a cell edit back to the note*. A cell
 * edit, an undo and a column delete all arrive here, so all three are made safe and fast together.
 */

// changedItem() saying the list is exactly as the file already has it, which is not the same answer
// as "rewrite the whole value": nothing is written at all.
const SKIP = Symbol('no item changed');

/**
 * Where one item of a list has to be rewritten, when that is all that has happened to it.
 *
 * Splicing one item leaves every other byte alone, which is the only way a comment sitting between
 * two items survives an edit. Anything else — an item added, removed or reordered — is the whole
 * value rewritten, and the comment is the price of an editor that lets you rewrite the list at once.
 *
 * **What the file holds is compared through the parser's own reader**, because capture is not the
 * inverse of render: a list of numbers is drawn as `1, 2, 10` and read back as strings, and a padded
 * item comes back trimmed. Comparing the raw slices would call every list of numbers changed and
 * rewrite it. It has to be `readValue` rather than `coerceValue` for the same reason it has to be
 * the parser's: the cell was drawn from what the parser kept, so `[01, 02, 10]` is three unchanged
 * items here, where the spec's answer would call two of them edited and rewrite the whole list —
 * losing any comment between the items.
 *
 * @param {string} text - The whole file.
 * @param {object} span - The key's span, as parseYaml filled it in.
 * @param {string[]} items - What the cell now holds, item by item.
 * @returns {{start: number, end: number, written: string}|SKIP|null} The item's span and its new
 *   text; SKIP when no item changed; null when this is not a one-item edit.
 */
function changedItem(text, span, items) {
    if (span.items.length !== items.length) return null;

    const changed = span.items
        .map((range, index) => ({ range, item: items[index] }))
        .filter(({ range, item }) =>
            String(readValue(text.slice(range.valueStart, range.valueEnd))) !== item);

    if (changed.length === 0) return SKIP;
    if (changed.length > 1) return null;

    return {
        start: changed[0].range.valueStart,
        end: changed[0].range.valueEnd,
        written: toYamlItem(changed[0].item, span.form === 'flow'),
    };
}

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
    const indices = findFrontMatterIndices(original);

    const errors = [];
    const spans = new Map();
    const parsed = parseYaml(original, errors, spans, indices);

    // §7: a file whose front matter did not read cleanly is not written into. A broken block
    // parses into something meaningless — '- apple: red' into a key nobody created — and
    // splicing into that makes it worse. The table locks those cells too, and for the same three
    // reasons hasYamlError() reports; this is the same question asked of the bytes on disk, which is
    // the only place the answer is current.
    if (errors.length > 0 || RESERVED_KEYS.some(key => key in parsed)) return null;

    // A note with no front matter at all is given an empty one, so that a key is appended to it
    // the same way as to a block that was already there — front-matter-splice.js says where it
    // goes and what it looks like. The block is made once per file rather than per edit, or two
    // new keys would arrive in two blocks; the lines it occupies are then handed on below.
    const text = indices ? original : newBlock(original) + original;
    const blockIndices = indices ?? { start: 0, end: 1 };

    const planned = [];
    fileEdits.forEach((edit, order) => {
        const span = spans.get(edit.property);
        const before = span ? text.slice(span.valueStart, span.valueEnd) : '';

        if (edit.expect !== undefined && edit.expect !== before) return;

        // What the note already looks like at this key, so the write keeps its style rather
        // than choosing one: the form of the value, the indentation of its list items, and
        // whether it is quoted. A key the note does not have yet has none of it.
        const shape = span ? {
            form: span.form,
            itemPrefix: span.items.length
                ? text.slice(span.items[0].lineStart, span.items[0].valueStart)
                : undefined,
            quoted: isQuoted(before.trim()),
        } : {};
        const raw = typeof edit.raw === 'function' ? edit.raw(shape) : edit.raw;

        // No text after the colon means no value, and no value means no key — toYamlText says so
        // by returning '', which every other answer it can give rules out, since they all carry
        // the separating space. Asked before the item path, because an emptied list is the whole
        // key going rather than its items changing one by one. `keepKey` is the one exception: an
        // undo putting back a bare `people:`, whose value was '' to begin with. §5.2.
        const removing = raw === '' && !edit.keepKey;
        if (removing && !span) return;

        const item = !removing && span && edit.items ? changedItem(text, span, edit.items) : null;
        if (item === SKIP) return;

        if (!removing && span && !item && raw === before) return;

        planned.push({ edit, order, span, before, raw, removing, item });
    });

    // A key coming back whose anchor is coming back in this same pass: the anchor is not in the
    // text yet, so it cannot be found there, and would fall back to the end of the block. Its line
    // goes straight after the anchor's instead, in the same insertion. §12.
    const recreated = new Map(planned
        .filter(plan => !plan.span && !plan.removing)
        .map(plan => [plan.edit.property, plan]));

    const placeOf = (plan, seen = new Set()) => {
        const { anchor } = plan.edit;
        if (anchor === undefined || anchor === null || spans.has(anchor)) {
            return { placement: { anchor, anchorSpan: anchor ? spans.get(anchor) : undefined }, rank: 0 };
        }
        const host = recreated.get(anchor);
        if (!host || seen.has(anchor)) return { placement: {}, rank: 0 };
        seen.add(plan.edit.property);
        const hostPlace = placeOf(host, seen);
        return { placement: hostPlace.placement, rank: hostPlace.rank + 1 };
    };

    const splices = planned.map(({ edit, order, span, before, raw, removing, item }) => {
        // One item of a list replaces that item alone; everything else is an ordinary write to
        // the key, and where those bytes go is front-matter-splice.js's answer — shared with the
        // colour picker, which splices the open editor's text by the same rules.
        const { placement, rank } = !span && !removing
            ? placeOf(recreated.get(edit.property))
            : { placement: {}, rank: 0 };
        const target = item
            ? { start: item.start, end: item.end, written: item.written }
            : keySplice(text, edit.property, raw, blockIndices, span,
                { ...placement, keepKey: edit.keepKey });

        return {
            property: edit.property,
            order,
            rank,
            ...target,
            before,
            // The record is the key's whole value span whichever splice it was. An item splice
            // happens inside that span, so the span afterwards is the same replacement applied
            // at the same offset — no re-parse needed.
            after: item
                ? before.slice(0, target.start - span.valueStart) + target.written
                    + before.slice(target.end - span.valueStart)
                : raw,
            existed: Boolean(span),
            // Where a removed key sat, so that undoing this puts it back there. §12.
            ...(removing && { anchor: keyAbove(spans, edit.property) }),
        };
    });
    if (splices.length === 0) return null;

    // Back to front. Splice the first key and every later span is off by the length delta;
    // working backwards keeps every span valid without recomputing anything. Two new keys share
    // the one insertion point, so they are applied back to front as well and end up in the
    // order they were asked for — a key placed after another re-created key (its rank) after it.
    splices.sort((a, b) => b.start - a.start || b.rank - a.rank || b.order - a.order);

    let updated = text;
    for (const splice of splices) {
        updated = updated.slice(0, splice.start) + splice.written + updated.slice(splice.end);
    }

    const records = splices.map(splice => ({
        internalId: file.internalId,
        property: splice.property,
        before: splice.before,
        after: splice.after,
        existed: splice.existed,
        ...(splice.anchor !== undefined && { anchor: splice.anchor }),
    }));
    if (!write) return records;

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
async function readText(handle) {
    try {
        return await (await handle.getFile()).text();
    } catch {
        return null;
    }
}
