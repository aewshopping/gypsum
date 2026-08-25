import { appState } from '../services/store.js';
import { getIsCurrentVersion } from './editable-state.js';
import { decodeModalHtml } from '../services/file-save.js';
import { saveFileCopy } from './save-file-copy.js';
import { resetUnsavedBaseline, getLiveRawContent, getEditorElement } from './manage-unsaved-changes.js';
import { updateUnsavedIndicator } from '../ui/ui-functions-render/render-file-content.js';
import { refreshFileAfterSave } from './refresh-file-state.js';

/**
 * Saves the currently-viewed file: writes a verified copy into .gypsum, overwrites the
 * original once that copy checks out, resets the unsaved baseline and spins the save icon.
 * Shared by the save button / Ctrl+S handler and by autosave so both take an identical path.
 * @async
 * @returns {Promise<void>}
 */
export async function saveCurrentFile() {
    if (!getIsCurrentVersion()) return;
    if (!appState.dirHandle) return;

    const snapshot = appState.openFileSnapshot;
    if (!snapshot) return;

    const editorEl = getEditorElement();
    const textToSave = editorEl
        ? decodeModalHtml(editorEl.innerHTML)
        : getLiveRawContent();

    const saveBtn = document.getElementById('save-btn');

    try {
        const verified = await saveFileCopy(snapshot, textToSave);
        if (verified) {
            saveBtn?.classList.remove('save-error');
            resetUnsavedBaseline();
            refreshFileAfterSave(snapshot);
            const arrowEl = document.getElementById('save-disk-arrow');
            arrowEl?.classList.add('spinning');
            setTimeout(() => {
                arrowEl?.classList.remove('spinning');
                updateUnsavedIndicator();
            }, 900);
        } else {
            saveBtn?.classList.add('save-error');
        }
    } catch (err) {
        saveBtn?.classList.add('save-error');
        console.error('Save failed:', err);
    }
}
