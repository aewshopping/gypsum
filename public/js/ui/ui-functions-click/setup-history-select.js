import { appState } from '../../services/store.js';
import { readBackupHistory } from '../../editing/backup-history-read.js';
import { renderHistorySelect } from '../ui-functions-render/render-history-select.js';

/**
 * Resets the history select to show only "current" for a newly opened file.
 * History is loaded asynchronously by loadHistorySelect once the file content is ready.
 * @param {string} filename
 * @returns {void}
 */
export function initHistorySelect(filename) {
    document.getElementById('file-content-history-select').innerHTML =
        renderHistorySelect(filename, []);
}

/**
 * Reads backup history for the file and repopulates the select.
 * Suppresses the most recent entry if its content matches currentContent
 * (it was saved by a prior session and adds no information beyond what is already open).
 * Intentionally fire-and-forget — the select updates when the read completes.
 * @param {string} filename
 * @param {string} currentContent - The raw content currently displayed.
 * @returns {void}
 */
export function loadHistorySelect(filename, currentContent) {
    readBackupHistory(filename).then(entries => {
        const isCurrentMatch = entries.length > 0 && entries[0].content === currentContent;
        const displayEntries = isCurrentMatch ? entries.slice(1) : entries;
        appState.historyEntries = displayEntries;
        document.getElementById('file-content-history-select').innerHTML =
            renderHistorySelect(filename, displayEntries);
    });
}
