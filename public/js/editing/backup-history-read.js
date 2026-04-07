import { appState } from '../services/store.js';
import { BACKUP_FILENAME, SAVE_FOLDER } from '../constants.js';

/**
 * Reads history.gypsum and returns all entries matching the given filename, newest-first.
 * Handles both the current line-pool format ({ lines, snapshots }) and the legacy flat-array
 * format transparently. Returns [] if no directory handle, backup file absent, or unreadable.
 *
 * Called concurrently with saveBackupEntry on modal open — this is intentional.
 * Reading before the new entry is written means history shows only past states,
 * not a duplicate of the content the user is currently viewing.
 *
 * @async
 * @param {string} filename
 * @returns {Promise<Array<{filepath: string, filename: string, content: string, lineRefs: number[]|undefined, lines: string[]|undefined, timestamp: string, event: string}>>}
 */
export async function readBackupHistory(filename) {
    if (!appState.dirHandle) return [];
    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER);
        const fileHandle = await gypsumDir.getFileHandle(BACKUP_FILENAME);
        const text = await (await fileHandle.getFile()).text();
        if (!text.trim()) return [];
        const parsed = JSON.parse(text);

        if (Array.isArray(parsed)) {
            // Legacy format: entries already carry a plain `content` string
            return parsed.filter(e => e.filename === filename).reverse();
        }

        const { lines, snapshots } = parsed;
        return snapshots
            .filter(s => s.filename === filename)
            .reverse()
            .map(s => ({
                filepath: s.filepath,
                filename: s.filename,
                content: s.lineRefs.map(i => lines[i]).join('\n'),
                lineRefs: s.lineRefs,
                lines,
                timestamp: s.timestamp,
                event: s.event,
            }));
    } catch {
        return [];
    }
}
