import { appState } from '../../services/store.js';
import { VIEWS } from '../../constants.js';
import { reverseBatch } from '../../table-undo/undo-stacks.js';
import { flashUndoneCells } from '../ui-functions-table/undo-cell-flash.js';
import { reportUndo, reportProgress, reportProgressEnd } from '../ui-functions-render/output-report.js';
import { setBulkWriteBusy } from '../ui-functions-table/bulk-write-busy.js';
import { describeBatch } from '../../table-undo/describe-batch.js';
import { markUndoState } from '../ui-functions-table/render-table-controls.js';

/**
 * @file Undo and redo a table cell edit.
 *
 * One file, because they are one action with a direction rather than two actions — the write, the
 * check, the mark and the line are identical, and only which stack is popped differs. See
 * plans/table-undo-stack.md §12.
 */

/**
 * Whether an undo or redo can be asked for at all.
 *
 * **Table view only.** The stack records edits made in the table, and in any other view there is
 * nothing for the result to be seen against. The buttons are scoped by not being drawn; the keys are
 * scoped by this. §10.4.
 *
 * @param {'undo'|'redo'} direction
 * @returns {boolean}
 */
export function canReverse(direction) {
    // Undo reads files and writes them, so a second press landing mid-flight would check the file
    // against bytes the first has not written yet — the exact race `expect` exists to close,
    // reopened from the other end. The flag is appState's so a column delete and an undo cannot
    // overlap either. §10.4 of plans/table-undo-stack.md, §11 of plans/table-delete-column.md.
    if (!canReach()) return false;

    // **Only what was done in this visit to the table.** Keyboard undo means "the thing I just
    // did"; once the stack outlives the session, a bare Ctrl+Z after a reload or a spell in grid
    // view would rewrite a note to how it was before something no longer in mind. Older entries are
    // reached through the list, deliberately. Only the top needs asking: every push goes on top with
    // a fresh timestamp, so timestamps only rise up the stack. plans/table-delete-column.md §10.4.
    const top = (direction === 'undo' ? appState.undoStack : appState.redoStack).at(-1);
    return top !== undefined && top.timestamp >= appState.undoHorizon;
}

/**
 * Whether a reversal can start at all, whichever entry it is for: the table is showing and nothing
 * is being written. The undo list asks this, and reaches every entry.
 * @returns {boolean}
 */
function canReach() {
    return !appState.bulkWriteInFlight && appState.viewState === VIEWS.TABLE.value;
}

/**
 * Puts the last batch of edits back, or re-applies the last one undone — or, from the undo list,
 * puts back one particular batch.
 * @param {'undo'|'redo'} direction
 * @param {number} [index] - Which entry on the stack, from the undo list. The top when left out,
 *   which is what the keys and the buttons reach, and only within this visit.
 * @returns {Promise<void>}
 */
export async function reverseCellEdits(direction, index) {
    if (index === undefined ? !canReverse(direction) : !canReach()) return;

    const stack = direction === 'undo' ? appState.undoStack : appState.redoStack;
    const pending = stack[index ?? stack.length - 1];
    const name = describeBatch(pending);

    // A batch across several notes — a column delete's, or its redo — takes seconds, so it gets what
    // the delete itself gets: the load's progress bar on the report line, and the table inert until it
    // is done. One file is one write and over at once; a bar would only flicker.
    const manyFiles = new Set(pending.edits.map(edit => edit.internalId)).size > 1;

    if (manyFiles) setBulkWriteBusy(true);
    else {
        appState.bulkWriteInFlight = true;
        markUndoState();
    }
    const onProgress = manyFiles
        ? reportProgress(`${direction === 'undo' ? 'undoing' : 'redoing'} ${name}…`)
        : undefined;

    let applied;
    let refused;
    try {
        ({ applied, refused } = await reverseBatch(direction, index, onProgress));

        // After the write, which awaited its own render — so these are the rows on screen now, and
        // the cells the marks are about actually exist. §10.2.
        flashUndoneCells(applied, refused);
    } finally {
        if (manyFiles) {
            setBulkWriteBusy(false);
            reportProgressEnd();
        } else {
            appState.bulkWriteInFlight = false;
            markUndoState();
        }
    }
    reportUndo(direction, name, applied.length, refused.length);
}

/**
 * @returns {void}
 */
export function handleTableUndo() {
    reverseCellEdits('undo');
}

/**
 * @returns {void}
 */
export function handleTableRedo() {
    reverseCellEdits('redo');
}
