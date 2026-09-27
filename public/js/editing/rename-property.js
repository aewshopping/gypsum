import { appState } from '../services/store.js';
import { applyRawEdits } from './apply-raw-edits.js';
import { pushUndoBatch, dropUndoBatch } from '../table-undo/undo-stacks.js';
import { saveUndoFile } from '../table-undo/undo-file.js';

/**
 * @file Renaming a property in every note that has it — the key's name changes, and nothing else
 * in the note does — as one batch that one undo puts back. The service: no DOM, no dialog. The
 * rename's counterpart to delete-property.js, and built the same way. See
 * plans/table-rename-column.md.
 *
 * **A rename is two ordinary edits per note**: `people` removed, and its value re-created under
 * `attendees` at the line `people` left. The value comes back as the very bytes that went — a block
 * list's items, their indentation and the comments between them — so the note is its old self with
 * one word changed, and the undo stack, the journal and the refusal marks need no new kind of record.
 * plan-file-edits.js applies the removal first when the two share an offset. §3.3, §5.
 */

/**
 * Renames `from` to `to` in every note that has it, recording the undo entry **before** the first
 * note is touched. `to` must already have passed renameProblem: no loaded note has it.
 *
 * **Three passes, all through applyRawEdits, all sent only the notes that carry `from`.** §6.3.
 * 1. *Locate*: plan the removal alone, as a delete does, which yields each note's value span, and
 *    the key above it and the lines between (`anchor`, `gap`) — only reading a note can supply them.
 * 2. *Plan*: plan the pairs built from those records. Their records are the journal, pushed and saved
 *    before anything is written, so a tab closed half-way leaves an entry whose unwritten half is
 *    refused harmlessly by undo — the delete's crash-safety, unchanged.
 * 3. *Write*: the same pairs. `expect` refuses a note whose `from` changed since, and `expect: null` a
 *    note that has meanwhile gained `to`; `allOrNothing` makes either refusal take the whole note,
 *    since half a rename loses the value or doubles it.
 *
 * @param {string} from
 * @param {string} to
 * @param {(done: number, total: number) => void} [onProgress] - Called as each note is written.
 * @param {(records: Array<object>) => Set<string>} [beforeRefresh] - Handed to the write pass: runs
 *   once the notes are written, before the table is drawn. See applyRawEdits.
 * @returns {Promise<{renamed: number, skipped: number}>} How many notes were renamed, and how many
 *   that carried `from` at the start were left alone — locked, or changed since.
 */
export async function renameProperty(from, to, onProgress, beforeRefresh) {
    // Fixed now, for the journal's writes as well as the notes': a folder loaded meanwhile must not
    // receive either.
    const dirHandle = appState.dirHandle;
    const carrying = appState.myFiles
        .filter(file => Object.hasOwn(file, from))
        .map(file => file.internalId);

    const located = await applyRawEdits(carrying.map(internalId => ({ internalId, property: from, raw: '' })),
        { write: false });

    // A bare `people:` has '' for a value, which the writer reads as "take the key out" unless told
    // it is a bare key to keep. The removal's `expect` is the span the locate pass read.
    const pairs = (records) => records.flatMap(({ internalId, before, anchor, gap }) => [
        { internalId, property: to, raw: before, keepKey: before === '', anchor, gap, expect: null },
        { internalId, property: from, raw: '', expect: before },
    ]);

    const planned = await applyRawEdits(pairs(located), { write: false, allOrNothing: true });
    if (planned.length === 0) return { renamed: 0, skipped: carrying.length };

    const { batch, saved } = pushUndoBatch(planned, { kind: 'rename-property', property: from, to, dirHandle });

    // Nothing is renamed that could not be put back.
    if (!await saved) {
        await dropUndoBatch(batch, dirHandle);
        throw new Error('the undo history could not be saved, so nothing was renamed');
    }

    const plannedIds = new Set(planned.map(record => record.internalId));
    const applied = await applyRawEdits(pairs(located.filter(record => plannedIds.has(record.internalId))),
        { allOrNothing: true, onProgress, beforeRefresh });

    // The entry now holds what actually happened; a pass that wrote nothing leaves no entry at all.
    if (applied.length === 0) {
        await dropUndoBatch(batch, dirHandle);
    } else {
        batch.edits = applied;
        await saveUndoFile(dirHandle);
    }

    const renamed = new Set(applied.map(record => record.internalId)).size;
    return { renamed, skipped: carrying.length - renamed };
}
