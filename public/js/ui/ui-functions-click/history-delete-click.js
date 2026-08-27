import { deleteFileHistory } from '../../history/local-backup.js';
import { showWarningModal } from './warning-modal.js';
import { refreshHistoryModal } from './history-modal.js';

/**
 * Deletes every saved version of one file, after confirmation. The file itself is untouched.
 * @async
 * @param {Event} event - The click event.
 * @param {HTMLElement} target - The row's delete button, carrying the file's dataset.
 * @returns {Promise<void>}
 */
export async function handleHistoryDelete(event, target) {
    const { filename, filepath } = target.dataset;

    if (!await showWarningModal(`Delete all saved versions of "${filename}"?`, 'Delete', 'Cancel')) return;

    await deleteFileHistory(filename, filepath);
    await refreshHistoryModal();
}
