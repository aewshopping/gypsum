import { appState } from '../services/store.js';
import { applyRawEdits } from './apply-raw-edits.js';
import { toRawEdits } from './save-cell-edit.js';
import { pushUndoBatch, dropUndoBatch } from '../table-undo/undo-stacks.js';
import { saveUndoFile } from '../table-undo/undo-file.js';

/**
 * @file Pasted text, written into every cell it was aimed at: the column delete's two passes with a
 * cell edit's conversion.
 *
 * **Journalled before anything is written.** A cell edit pushes its undo entry after the write, which
 * is right for one cell and wrong for a paste across hundreds of notes: a tab closed half-way would
 * leave overwritten values that nothing records. So the batch is planned, its undo entry saved and
 * waited for, and only then written — each edit with the `expect` of what the plan saw, so a note
 * changed between the passes is refused rather than overwritten. A stale journal entry is harmless
 * for the reason every undo is: it is reversed only where the note still says what it left. See
 * plans/completed/table-range-paste.md §2.4 and plans/completed/table-delete-column.md §8.
 */

/**
 * Writes pasted text into its cells as one undoable batch.
 * @param {Array<{internalId: string, property: string, text: string}>} edits - One per cell, already
 *   cleared of the cells that refuse.
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<Array<object>>} What changed — applyRawEdits' records.
 */
export async function pasteCells(edits, onProgress) {
    // Fixed now, for the journal's writes as well as the notes'.
    const dirHandle = appState.dirHandle;

    const planned = await applyRawEdits(toRawEdits(edits), { write: false });
    if (planned.length === 0) return [];

    const properties = new Set(planned.map(record => record.property));
    const { batch, saved } = pushUndoBatch(planned, {
        kind: 'paste',
        property: properties.size === 1 ? planned[0].property : null,
        dirHandle,
    });

    if (!await saved) {
        await dropUndoBatch(batch, dirHandle);
        throw new Error('the undo history could not be saved, so nothing was pasted');
    }

    // The plan's own result, as a string: a list where one item changed keeps the bytes the item
    // splice kept around it, comments included.
    const applied = await applyRawEdits(planned.map(record => ({
        internalId: record.internalId,
        property: record.property,
        raw: record.after,
        expect: record.existed ? record.before : null,
    })), { resort: false, onProgress });

    if (applied.length === 0) {
        await dropUndoBatch(batch, dirHandle);
    } else {
        batch.edits = applied;
        await saveUndoFile(dirHandle);
    }
    return applied;
}
