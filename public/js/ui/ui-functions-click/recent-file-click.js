import { appState } from '../../services/store.js';
import { handleCloseModal, openFileContent, findFileCard, offscreenNoteTarget } from './open-file-content-view-trans.js';

/**
 * Handles a click on an entry in the recent files side panel. If a file is already open it is
 * closed first — warning about unsaved changes exactly as the close button does — then the
 * chosen file is opened.
 * @async
 * @param {Event} evt - The click event.
 * @param {HTMLElement} actionElement - The panel entry, carrying data-file-id.
 * @returns {Promise<void>}
 */
export async function handleRecentFileClick(evt, actionElement) {
    const fileId = actionElement.dataset.fileId;

    if (document.getElementById('file-content-modal').open) {
        if (!await handleCloseModal()) return; // user chose to keep editing
    }

    // The file may have no card on screen — the active filters or the current pagination page
    // can exclude it — so sweep the modal in from off-screen instead.
    const file = appState.myFiles.find(f => f.internalId === fileId);

    openFileContent(fileId, file.color, findFileCard(fileId) ?? offscreenNoteTarget);
}
