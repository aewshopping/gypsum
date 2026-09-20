import { appState } from '../../services/store.js';
import { pressWasOnSelectedCell } from '../ui-functions-cell/cell-expand.js';
import { handleCloseModal, openFileContent, findFileCard, offscreenNoteTarget } from './open-file-content-view-trans.js';

/**
 * Handles a click on an [[internal link]] in the rendered note. Closes the current note —
 * warning about unsaved changes exactly as the close button does — then opens the linked one.
 *
 * **In a table cell it takes two presses, like everything else in a table cell.** The first selects
 * the cell and this does nothing; the second follows the link. That is cell-expand.js's rule rather
 * than a rule of its own, and a link has to keep it because a cell that is one link end to end
 * would otherwise have nowhere left to press to open its editor — which is the whole point of
 * drawing the link inside the note's own text rather than in place of it. A press the app made
 * itself carries detail 0 — Enter on a focused anchor — and follows at once, since a key can only
 * reach a link whose cell the keyboard is already in.
 *
 * Links in a rendered note are untouched: there is no cell to select, so they follow on one click
 * as they always have.
 *
 * @async
 * @param {Event} evt - The click event.
 * @param {HTMLElement} actionElement - The link anchor, carrying data-link-target.
 * @returns {Promise<void>}
 */
export async function handleInternalLinkClick(evt, actionElement) {
    evt.preventDefault(); // the href="#" is only there to make the anchor focusable

    if (actionElement.closest('.note-table-cell') && evt.detail !== 0 && !pressWasOnSelectedCell()) return;

    const fileId = actionElement.dataset.linkTarget;

    if (!await handleCloseModal()) return; // user chose to keep editing

    // The linked file may have no card on screen — the active filters or the current
    // pagination page can exclude it — so sweep the modal in from off-screen instead.
    const file = appState.myFiles.find(f => f.internalId === fileId);

    openFileContent(fileId, file.color, findFileCard(fileId) ?? offscreenNoteTarget);
}
