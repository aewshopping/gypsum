import { appState } from '../../services/store.js';
import { getIsCurrentVersion } from '../../editing/editable-state.js';
import { decodeModalHtml } from '../../services/file-save.js';
import { saveFileCopy } from '../../editing/save-file-copy.js';
import { resetUnsavedBaseline, getLiveRawContent, getEditorElement } from '../../editing/manage-unsaved-changes.js';
import { updateUnsavedIndicator } from '../ui-functions-render/render-file-content.js';
import { refreshFileAfterSave } from '../../editing/refresh-file-state.js';


/**
 * Saves a copy of the currently-viewed file content to the .gypsum folder.
 * Delegates the actual file write to saveFileCopy in editing/save-file-copy.js.
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
