import { appState } from '../../services/store.js';
import { getIsCurrentVersion } from '../../editing/editable-state.js';
import { decodeModalHtml } from '../../services/file-save.js';
import { saveFileCopy } from '../../editing/save-file-copy.js';
import { resetUnsavedBaseline, getLiveRawContent, getEditorElement } from '../../editing/manage-unsaved-changes.js';
import { updateUnsavedIndicator } from '../ui-functions-render/render-file-content.js';
import { refreshFileAfterSave } from '../../editing/refresh-file-state.js';

let savePopoverTimer = null;

/**
 * Briefly shows a popover above the save button indicating success or failure.
 * @param {boolean} success
 */
function showSavePopover(success) {
    const popover = document.getElementById('save-popover');
    if (!popover) return;
//    popover.textContent = success ? 'Saved' : 'Save failed'; //now doing this with css before triggered by class name
//    popover.className = success ? 'success' : 'error';
    popover.classList.toggle('success', success);
    popover.classList.toggle('error', !success);
    popover.showPopover();
    clearTimeout(savePopoverTimer);
    savePopoverTimer = setTimeout(() => { popover.hidePopover(); }, 1500);
}

/**
 * Saves a copy of the currently-viewed file content to the .gypsum folder.
 * Delegates the actual file write to saveFileCopy in editing/save-file-copy.js.
 * Shows a popover to indicate success or failure.
 * @async
 * @returns {Promise<void>}
 */
export async function handleSaveFileCopy() {
    if (!getIsCurrentVersion()) return;
    if (!appState.dirHandle) return;

    const snapshot = appState.openFileSnapshot;
    if (!snapshot) return;

    const editorEl = getEditorElement();
    const textToSave = editorEl
        ? decodeModalHtml(editorEl.innerHTML)
        : getLiveRawContent();

    try {
        const verified = await saveFileCopy(snapshot, textToSave);
        if (verified) {
            resetUnsavedBaseline();
            updateUnsavedIndicator();
        }
        showSavePopover(verified);
        if (verified) refreshFileAfterSave(snapshot);
    } catch (err) {
        console.error('Save failed:', err);
        showSavePopover(false);
    }
}
