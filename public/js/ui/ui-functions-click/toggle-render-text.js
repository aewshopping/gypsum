import { appState } from '../../services/store.js';
import { parseContent } from '../../services/parse-content.js';
import { syncFromDom } from '../../editing/manage-unsaved-changes.js';
import { getIsCurrentVersion } from '../../editing/editable-state.js';
import { fileContentRender } from '../ui-functions-render/render-file-content.js';

/**
 * Handles the html/txt render toggle and re-parses in-progress edits.
 * @returns {void}
 */
export function handleToggleRenderText() {
    if (getIsCurrentVersion()) {
        syncFromDom(); // appState.editState still holds the outgoing mode here — guard is correct
        appState.editSession.activeHtml = parseContent(appState.editSession.activeRaw);
        appState.editSession.liveHtml = appState.editSession.activeHtml;
    }
    appState.editState = document.getElementById('render_toggle').checked;
    fileContentRender();
}
