import { appState } from '../../services/store.js';
import { getIsCurrentVersion } from '../../editing/editable-state.js';
import { decodeModalHtml } from '../../services/file-save.js';
import { saveFileCopy } from '../../editing/save-file-copy.js';
import { updateUnsavedIndicator, resetUnsavedBaseline } from './load-file-content.js';
import { refreshFileAfterSave } from '../../editing/refresh-file-state.js';

let savePopoverTimer = null;

/**
 * Briefly shows a popover above the save button indicating success or failure.
 * @param {boolean} success
 */
function showSavePopover(success) {
    const popover = document.getElementById('save-popover');
    if (!popover) return;
    popover.textContent = success ? 'Saved' : 'Save failed';
    popover.className = success ? 'success' : 'error';
    popover.showPopover();
    clearTimeout(savePopoverTimer);
    savePopoverTimer = setTimeout(() => { popover.hidePopover(); }, 2500);
}

/**
 * Saves a copy of the currently-viewed file content to the .gypsum folder.
 * Delegates the actual file write to saveFileCopy in editing/save-file-copy.js.
 * Shows a popover to indicate success or failure.
 * @async
 * @returns {Promise<void>}
 */
export async function handleSaveFileCopy() {
    const renderToggle = document.getElementById('render_toggle');
    if (!renderToggle?.checked || !getIsCurrentVersion()) return;

    if (!appState.dirHandle) return;

    const snapshot = appState.openFileSnapshot;
    if (!snapshot) return;

    const preElement = document.querySelector('#modal-content-text pre');
    if (!preElement) return;

    const textToSave = decodeModalHtml(preElement.innerHTML);

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
