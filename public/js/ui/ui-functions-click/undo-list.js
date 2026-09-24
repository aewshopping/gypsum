// The undo list: opening it, pressing a row, and clearing the history.

import { appState } from '../../services/store.js';
import { clearUndoStacks } from '../../table-undo/undo-stacks.js';
import { renderUndoList } from '../ui-functions-table/render-undo-list.js';
import { markUndoState } from '../ui-functions-table/render-table-controls.js';
import { reverseCellEdits } from './undo-cell-edit.js';
import { showWarningModal } from './warning-modal.js';

/** @returns {HTMLElement|null} */
const listElement = () => document.getElementById('undo-list');

/**
 * Opens the list under the history button, focused on its first row.
 *
 * Drawn fresh each time, so its names and times are never out of date. Tab and Shift+Tab move
 * between the rows and Escape closes, from the browser, as in the column menu.
 *
 * @returns {void}
 */
export function handleUndoListOpen() {
    const list = listElement();
    if (!list || appState.bulkWriteInFlight || appState.undoStack.length === 0) return;

    list.innerHTML = renderUndoList();
    list.showPopover();
    list.querySelector('.undo-list-row')?.focus();
}

/**
 * Undoes the pressed row's batch. The list closes first, so it is not covering the rows that are
 * about to flash; to undo another entry, open it again. §17.6.
 * @param {MouseEvent} evt
 * @param {HTMLElement} row
 * @returns {Promise<void>}
 */
export async function handleUndoListItem(evt, row) {
    const index = Number(row.dataset.index);
    closeUndoList();
    await reverseCellEdits('undo', index);
}

/**
 * "clear undo history": asks, then empties both stacks and writes the empty file. It asks because
 * it throws away the only saved copy of what a column delete removed — and says so. §8.5.
 * @returns {Promise<void>}
 */
export async function handleUndoListClear() {
    closeUndoList();
    const count = appState.undoStack.length;
    const confirmed = await showWarningModal(
        `Clear all undo history for this folder?\n\n`
        + `The ${count} change${count === 1 ? '' : 's'} in the list can no longer be undone, including any column delete. `
        + `The copies of deleted values kept in the folder's .gypsum folder are removed.`,
        'clear history', 'cancel', { focus: 'cancel' });
    if (!confirmed) return;

    await clearUndoStacks();
    markUndoState();
}

/** @returns {void} */
function closeUndoList() {
    const list = listElement();
    if (list?.matches(':popover-open')) list.hidePopover();
}

// Focus goes back to the history button when the list closes, however it closed — light dismiss and
// Escape come from the browser and pass through nothing of ours but this.
listElement()?.addEventListener('toggle', (evt) => {
    if (evt.newState !== 'closed') return;
    if (evt.target.contains(document.activeElement) || document.activeElement === document.body) {
        document.getElementById('table-undo-list-btn')?.focus();
    }
});
