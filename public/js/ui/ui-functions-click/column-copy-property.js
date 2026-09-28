// "copy into N files" in the copy dialog: copying the column into a property of every note.

import { appState } from '../../services/store.js';
import { copyProperty } from '../../editing/copy-property.js';
import { sourceHeading } from '../../editing/copy-source-value.js';
import { takeCopyRequest } from './column-copy-dialog.js';
import { focusHeaderCell } from './column-menu.js';
import { setBulkWriteBusy } from '../ui-functions-table/bulk-write-busy.js';
import { reportProgress, reportProgressEnd, reportCopy, reportFailure } from '../ui-functions-render/output-report.js';

/**
 * Closes the dialog and copies, with the table inert until the notes and the layouts file are both
 * written.
 *
 * Thin, and column-rename-property.js line for line: the passes are editing/copy-property.js's, and
 * the type and the column that follow are table-layouts/follow-property-copy.js's. This is the inert
 * table, the report line, and focus on the column copied into. See plans/completed/table-copy-column.md.
 *
 * @returns {Promise<void>}
 */
export async function handleColumnCopyConfirm() {
    if (appState.bulkWriteInFlight) return;
    const request = takeCopyRequest();
    if (!request) return;
    const { source, target } = request;
    const heading = sourceHeading(source);

    setBulkWriteBusy(true);
    const onProgress = reportProgress(`copying ${heading} to ${target}…`);
    let focusOn = source;
    try {
        // Waits for the layouts file too, so the table stays busy until it is written.
        const result = await copyProperty(source, target, onProgress);
        setBulkWriteBusy(false);
        reportProgressEnd();
        reportCopy(heading, target, result);
        if (result.copied > 0) focusOn = target;
    } catch (err) {
        console.error(`Copying ${heading} failed:`, err);
        setBulkWriteBusy(false);
        reportProgressEnd();
        reportFailure(`copying ${heading} stopped: ${err?.message ?? err}`);
    }
    focusHeaderCell(focusOn);
}
