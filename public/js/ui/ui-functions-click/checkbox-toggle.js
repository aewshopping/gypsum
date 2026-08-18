import { appState } from '../../services/store.js';
import { updateUnsavedIndicator } from '../ui-functions-render/render-file-content.js';

/**
 * Toggles a task-list checkbox's `[ ]`/`[x]` marker in the live raw text when the rendered
 * checkbox is clicked. Only fires for live checkboxes — historical snapshots render them
 * disabled with no data-action, so the delegated listener never reaches this handler.
 * @param {Event} evt - The change event from the checkbox input.
 * @param {HTMLElement} actionElement - The checkbox input itself.
 * @returns {void}
 */
export function handleCheckboxToggle(evt, actionElement) {
    const line = Number(actionElement.dataset.srcLineStart);
    const session = appState.editSession;
    const lines = session.liveRaw.split('\n');

    const lineText = lines[line - 1];
    const markerIndex = lineText.search(/\[[ xX]\]/);
    lines[line - 1] = lineText.slice(0, markerIndex)
        + (actionElement.checked ? '[x]' : '[ ]')
        + lineText.slice(markerIndex + 3);

    const newRaw = lines.join('\n');
    session.liveRaw = newRaw;
    session.activeRaw = newRaw;

    // The .text-editor pre exists only after the user has entered txt/edit mode at least once
    // this session — if absent, fileContentRender() will build it fresh from activeRaw next
    // time txt mode is entered, so there's nothing to sync. If present, it must be updated
    // directly: re-entering txt mode reuses it as-is rather than refreshing from activeRaw, so
    // a stale pre would silently overwrite this edit on the next syncFromDom().
    const editor = document.querySelector('#modal-content-text .text-editor');
    if (editor) {
        editor.innerHTML = newRaw
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\r\n|\r|\n/g, '<br>');
    }

    session.isDirty = true;
    updateUnsavedIndicator();
}
