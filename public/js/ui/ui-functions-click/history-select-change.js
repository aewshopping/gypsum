import { appState } from '../../services/store.js';
import { restoreCurrentContent, loadHistoricalContent } from './load-file-content.js';

/**
 * Handles selection of a version from the history select in the file content modal.
 * Selecting "current" re-renders from the in-memory file content (no I/O).
 * Selecting a timestamp renders that entry's content from appState.historyEntries.
 *
 * @param {Event} event - The change event.
 * @param {HTMLElement} target - The <select> element.
 * @returns {void}
 */
export function handleHistorySelectChange(event, target) {
    if (target.value === 'current') {
        restoreCurrentContent();
        return;
    }

    const entry = appState.historyEntries[parseInt(target.value, 10)];
    if (entry) loadHistoricalContent(entry.content);
}
