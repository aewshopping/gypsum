import { clearAllHistory } from '../../history/local-backup.js';
import { showWarningModal } from './warning-modal.js';
import { refreshHistoryModal } from './history-modal.js';

/**
 * Empties the whole history file, after confirmation. No file on disk is touched.
 * @async
 * @returns {Promise<void>}
 */
export async function handleHistoryClear() {
    const confirmed = await showWarningModal(
        'Delete every saved version of every file? This cannot be undone.',
        'Clear history',
        'Cancel',
    );
    if (!confirmed) return;

    await clearAllHistory();
    await refreshHistoryModal();
}
