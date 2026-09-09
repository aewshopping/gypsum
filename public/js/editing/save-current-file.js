import { appState } from '../services/store.js';
import { getIsCurrentVersion } from './editable-state.js';
import { saveFileCopy } from './save-file-copy.js';
import { resetUnsavedBaseline, getCurrentRawContent } from './manage-unsaved-changes.js';
import { updateUnsavedIndicator } from '../ui/ui-functions-render/render-file-content.js';
import { refreshFileAfterSave } from './refresh-file-state.js';
import { spinSaveArrow, SAVE_SPIN_MS } from '../ui/save-spin.js';

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

    const textToSave = getCurrentRawContent();

    const saveBtn = document.getElementById('save-btn');

    try {
        const verified = await saveFileCopy(snapshot, textToSave);
        if (verified) {
            saveBtn?.classList.remove('save-error');
            resetUnsavedBaseline();
            refreshFileAfterSave(snapshot);
            // The arrow glyph plays over the top of whichever state the modal is in, so the
            // button shows the save happening rather than jumping from unsaved to saved.
            saveBtn?.classList.add('saving');
            spinSaveArrow();
            setTimeout(() => {
                saveBtn?.classList.remove('saving');
                updateUnsavedIndicator();
            }, SAVE_SPIN_MS);
        } else {
            saveBtn?.classList.add('save-error');
        }
    } catch (err) {
        saveBtn?.classList.add('save-error');
        console.error('Save failed:', err);
    }
}
