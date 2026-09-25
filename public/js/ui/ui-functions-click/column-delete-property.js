// "delete column": taking the column's property out of every note that has it.

import { appState } from '../../services/store.js';
import { deletionForecast, deleteProperty } from '../../editing/delete-property.js';
import { showWarningModal } from './warning-modal.js';
import { closeColumnMenu, clearHeaderSelection } from './column-menu.js';
import { setBulkWriteBusy } from '../ui-functions-table/bulk-write-busy.js';
import { reportProgress, reportProgressEnd, reportDelete, reportFailure } from '../ui-functions-render/output-report.js';

/**
 * Asks, then deletes the menu's property from every note, with the table inert until it is done.
 *
 * Thin: the counts and the two passes are editing/delete-property.js's. This is the dialog, the
 * inert table and the report line — see plans/table-delete-column.md §5, §11 and §17.
 *
 * @returns {Promise<void>}
 */
export async function handleColumnDeleteProperty() {
    const property = document.getElementById('column-menu')?.dataset.property;
    if (!property || appState.bulkWriteInFlight) return;

    closeColumnMenu();
    clearHeaderSelection();

    const forecast = deletionForecast(property);
    if (forecast.changing === 0) {
        await showWarningModal(
            `"${property}" cannot be deleted: every note that has it has front matter that could not be read.`,
            '', 'close', { focus: 'cancel', proceed: false });
        return;
    }

    const confirmed = await showWarningModal(confirmationText(property, forecast),
        `delete from ${filesPhrase(forecast.changing)}`, 'cancel', { focus: 'cancel' });
    if (!confirmed) return;

    setBulkWriteBusy(true);
    const onProgress = reportProgress(`deleting ${property}…`);
    try {
        const { deleted, skipped } = await deleteProperty(property, onProgress);
        setBulkWriteBusy(false);
        reportProgressEnd();
        reportDelete(property, deleted, skipped);
    } catch (err) {
        console.error(`Deleting ${property} failed:`, err);
        setBulkWriteBusy(false);
        reportProgressEnd();
        reportFailure(`deleting ${property} stopped: ${err?.message ?? err}`);
    }
}

/**
 * The dialog's text, a line to a fact. §17.4.
 * @param {string} property
 * @param {{changing: number, skipped: number, samples: string[]}} forecast
 * @returns {string}
 */
function confirmationText(property, { changing, skipped, samples }) {
    const more = changing - samples.length;
    const names = more > 0 ? `${samples.join(', ')} and ${more} more.` : `${samples.join(', ')}.`;
    return [
        `Delete "${property}" from ${filesPhrase(changing)}?`,
        '',
        'The key and its value are removed from each note — a list, every item of it.',
        names,
        ...(skipped > 0
            ? [`${filesPhrase(skipped)} will be skipped: their front matter could not be read.`]
            : []),
        'You can undo this.',
    ].join('\n');
}

/** @param {number} count @returns {string} */
const filesPhrase = (count) => `${count} file${count === 1 ? '' : 's'}`;
