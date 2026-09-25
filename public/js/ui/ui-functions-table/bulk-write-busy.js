import { appState } from '../../services/store.js';
import { markUndoState } from './render-table-controls.js';

/**
 * Marks a write across many notes as running, or as finished: the flag, the inert table, and the
 * buttons it darkens. A column delete and a multi-file undo or redo both go through here, so the
 * table looks and behaves the same while either runs.
 *
 * **Inert rather than checked control by control.** One attribute on #output and #output-controls
 * blocks every click, focus and caret in the table; the keys and a folder load read
 * `appState.bulkWriteInFlight`, which is what they would have to ask anyway. See
 * plans/table-delete-column.md §11.
 *
 * @param {boolean} busy
 * @returns {void}
 */
export function setBulkWriteBusy(busy) {
    appState.bulkWriteInFlight = busy;
    for (const id of ['output', 'output-controls']) {
        document.getElementById(id)?.toggleAttribute('inert', busy);
    }
    markUndoState();
}
