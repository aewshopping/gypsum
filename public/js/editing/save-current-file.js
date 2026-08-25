import { appState } from '../services/store.js';
import { getIsCurrentVersion } from './editable-state.js';
import { decodeModalHtml } from '../services/file-save.js';
import { saveFileCopy } from './save-file-copy.js';
import { resetUnsavedBaseline, getLiveRawContent, getEditorElement } from './manage-unsaved-changes.js';
import { updateUnsavedIndicator } from '../ui/ui-functions-render/render-file-content.js';
import { refreshFileAfterSave } from './refresh-file-state.js';

let queuedRefresh = null;

/**
 * Saves the currently-viewed file: writes a verified copy into .gypsum, overwrites the
 * original once that copy checks out, resets the unsaved baseline and spins the save icon.
 * Shared by the save button / Ctrl+S handler and by autosave so both take an identical path.
 * @async
 * @param {object} [options]
 * @param {boolean} [options.idleRefresh=false] - Defer the post-save file-list refresh to an
 *   idle callback. Autosave passes true so a full re-render never lands mid-keystroke.
 * @returns {Promise<boolean>} true if the file was written and verified.
 */
export async function saveCurrentFile({ idleRefresh = false } = {}) {
    if (!getIsCurrentVersion()) return false;
    if (!appState.dirHandle) return false;

    const snapshot = appState.openFileSnapshot;
    if (!snapshot) return false;

    const editorEl = getEditorElement();
    const textToSave = editorEl
        ? decodeModalHtml(editorEl.innerHTML)
        : getLiveRawContent();

    const saveBtn = document.getElementById('save-btn');

    try {
        const verified = await saveFileCopy(snapshot, textToSave);
        if (!verified) {
            saveBtn?.classList.add('save-error');
            return false;
        }

        saveBtn?.classList.remove('save-error');
        resetUnsavedBaseline();
        scheduleRefresh(snapshot, idleRefresh);

        const arrowEl = document.getElementById('save-disk-arrow');
        arrowEl?.classList.add('spinning');
        setTimeout(() => {
            arrowEl?.classList.remove('spinning');
            updateUnsavedIndicator();
        }, 900);
        return true;
    } catch (err) {
        saveBtn?.classList.add('save-error');
        console.error('Save failed:', err);
        return false;
    }
}

/**
 * Runs refreshFileAfterSave immediately (manual save) or in an idle callback (autosave).
 * Only one refresh is ever pending: a burst of autosaves replaces the queued one rather
 * than stacking up full file-list re-renders.
 * @param {{ filepath: string, filename: string }} snapshot
 * @param {boolean} idle
 * @returns {void}
 */
function scheduleRefresh(snapshot, idle) {
    if (!idle) {
        refreshFileAfterSave(snapshot);
        return;
    }

    if (queuedRefresh !== null) {
        if (window.requestIdleCallback) window.cancelIdleCallback(queuedRefresh);
        else clearTimeout(queuedRefresh);
    }

    const run = () => {
        queuedRefresh = null;
        refreshFileAfterSave(snapshot);
    };
    queuedRefresh = window.requestIdleCallback
        ? window.requestIdleCallback(run, { timeout: 2000 })
        : setTimeout(run, 0);
}
