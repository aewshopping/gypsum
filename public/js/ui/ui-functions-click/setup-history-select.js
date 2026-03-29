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
 * Reads backup history for the file and repopulates the select with all entries.
 * The snapshot saved on open is intentionally shown — it serves as the baseline
 * the user can compare their in-session edits against.
 * Intentionally fire-and-forget — the select updates when the read completes.
 * @param {string} filename
 * @returns {void}
 */
export function loadHistorySelect(filename) {
    readBackupHistory(filename).then(entries => {
        appState.historyEntries = entries;
        document.getElementById('file-content-history-select').innerHTML =
            renderHistorySelect(filename, entries);
    });
}
