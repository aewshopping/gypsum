import { appState, FILE_PROPERTIES } from '../../services/store.js';
import { createEmptyNote } from '../../services/create-note.js';
import { handleCloseModal, openFileContent, findFileCard, offscreenNoteTarget } from './open-file-content-view-trans.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { sortAppStateFiles } from '../../services/file-object-sort.js';

/**
 * Creates the note an unresolved [[internal link]] points at, then navigates to it exactly
 * as following a live link does: the current note closes first — warning about unsaved
 * changes as the close button would — and the new one opens in its place.
 *
 * Closing first means backing out of that warning leaves nothing created. No edit mode is
 * activated: reaching this needs the editor open, and appState.editState carries over.
 *
 * @async
 * @param {{folder: string, filename: string}} target - As returned by linkTargetToFilepath.
 * @returns {Promise<void>}
 */
export async function createNoteFromLink({ folder, filename }) {
    if (!appState.dirHandle) return;
    if (!await handleCloseModal()) return; // user chose to keep editing

    const newFile = await createEmptyNote(folder, filename);

    // Sort and render before opening so the new note has a card to animate from.
    const { property, direction } = appState.sortState;
    sortAppStateFiles(property, FILE_PROPERTIES.get(property)?.type ?? 'string', direction);
    renderFiles();

    // Filters or the current pagination page can still exclude the new note, exactly as they
    // can for a linked one, so fall back to sweeping the modal in from off-screen.
    openFileContent(newFile.internalId, newFile.color, findFileCard(newFile.internalId) ?? offscreenNoteTarget);
}
