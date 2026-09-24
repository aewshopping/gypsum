import { appState, UNDO_DEPTH } from '../services/store.js';
import { applyRawEdits } from '../editing/apply-raw-edits.js';

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
 * @returns {void}
 */
export function pushUndoBatch(records) {
    push(appState.undoStack, records);

    // The ordinary rule: a new edit makes every redo a claim about a file that has moved on. The
    // check would refuse them one at a time anyway; clearing says so at once.
    appState.redoStack.length = 0;
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
 * The one thing an undo cannot restore is *where* the key sat: a re-created key is appended to the
 * end of the block rather than to its old line. §7, and §13.1 for what that costs.
 *
 * @param {'undo'|'redo'} direction - Which stack to take from.
 * @returns {Promise<{applied: Array<object>, refused: Array<object>}>} The edits that were written,
 *   and the edits the check turned down. Both are needed: each gets its own mark on the cell.
 */
export async function reverseLastBatch(direction) {
    const from = direction === 'undo' ? appState.undoStack : appState.redoStack;
    const to = direction === 'undo' ? appState.redoStack : appState.undoStack;

    const batch = from.pop();
    if (!batch) return { applied: [], refused: [] };

    const applied = await applyRawEdits(batch.edits.map(edit => ({
        internalId: edit.internalId,
        property: edit.property,
        // A string, never a function: this text came out of a file, so it is already valid front
        // matter. Sending it back through toYamlText would not be faithful — a list of numbers
        // captures as a list of strings, and the note would come back subtly unlike the one you
        // had. §6.2.
        raw: edit.before,
        expect: edit.after,
    })));

    push(to, applied);

    // What the write left out. Addressed by file and property rather than by position, because the
    // write groups its edits by file and hands back only the ones that changed something — so the
    // returned order is its own, not the batch's.
    const done = new Set(applied.map(edit => `${edit.internalId}\u0000${edit.property}`));
    const refused = batch.edits.filter(edit => !done.has(`${edit.internalId}\u0000${edit.property}`));

    return { applied, refused };
}

/**
 * Forgets everything on both stacks. Called when a folder is loaded: the ids mean nothing against a
 * different folder, and §3's check makes clearing on anything less than that unnecessary.
 * @returns {void}
 */
export function clearUndoStacks() {
    appState.undoStack.length = 0;
    appState.redoStack.length = 0;
}

/**
 * @param {Array<object>} stack
 * @param {Array<object>} records
 * @returns {void}
 */
function push(stack, records) {
    if (records.length === 0) return;

    stack.push({ timestamp: Date.now(), edits: records });
    if (stack.length > UNDO_DEPTH) stack.shift();
}
