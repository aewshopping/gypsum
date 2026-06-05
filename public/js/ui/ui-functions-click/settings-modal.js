// Open/close handlers for the Settings modal.

import { populateFontSelects } from '../../services/font-loader.js';
import { PAGINATION_SIZE } from '../../constants.js';

const dialog = document.getElementById('modal-settings');

/**
 * Opens the Settings modal.
 * @returns {void}
 */
export function handleOpenSettings() {
    populateFontSelects();
    document.getElementById('pagination-size-input').value = PAGINATION_SIZE;
    dialog.showModal();
}

/**
 * Closes the Settings modal.
 * @returns {void}
 */
export function handleCloseSettings() {
    dialog.close();
}

