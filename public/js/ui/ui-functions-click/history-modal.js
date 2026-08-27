// Open/close handlers for the File history modal, reached from the Settings modal.

import { readHistorySummary } from '../../history/history-summary.js';
import { renderHistoryList, renderHistoryTotals } from '../ui-functions-render/render-history-list.js';

const dialog = document.getElementById('modal-history');

/**
 * Re-reads history.gypsum and repaints the totals line and the list.
 * Shared by the open handler and by every action that changes what is stored.
 * @async
 * @returns {Promise<void>}
 */
export async function refreshHistoryModal() {
    const summary = await readHistorySummary();
    document.getElementById('history-summary-line').textContent = renderHistoryTotals(summary);
    document.getElementById('history-list').innerHTML = renderHistoryList(summary.files);
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
 * Closes the File history modal.
 * @returns {void}
 */
export function handleCloseHistory() {
    dialog.close();
}
