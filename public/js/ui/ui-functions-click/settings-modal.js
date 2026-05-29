// Open/close handlers for the Settings modal.

import { populateFontSelects } from '../../services/font-loader.js';

const dialog = document.getElementById('modal-settings');

/**
 * Opens the Settings modal.
 * @returns {void}
 */
export function handleOpenSettings() {
    populateFontSelects();
    dialog.showModal();
}

/**
 * Closes the Settings modal.
 * @returns {void}
 */
export function handleCloseSettings() {
    dialog.close();
}

/**
 * Closes the Settings modal when the user clicks on the backdrop — i.e. outside
 * the dialog's visible bounding box. Clicking inside the dialog's padding (which
 * also sets event.target to the dialog element) intentionally does NOT close it.
 * @param {Event} event - The click event.
 * @returns {void}
 */
export function handleCloseSettingsOutside(event) {
    const rect = dialog.getBoundingClientRect();
    if (
        event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top  || event.clientY > rect.bottom
    ) {
        dialog.close();
    }
}
