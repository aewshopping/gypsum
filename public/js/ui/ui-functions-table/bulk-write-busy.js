import { appState } from '../../services/store.js';
import { markUndoState } from './render-table-controls.js';
import { reportProgress, reportProgressEnd } from '../ui-functions-render/output-report.js';

/**
 * Marks a write across many notes as running, or as finished: the flag, the inert table, and the
 * buttons it darkens. A column delete and a multi-file undo or redo both go through here, so the
 * table looks and behaves the same while either runs.
 *
 * **Inert rather than checked control by control.** One attribute on #output and #output-controls
 * blocks every click, focus and caret in the table; the keys and a folder load read
 * `appState.bulkWriteInFlight`, which is what they would have to ask anyway. See
 * plans/completed/table-delete-column.md §11.
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

/**
 * Runs a table write with the table busy for as long as it takes, and returns what it returned.
 *
 * Across more than one note it gets the bar and the inert table; one note is one write, over at
 * once, where a bar would only flicker — so it is only locked against a second write starting. An
 * undo or redo and a paste both go through here, so they look the same while they run.
 *
 * @template T
 * @param {boolean} manyFiles - Whether the write reaches more than one note.
 * @param {string} progressText - The report line while it runs, e.g. `pasting into 12 cells…`.
 * @param {(onProgress: Function|undefined) => Promise<T>} work - Handed the bar's callback, when there is a bar.
 * @returns {Promise<T>}
 */
export async function whileWriting(manyFiles, progressText, work) {
    if (manyFiles) setBulkWriteBusy(true);
    else {
        appState.bulkWriteInFlight = true;
        markUndoState();
    }
    const onProgress = manyFiles ? reportProgress(progressText) : undefined;

    try {
        return await work(onProgress);
    } finally {
        if (manyFiles) {
            setBulkWriteBusy(false);
            reportProgressEnd();
        } else {
            appState.bulkWriteInFlight = false;
            markUndoState();
        }
    }
}
