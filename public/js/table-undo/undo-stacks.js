import { appState, UNDO_DEPTH } from '../services/store.js';
import { applyRawEdits } from '../editing/apply-raw-edits.js';
import { readUndoFile, saveUndoFile } from './undo-file.js';
import { replaceRefusals } from './undo-refusals.js';
import { describeAction } from './describe-batch.js';

/**
 * @file The two stacks, and putting a batch of cell edits back.
 *
 * Separate from editing/apply-raw-edits.js because this is the only module that knows an edit can be stale.
 * Everything about writing bytes stays in one place — see plans/table-undo-stack.md §12.
 *
 * **Undo and redo are the same operation, and the code says so.** A record means "this key's value
 * span went `before` → `after`", so reversing it is always: write `before`, having checked the span
 * still says `after`. Reversing an undo *is* a redo, because the write returns a record of its own —
 * oriented the other way — and that is what goes on the other stack. So the only thing the direction
 * decides is which stack to take from and which to put on. §10.5.
 *
 * **The check lives inside the write**, as `expect`, because it needs the file's current bytes and so
 * does the splice. Reading twice would open exactly the window the check exists to catch. §3, §6.2.
 */

/**
 * Records a batch that can be undone, and drops any redo it invalidates.
 *
 * A batch of nothing is not a batch: a commit that changed no file returns no records, and pushing
 * an empty entry would give the user a live undo button that does nothing when pressed.
 *
 * @param {Array<object>} records - What applyRawEdits reported it changed.
 * **Saved to undo.gypsum straight after**, and the promise of that write is handed back for the
 * one caller that has to wait for it: a column delete, which records its batch before touching a
 * note. A cell edit does not wait.
 *
 * @param {Array<object>} records - What applyRawEdits reported it changed.
 * @param {{kind?: string, property?: string|null, dirHandle?: FileSystemDirectoryHandle}} [facts] -
 *   What the batch was, for its name: 'edit' or 'delete-property', and the column when there is
 *   one (see describe-batch.js). `dirHandle` is the folder to save into, for a batch that fixed its
 *   folder when it began.
 * @returns {{batch: object|null, saved: Promise<boolean>}} The entry pushed — null for a batch of
 *   nothing — and its save.
 */
export function pushUndoBatch(records, { kind = 'edit', property = null, dirHandle } = {}) {
    const batch = push(appState.undoStack, records, { kind, property });

    // The ordinary rule: a new edit makes every redo a claim about a file that has moved on. The
    // check would refuse them one at a time anyway; clearing says so at once.
    appState.redoStack.length = 0;

    return { batch, saved: saveUndoFile(dirHandle) };
}

/**
 * Takes a batch off the undo stack without reversing anything, and saves. For a journal whose
 * write pass applied nothing: it was pushed before anything was known, so push()'s guard against
 * an empty batch never saw it, and the list would otherwise offer a change that does nothing.
 * @param {object} batch - The entry pushUndoBatch returned.
 * @param {FileSystemDirectoryHandle} [dirHandle]
 * @returns {Promise<boolean>}
 */
export function dropUndoBatch(batch, dirHandle) {
    const index = appState.undoStack.indexOf(batch);
    if (index !== -1) appState.undoStack.splice(index, 1);
    return saveUndoFile(dirHandle);
}

/**
 * Reverses the most recent batch on one stack, and records the reversal on the other.
 *
 * **Each edit is checked separately** (§5). Fifty cells pasted, two of them hand-edited since, and
 * this restores the forty-eight it can still safely reverse and leaves the two alone — refusing the
 * whole batch is unhelpful, and bulldozing the two is the loss the check exists to prevent.
 *
 * **Only what was applied goes onto the other stack.** The refused edits were never reversed, so
 * there is nothing about them to put back: an entry holding all fifty would later send a fresh write
 * at the value that caused the refusal. applyRawEdits returns exactly the applied ones, so there is
 * no filtering to do here.
 *
 * **Undoing a key the edit created removes it**, and that needs no special case either: the record's
 * `before` is `''`, which is what the writer reads as "take the key out". So the two directions stay
 * one operation — a cleared cell's undo puts the key back, and a created key's undo takes it away.
 * A re-created key goes back after the key it sat under, which the removal recorded as `anchor` —
 * see plans/table-delete-column.md §12.
 *
 * @param {'undo'|'redo'} direction - Which stack to take from.
 * @param {number} [index] - Which entry, counted from the bottom; the top when left out.
 * @param {(done: number, total: number) => void} [onProgress] - Called as each file finishes.
 * @returns {Promise<{applied: Array<object>, refused: Array<object>, batch: object|undefined}>} The
 *   edits that were written, the edits the check turned down — each gets its own mark on the cell —
 *   and the batch they came from, for its name.
 */
export async function reverseBatch(direction, index, onProgress) {
    const from = direction === 'undo' ? appState.undoStack : appState.redoStack;
    const to = direction === 'undo' ? appState.redoStack : appState.undoStack;

    // Any entry, not only the top: the undo list reverses one batch on its own terms, and the check
    // below is what makes that safe — each edit is reversed only where the note still says what it
    // left. plans/table-delete-column.md §10.
    const [batch] = from.splice(index ?? from.length - 1, 1);
    if (!batch) return { applied: [], refused: [], batch };

    // What the write left out. Addressed by file and property rather than by position, because the
    // write groups its edits by file and hands back only the ones that changed something — so the
    // returned order is its own, not the batch's. Worked out before the render, so the refused notes'
    // marks are drawn by the render the undo already does. §10.5.
    let refused = [];
    const markRefused = (applied) => {
        const done = new Set(applied.map(edit => `${edit.internalId}\u0000${edit.property}`));
        refused = batch.edits.filter(edit => !done.has(`${edit.internalId}\u0000${edit.property}`));
        return replaceRefusals(refused, describeAction(batch));
    };

    const applied = await applyRawEdits(batch.edits.map(edit => ({
        internalId: edit.internalId,
        property: edit.property,
        // A string, never a function: this text came out of a file, so it is already valid front
        // matter. Sending it back through toYamlText would not be faithful — a list of numbers
        // captures as a list of strings, and the note would come back subtly unlike the one you
        // had. §6.2.
        raw: edit.before,
        expect: edit.after,
        // Where a removed key sat, so it comes back on its own line rather than at the end of the
        // block; and a bare key comes back bare, where '' would otherwise mean "no key". §12, §5.2.
        anchor: edit.anchor,
        keepKey: edit.before === '' && edit.existed,
    })), { beforeRefresh: markRefused, onProgress });

    // The same facts, so a redo has the same name as the undo it reverses.
    push(to, applied, { kind: batch.kind ?? 'edit', property: batch.property ?? null });
    saveUndoFile();

    return { applied, refused, batch };
}

/**
 * Replaces both stacks with the loaded folder's saved ones. Called when a folder loads: the ids in
 * the old stacks mean nothing against a different folder, and the new folder's own history is in
 * its .gypsum. A folder with none starts empty, as every folder did before the stack was saved.
 * @returns {Promise<void>}
 */
export async function loadUndoStacks() {
    const { undo, redo } = await readUndoFile();
    appState.undoStack.length = 0;
    appState.redoStack.length = 0;
    appState.undoStack.push(...undo);
    appState.redoStack.push(...redo);
}

/**
 * Forgets everything on both stacks and writes the empty file — "clear undo history". It removes the
 * only saved copy of what a column delete took out, which is why its button asks first. §8.5.
 * @returns {Promise<boolean>}
 */
export function clearUndoStacks() {
    appState.undoStack.length = 0;
    appState.redoStack.length = 0;
    return saveUndoFile();
}

/**
 * @param {Array<object>} stack
 * @param {Array<object>} records
 * @param {{kind: string, property: string|null}} facts
 * @returns {object|null} The entry pushed, or null when there was nothing to push.
 */
function push(stack, records, { kind, property }) {
    if (records.length === 0) return null;

    const batch = { timestamp: Date.now(), kind, property, edits: records };
    stack.push(batch);
    // The oldest goes, never the newest — the newest is what was just done.
    if (stack.length > UNDO_DEPTH) stack.shift();
    return batch;
}
