// Open/close handlers for the File history modal, reached from the Settings modal.

import { readHistorySummary } from '../../history/history-summary.js';
import { renderHistoryList, renderHistoryTotals } from '../ui-functions-render/render-history-list.js';
import { compareByProperty } from '../../services/file-object-sort.js';

const dialog = document.getElementById('modal-history');

// Each option names the property, its type and the direction that makes sense for it —
// nobody wants the smallest file or the oldest snapshot first.
const SORT_OPTIONS = {
    size:     ['reclaimBytes', 'number', 'desc'],
    versions: ['versions',     'number', 'desc'],
    recent:   ['newest',       'date',   'desc'],
    name:     ['filename',     'string', 'asc'],
};

/**
 * Re-reads history.gypsum and repaints the totals line and the list.
 * Shared by the open handler and by every action that changes what is stored.
 * @async
 * @returns {Promise<void>}
 */
export async function refreshHistoryModal() {
    const summary = await readHistorySummary();
    const choice = document.getElementById('history-sort-select').value;
    const files = [...summary.files].sort(compareByProperty(...SORT_OPTIONS[choice]));

    document.getElementById('history-summary-line').textContent = renderHistoryTotals(summary);
    document.getElementById('history-list').innerHTML = renderHistoryList(files);
}

/**
 * Opens the File history modal, populated from disk.
 * @async
 * @returns {Promise<void>}
 */
export async function handleOpenHistory() {
    await refreshHistoryModal();
    dialog.showModal();
}

/**
 * Re-renders the list after the sort select changes. The select is read at render time,
 * so the choice needs no state of its own.
 * @async
 * @returns {Promise<void>}
 */
export async function handleHistorySort() {
    await refreshHistoryModal();
}

/**
 * Closes the File history modal.
 * @returns {void}
 */
export function handleCloseHistory() {
    dialog.close();
}
