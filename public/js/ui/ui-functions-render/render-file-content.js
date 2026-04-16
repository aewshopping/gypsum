import { appState } from '../../services/store.js';
import { highlightPropMatches } from '../ui-functions-highlight/apply-highlights.js';
import { applyDiffHighlights, clearDiffHighlights } from '../ui-functions-highlight/diff-highlight.js';
import { getEditorElement, hasUnsavedChanges } from '../../editing/manage-unsaved-changes.js';
import { getIsCurrentVersion } from '../../editing/editable-state.js';

/**
 * Appends a black circle (●) to the filename in the history select button when the
 * current version has unsaved changes, and removes it otherwise.
 * Only shown when viewing the current version — not for historical snapshots.
 * @returns {void}
 */
export function updateUnsavedIndicator() {
    const modalContentDiv = document.getElementById("modal-content");
    const isUnsaved = getIsCurrentVersion() && hasUnsavedChanges();
    const isCurrent = getIsCurrentVersion();
    if (modalContentDiv.classList.contains("saved") !== !isUnsaved) {
        modalContentDiv.classList.toggle("saved", !isUnsaved);
    }
    modalContentDiv.classList.toggle("current-version", isCurrent);
}

/**
 * Renders the active content into the modal.
 * @returns {void}
 */
export function fileContentRender() {
    const textbox = document.getElementById('modal-content-text');
    const renderToggle = document.getElementById('render_toggle');
    renderToggle.checked = appState.editState;
    const isTxtMode = appState.editState;

    if (isTxtMode) {
        textbox.innerHTML = '';
        const preElement = document.createElement('pre');
        preElement.classList.add('pre-text-enlarge');
        preElement.classList.add('text-editor');
        // Only allow editing if we are on the current (live) version
        preElement.contentEditable = getIsCurrentVersion() ? 'plaintext-only' : 'false';
        preElement.innerHTML = appState.editSession.activeRaw
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\r\n|\r|\n/g, '<br>');
        if (getIsCurrentVersion()) {
            preElement.dataset.action = 'file-content-edit';
        }
        textbox.appendChild(preElement);
    } else {
        textbox.innerHTML = appState.editSession.activeHtml;
    }

    // apply search highlights if any
    highlightPropMatches();

    // apply diff highlights if a prior version
    if (getIsCurrentVersion()) {
        clearDiffHighlights();
    } else {
        // Compare the historical "active" content against the "live" current version
        applyDiffHighlights(appState.editSession.activeRaw, appState.editSession.liveRaw);
    }

    updateUnsavedIndicator();
}
