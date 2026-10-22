import { appState } from '../../services/store.js';
import { readPathText, validateRenameInputs } from '../../editing/rename-validate.js';
import { renameNote } from '../../editing/rename-note.js';
import { renderRefreshed } from '../../editing/refresh-file-state.js';
import { pushUndoBatch } from '../../table-undo/undo-stacks.js';
import { describeFileRename } from '../../table-undo/describe-batch.js';
import { followNoteRename } from '../ui-functions-table/follow-note-rename.js';
import { whileWriting } from '../ui-functions-table/bulk-write-busy.js';
import { holdRowMove } from '../ui-functions-table/pending-row-move.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { markUndoState } from '../ui-functions-render/render-undo-buttons.js';
import { reportAction, reportFailure } from '../ui-functions-render/output-report.js';

/**
 * @file Closing an edited filename cell: the note is renamed, or moved, on disk.
 *
 * The cell's other path beside applyCellEdits — a filename is no key in the note, so nothing is
 * spliced; the file itself is renamed through the code the file options dialog uses.
 * plans/completed/table-rename-filename.md §6.
 */

/**
 * Renames the note a filename cell belongs to, from the path typed into it.
 *
 * **A refusal writes nothing**, and says why on the report line — the open cell already said it
 * while it was typed (cell-rename-line.js). So does a throw: renameFile leaves the old file as it
 * was when the copy or the disk's own collision check fails. Either way the row is redrawn from
 * state, which still holds the old path.
 *
 * **The row is held, not re-sorted**, like any cell edit: sorted by filename, a renamed row belongs
 * somewhere else, and moving it now would take it out from under the cell.
 *
 * @param {HTMLElement} cell - The filename cell being closed.
 * @param {string} text - What it holds now.
 * @returns {Promise<void>}
 */
export async function commitRename(cell, text) {
    const file = appState.myFiles.find(f => f.internalId === cell.closest('.note-table').dataset.vtId);
    const { newFolder, newName } = readPathText(text, file, appState.myFiles);
    const check = validateRenameInputs({ currentFile: file, newFolder, newName, myFiles: appState.myFiles });
    if (!check.ok) {
        // `shopping` typed over `shopping.txt` reads back as the same path: nothing to write or say.
        if (!check.unchanged) reportFailure(check.reason);
        return renderFiles(false, true);
    }

    let renamed;
    try {
        renamed = await whileWriting(false, '', () => renameNote(file, check.normalizedFolder, check.normalizedName));
    } catch (error) {
        console.error('Rename failed:', error);
        reportFailure(error?.message ?? 'Rename failed.');
        return renderFiles(false, true);
    }

    const { oldFilepath, newFilepath } = renamed.outcome;
    followNoteRename(oldFilepath, newFilepath);
    await renderRefreshed(true, false);

    const { verb, text: words } = describeFileRename(oldFilepath, newFilepath);
    const said = `${verb === 'rename' ? 'renamed' : 'moved'} ${words}`;
    if (renamed.warnings.length) reportFailure(`${said}, but: ${renamed.warnings.join(' ')}`);
    else reportAction(said);

    // Whole paths, so undoing can move a note back as well as rename it. §9.1.
    pushUndoBatch([{ internalId: newFilepath, property: 'filename', before: oldFilepath, after: newFilepath }],
        { kind: 'rename-file', property: oldFilepath, to: newFilepath });
    markUndoState();
    holdRowMove([newFilepath]);
}
