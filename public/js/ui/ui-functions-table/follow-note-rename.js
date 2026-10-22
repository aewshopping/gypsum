import { appState } from '../../services/store.js';

/**
 * @file The table's own state, following a note to its new id. renameFile already follows it in the
 * undo stacks, the pins and the handles map; these are the table's, and this side of the layer
 * because one of them is the DOM. plans/completed/table-rename-filename.md §6.3.
 */

/**
 * Re-keys everything in the table that names a renamed note, before the render that follows it.
 *
 * **The row's data-vt-id is what puts focus back.** The render reads the focused cell's address off
 * the DOM and focuses it again afterwards (keep-cell-state.js), so with the new id already on the
 * row, focus returns to whichever cell had it — the one closed with Enter, or the next one Tab went
 * to — through the same code as after any edit. And with the ids on screen matching the ones about
 * to be drawn, the render starts no view transition.
 *
 * A range needs nothing: the render after a rename is a full one, which clears it.
 *
 * @param {string} oldId - The note's internalId before the rename.
 * @param {string} newId - Its internalId now.
 * @returns {void}
 */
export function followNoteRename(oldId, newId) {
    for (const row of document.querySelectorAll(`#output [data-vt-id="${CSS.escape(oldId)}"]`)) {
        row.dataset.vtId = newId;
    }

    const held = appState.pendingRowMove;
    if (held) for (const ids of [held.written, held.moving]) rekey(ids, oldId, newId);
    if (appState.copiedCells) rekey(appState.copiedCells.ids, oldId, newId);
}

/**
 * @param {Set<string>} ids
 * @param {string} oldId
 * @param {string} newId
 * @returns {void}
 */
function rekey(ids, oldId, newId) {
    if (ids.delete(oldId)) ids.add(newId);
}
