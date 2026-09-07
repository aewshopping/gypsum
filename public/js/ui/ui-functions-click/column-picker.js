// Open/close handlers for the table's column picker modal.

import { renderColumnPickerList } from '../ui-functions-table/column-picker-list.js';

const dialog = document.getElementById('modal-columns');

/**
 * Opens the column picker, building its rows from the properties the loaded files carry.
 * Populated on open rather than once at startup, so the list follows the loaded folder.
 * @returns {void}
 */
export function handleOpenColumnPicker() {
    document.getElementById('column-picker-list').innerHTML = renderColumnPickerList();
    dialog.showModal();
}

/**
 * Closes the column picker.
 * @returns {void}
 */
export function handleCloseColumnPicker() {
    dialog.close();
}
