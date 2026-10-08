import { appState } from '../../services/store.js';
import { togglePin } from '../../services/pins.js';
import { applySortAndRender } from './sort-object.js';

/**
 * Pins or unpins the note whose card holds the pressed pin, and re-sorts so it moves.
 *
 * Focus goes back to the card afterwards: the press focused the button and the render replaced
 * every card, which would leave focus on the body and the arrow keys doing nothing. The render may
 * run inside a view transition, so the new cards exist only once its update has run.
 *
 * @param {Event} evt - The click event.
 * @param {HTMLElement} target - The pin button.
 * @returns {Promise<void>}
 */
export async function handlePinToggle(evt, target) {
    const card = target.closest('[data-file-id]');
    const id = card.dataset.fileId;
    togglePin(id);
    const { property, direction } = appState.sortState;
    await applySortAndRender(property, direction).updateCallbackDone;
    if (card.matches('.keyboard-navigable')) {
        document.querySelector(`#output .keyboard-navigable[data-file-id="${CSS.escape(id)}"]`)?.focus();
    }
}
