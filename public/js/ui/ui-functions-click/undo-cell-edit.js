import { appState } from '../../services/store.js';
import { VIEWS } from '../../constants.js';
import { reverseLastBatch } from '../../table-undo/undo-stacks.js';
import { flashUndoneCells } from '../ui-functions-table/undo-cell-flash.js';
import { reportUndo } from '../ui-functions-render/output-report.js';
import { markUndoState } from '../ui-functions-table/render-table-controls.js';

/**
 * @file Undo and redo a table cell edit.
 *
 * One file, because they are one action with a direction rather than two actions — the write, the
 * check, the mark and the line are identical, and only which stack is popped differs. See
 * plans/table-undo-stack.md §12.
 */

// Undo reads files and writes them, so a second press landing mid-flight would check the file
// against bytes the first has not written yet — the exact race `expect` exists to close, reopened
// from the other end. §10.4.
let inFlight = false;

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
    if (inFlight || appState.viewState !== VIEWS.TABLE.value) return false;

    return (direction === 'undo' ? appState.undoStack : appState.redoStack).length > 0;
}

/**
 * Puts the last batch of cell edits back, or re-applies the last one undone.
 * @param {'undo'|'redo'} direction
 * @returns {Promise<void>}
 */
export async function reverseCellEdits(direction) {
    if (!canReverse(direction)) return;

    inFlight = true;
    markUndoState();
    try {
        const { applied, refused } = await reverseLastBatch(direction);

        // After the write, which awaited its own render — so these are the rows on screen now, and
        // the cells the marks are about actually exist. §10.2.
        flashUndoneCells(applied, refused);
        reportUndo(direction, applied.length, refused.length);
    } finally {
        inFlight = false;
        markUndoState();
    }
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
