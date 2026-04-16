import { appState } from '../services/store.js';
import { parseContent } from '../services/parse-content.js';
import { syncFromDom } from './manage-unsaved-changes.js';
import { getIsCurrentVersion, setIsCurrentVersion } from './editable-state.js';
import { fileContentRender } from '../ui/ui-functions-render/render-file-content.js';

/**
 * Restores the modal to the live file content (undoes any historical selection).
 * @returns {void}
 */
export function restoreCurrentContent() {
    appState.editSession.activeRaw = appState.editSession.liveRaw;
    appState.editSession.activeHtml = appState.editSession.liveHtml;
    setIsCurrentVersion(true);
    fileContentRender();
}

/**
 * Loads a historical content string into the modal.
 * @param {string} historicalRaw - The raw file text from history to render.
 * @returns {void}
 */
export function loadHistoricalContent(historicalRaw) {
    if (getIsCurrentVersion()) {
        syncFromDom();
        appState.editSession.liveHtml = parseContent(appState.editSession.liveRaw);
    }

    setIsCurrentVersion(false);
    appState.editSession.activeRaw = historicalRaw;
    appState.editSession.activeHtml = parseContent(historicalRaw);
    fileContentRender();
}
