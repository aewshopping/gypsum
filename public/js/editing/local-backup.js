import { appState } from '../services/store.js';

const BACKUP_FILENAME = 'history.gypsum';
const MAX_ENTRIES = 50;

/**
 * Appends a snapshot entry to history.gypsum in the loaded directory.
 * Does nothing silently if no directory handle is available (file picker path).
 *
 * @async
 * @param {{ filepath: string, filename: string, content: string }} snapshot
 * @param {'open' | 'close'} event
 * @returns {Promise<void>}
 */
export async function saveBackupEntry(snapshot, event) {
    if (!appState.dirHandle) return;

    try {
        const fileHandle = await appState.dirHandle.getFileHandle(BACKUP_FILENAME, { create: true });

        const existingText = await (await fileHandle.getFile()).text();

        let entries = [];
        if (existingText.trim()) {
            try { entries = JSON.parse(existingText); } catch { entries = []; }
        }

        const lastForFile = [...entries].reverse().find(
            e => e.filename === snapshot.filename && e.filepath === snapshot.filepath
        );
        const isDuplicate = lastForFile && lastForFile.content === snapshot.content;

        if (isDuplicate) {
            lastForFile.timestamp = new Date().toISOString();
        } else {
            entries.push({
                filepath: snapshot.filepath,
                filename: snapshot.filename,
                content: snapshot.content,
                timestamp: new Date().toISOString(),
                event,
            });
        }

        if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);

        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(entries, null, 2));
        await writable.close();
    } catch {
        // Never crash the app over a backup failure
    }
}
