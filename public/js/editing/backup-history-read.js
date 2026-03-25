import { appState } from '../services/store.js';

const BACKUP_FILENAME = 'history.gypsum';

/**
 * Reads history.gypsum and returns all entries matching the given filename, newest-first.
 * Returns [] if no directory handle, backup file absent, or content is unreadable.
 *
 * Called concurrently with saveBackupEntry on modal open — this is intentional.
 * Reading before the new entry is written means history shows only past states,
 * not a duplicate of the content the user is currently viewing.
 *
 * @async
 * @param {string} filename
 * @returns {Promise<Array<{filepath: string, filename: string, content: string, timestamp: string, event: string}>>}
 */
export async function readBackupHistory(filename) {
    if (!appState.dirHandle) return [];
    try {
        const fileHandle = await appState.dirHandle.getFileHandle(BACKUP_FILENAME);
        const text = await (await fileHandle.getFile()).text();
        if (!text.trim()) return [];
        const entries = JSON.parse(text);
        return entries.filter(e => e.filename === filename).reverse();
    } catch {
        return [];
    }
}
