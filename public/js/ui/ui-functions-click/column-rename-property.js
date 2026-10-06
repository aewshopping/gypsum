// "rename in N files" in the rename dialog: renaming the column's property in every note that has it.

import { appState } from '../../services/store.js';
import { renameProperty } from '../../editing/rename-property.js';
import { takeRenameRequest } from './column-rename-dialog.js';
import { focusHeaderCell } from './column-menu.js';
import { setBulkWriteBusy } from '../ui-functions-table/bulk-write-busy.js';
import { reportProgress, reportProgressEnd, reportRename, reportFailure } from '../ui-functions-render/output-report.js';

/**
 * Closes the dialog and renames, with the table inert until the notes and the layouts file are both
 * written.
 *
 * Thin, and column-delete-property.js line for line from the confirmation on: the passes are
 * editing/rename-property.js's, and following the name outside the notes is
 * table-layouts/follow-property-rename.js's. This is the inert table, the report line, and focus
 * back on the header. See plans/completed/table-rename-column.md §11.
 *
 * @returns {Promise<void>}
 */
export async function handleColumnRenameConfirm() {
    if (appState.bulkWriteInFlight) return;
    const request = takeRenameRequest();
    if (!request) return;
    const { from, to } = request;

    setBulkWriteBusy(true);
    const onProgress = reportProgress(`renaming ${from} to ${to}…`);
    let focusOn = from;
    try {
        // Waits for the layouts file too (§10.1), so the table stays busy until it is written.
        const { renamed, skipped, layoutSaved } = await renameProperty(from, to, onProgress);
        setBulkWriteBusy(false);
        reportProgressEnd();
        reportRename(from, to, skipped, layoutSaved);
        if (renamed > 0) focusOn = to;
    } catch (err) {
        console.error(`Renaming ${from} failed:`, err);
        setBulkWriteBusy(false);
        reportProgressEnd();
        reportFailure(`renaming ${from} stopped: ${err?.message ?? err}`);
    }
    focusHeaderCell(focusOn);
}
