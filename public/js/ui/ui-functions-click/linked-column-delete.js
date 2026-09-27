// "delete" in the linked column dialog.

import { setLinkedProperty } from '../../services/linked-properties.js';
import { deleteLinkedProperty } from '../../table-layouts/layout-file.js';
import { linkedColumnKey } from './linked-column-dialog.js';
import { showWarningModal } from './warning-modal.js';
import { repaintColumnPicker } from './column-picker.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

/**
 * Deletes the column the dialog is open over — its definition, and its place in **every** saved
 * layout, in one write — after asking. It asks because the layouts cannot get it back from the
 * table; no note is touched either way. See plans/table-linked-properties.md §5.2.
 *
 * @async
 * @returns {Promise<void>}
 */
export async function handleLinkedColumnDelete() {
    const key = linkedColumnKey();
    if (!key) return;

    const confirmed = await showWarningModal(
        'Delete this linked column? It is removed from every saved layout. No note is changed.',
        'delete column', 'cancel', { focus: 'cancel' });
    if (!confirmed) return;

    document.getElementById('modal-linked-column').close('delete');
    setLinkedProperty(key);
    deleteLinkedProperty(key);

    repaintColumnPicker();
    renderFiles(true, true);
}
