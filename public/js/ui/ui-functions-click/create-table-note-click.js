import { appState } from '../../services/store.js';
import { propertyType } from '../../services/property-type.js';
import { createEmptyNote, findUnusedFilename } from '../../services/create-note.js';
import { pin } from '../../services/pins.js';
import { sortAppStateFiles } from '../../services/file-object-sort.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { reportFailure } from '../ui-functions-render/output-report.js';
import { finishOpenCell } from '../ui-functions-cell/cell-expand.js';

/**
 * The table's `+`, and Alt+Shift+N in any view: a new empty note, pinned so it is first, and not
 * opened — its row's cells are the prompts. Being pinned, it is shown whatever the filters. See
 * plans/completed/table-new-note-button.md.
 *
 * **An open cell is finished first.** The button's press moves focus, which closes and writes the
 * cell on its own; the shortcut moves none, so without this the render below would replace the open
 * cell and the typing would be gone. The commit reads the cell's text as it closes, so the render
 * cannot lose it.
 *
 * **Focus goes back on the `+`** after a press: the full render replaces the header, and focus
 * would otherwise fall to the body — a dead end for someone who pressed it from the keyboard. From
 * the shortcut there is no button, and the render's own focus carry leaves focus where it was.
 *
 * @param {Event} [event] - The click event; absent from the shortcut.
 * @param {HTMLElement} [target] - The `+`; absent from the shortcut.
 * @returns {Promise<void>}
 */
export async function handleCreateTableNote(event, target) {
    if (!appState.dirHandle || appState.bulkWriteInFlight) return;
    finishOpenCell();

    const filename = await findUnusedFilename(appState.dirHandle);
    let note;
    try {
        note = await createEmptyNote('', filename);
    } catch (error) {
        reportFailure(`${filename} could not be created: ${error.message}`);
        return;
    }
    pin(note.internalId);

    const { property, direction } = appState.sortState;
    sortAppStateFiles(property, propertyType(property), direction);
    await renderFiles().updateCallbackDone;

    if (target) document.querySelector('.table-new-note')?.focus();
}
