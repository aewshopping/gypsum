// "delete" in the linked column dialog, and "delete column" in a linked column's header menu.

import { setLinkedProperty, linkedHeading } from '../../services/linked-properties.js';
import { deleteLinkedProperty } from '../../table-layouts/layout-file.js';
import { linkedColumnKey } from './linked-column-dialog.js';
import { closeColumnMenu, clearHeaderSelection } from './column-menu.js';
import { showWarningModal } from './warning-modal.js';
import { repaintColumnPicker } from './column-picker.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

/**
 * Asks, then deletes a linked column — its definition, and its place in **every** saved layout, in
 * one write. It asks because the layouts cannot get it back from the table; no note is touched
 * either way, and the sentence says so, since "delete column" on any other column rewrites every
 * note that has the key. See plans/completed/table-linked-properties.md §5.2 and §5.3.
 *
 * @async
 * @param {string} key - The linked column's key.
 * @returns {Promise<boolean>} Whether it was deleted.
 */
async function confirmAndDelete(key) {
    const confirmed = await showWarningModal(
        `Delete the linked column "${linkedHeading(key)}"? It is removed from every saved layout. No note is changed.`,
        'delete column', 'cancel', { focus: 'cancel' });
    if (!confirmed) return false;

    setLinkedProperty(key);
    deleteLinkedProperty(key);
    repaintColumnPicker();
    renderFiles(true, true);
    return true;
}

/**
 * The dialog's delete, for the column it is open over. The dialog stays open behind the question,
 * so cancelling leaves it as it was.
 * @async
 * @returns {Promise<void>}
 */
export async function handleLinkedColumnDelete() {
    const key = linkedColumnKey();
    if (!key) return;
    const dialog = document.getElementById('modal-linked-column');
    if (await confirmAndDelete(key)) dialog.close('delete');
}

/**
 * "delete column" in a linked column's header menu — the same slot, and the same words, as on every
 * other column, reaching the layouts rather than the notes.
 * @async
 * @returns {Promise<void>}
 */
export async function handleLinkedColumnDeleteFromMenu() {
    const key = document.getElementById('column-menu')?.dataset.property;
    if (!key) return;
    closeColumnMenu();
    clearHeaderSelection();
    await confirmAndDelete(key);
}
