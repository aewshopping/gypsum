// Open/close handlers for the Settings modal.

const dialog = document.getElementById('modal-settings');

/**
 * Opens the Settings modal.
 * @returns {void}
 */
export function handleOpenSettings() {
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
 * Closes the Settings modal when the user clicks on the backdrop
 * (i.e. on the dialog element itself rather than any of its children).
 * @param {Event} event - The click event.
 * @returns {void}
 */
export function handleCloseSettingsOutside(event) {
    if (event.target === dialog) {
        dialog.close();
    }
}
