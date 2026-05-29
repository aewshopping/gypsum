// Open/close handlers for the Settings modal.

import { populateFontSelects } from '../../services/font-loader.js';

const dialog = document.getElementById('modal-settings');

let pressedOnBackdrop = false;
dialog.addEventListener('pointerdown', (evt) => {
    pressedOnBackdrop = evt.target === dialog;
});

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
 * Closes the Settings modal when the user clicks on the backdrop.
 * Requires both the press and release to be on the dialog backdrop so that
 * a drag starting inside the modal doesn't accidentally close it.
 * @param {Event} event - The click event.
 * @returns {void}
 */
export function handleCloseSettingsOutside(event) {
    if (event.target === dialog && pressedOnBackdrop) {
        dialog.close();
    }
}
