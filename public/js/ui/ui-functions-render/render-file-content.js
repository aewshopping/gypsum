import { appState } from '../../services/store.js';
import { applyDiffHighlights, clearDiffHighlights } from '../ui-functions-highlight/diff-highlight.js';
import { applyHighlights, highlightPropMatches } from '../ui-functions-highlight/apply-highlights.js';
import { hasUnsavedChanges } from '../../editing/manage-unsaved-changes.js';
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
    const isCurrent = getIsCurrentVersion();

    // Keep the live editor element in the DOM across view switches so the browser's
    // native undo history is preserved. Only hide/show it rather than destroy/rebuild.
    const liveEditor = textbox.querySelector('.text-editor');

    // Remove all non-live-editor children (elements and text nodes)
    Array.from(textbox.childNodes)
        .filter(node => node.nodeType !== 1 || !node.classList.contains('text-editor'))
        .forEach(node => node.remove());

    if (isTxtMode && isCurrent) {
        if (liveEditor) {
            liveEditor.style.display = '';
        } else {
            const preElement = document.createElement('pre');
            preElement.classList.add('pre-text-enlarge');
            preElement.classList.add('text-editor');
            preElement.contentEditable = 'plaintext-only';
            preElement.innerHTML = appState.editSession.activeRaw
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\r\n|\r|\n/g, '<br>');
            preElement.dataset.action = 'file-content-edit';
            textbox.appendChild(preElement);
        }
    } else {
        if (liveEditor) liveEditor.style.display = 'none';

        if (isTxtMode) {
            // Historical txt view — read-only pre, no .text-editor class
            const preElement = document.createElement('pre');
            preElement.classList.add('pre-text-enlarge');
            preElement.classList.add('historical-snapshot');
            preElement.contentEditable = 'false';
            preElement.innerHTML = appState.editSession.activeRaw
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\r\n|\r|\n/g, '<br>');
            textbox.appendChild(preElement);
        } else {
            // HTML view — move rendered nodes in without wiping the hidden live editor
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = appState.editSession.activeHtml;
            while (tempDiv.firstChild) {
                textbox.appendChild(tempDiv.firstChild);
            }
        }
    }

    // apply diff highlights if a prior version
    if (isCurrent) {
        clearDiffHighlights();
    } else {
        applyDiffHighlights(appState.editSession.activeRaw, appState.editSession.liveRaw);
    }

    if (isTxtMode) {
        highlightPropMatches();
    } else {
        applyHighlights();
    }
    updateUnsavedIndicator();
}
