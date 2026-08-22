import { appState } from '../../services/store.js';
import { handleCloseModal, openFileContent, findFileCard, offscreenNoteTarget } from './open-file-content-view-trans.js';

/**
 * Handles a click on an [[internal link]] in the rendered note. Closes the current note —
 * warning about unsaved changes exactly as the close button does — then opens the linked one.
 * @async
 * @param {Event} evt - The click event.
 * @param {HTMLElement} actionElement - The link anchor, carrying data-link-target.
 * @returns {Promise<void>}
 */
export async function handleInternalLinkClick(evt, actionElement) {
    evt.preventDefault(); // the href="#" is only there to make the anchor focusable

    const fileId = actionElement.dataset.linkTarget;

    if (!await handleCloseModal()) return; // user chose to keep editing

    // The linked file may have no card on screen — the active filters or the current
    // pagination page can exclude it — so sweep the modal in from off-screen instead.
    const file = appState.myFiles.find(f => f.internalId === fileId);

    openFileContent(fileId, file.color, findFileCard(fileId) ?? offscreenNoteTarget);
}
