import { appState } from '../services/store.js';
import { BACKUP_FILENAME, SAVE_FOLDER } from '../constants.js';
import { buildSaveFilename } from '../services/file-save.js';

/**
 * Rewrites `.gypsum/history.gypsum` entries for the renamed file so past
 * snapshots continue to surface under the new name/path. No-op if the backup
 * file or folder does not exist yet.
 *
 * @param {object} params
 * @param {string} params.oldFilename
 * @param {string} params.oldFilepath
 * @param {string} params.newFilename
 * @param {string} params.newFilepath
 * @returns {Promise<void>}
 */
async function rewriteHistoryFile({ oldFilename, oldFilepath, newFilename, newFilepath }) {
    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER);
        const fileHandle = await gypsumDir.getFileHandle(BACKUP_FILENAME);
        const text = await (await fileHandle.getFile()).text();
        if (!text.trim()) return;

        const parsed = JSON.parse(text);
        let changed = false;

        const retag = entry => {
            if (entry.filename === oldFilename && entry.filepath === oldFilepath) {
                entry.filename = newFilename;
                entry.filepath = newFilepath;
                changed = true;
            }
        };

        if (Array.isArray(parsed)) {
            parsed.forEach(retag);
            if (changed) {
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(parsed, null, 2));
                await writable.close();
            }
        } else if (parsed && Array.isArray(parsed.snapshots)) {
            parsed.snapshots.forEach(retag);
            if (changed) {
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(parsed, null, 2));
                await writable.close();
            }
        }
    } catch {
        // No backup file, inaccessible folder, or corrupt JSON — nothing to migrate.
    }
}

/**
 * Renames transient `-save.gypsum` / `-temp.gypsum` files (if any) so that
 * in-flight saves or crash-recovery state stays attached to the right file.
 * Silently ignores files that don't exist.
 * @param {FileSystemDirectoryHandle} gypsumDir
 * @param {string} oldSaveName
 * @param {string} newSaveName
 */
async function moveTransientIfExists(gypsumDir, oldSaveName, newSaveName) {
    if (oldSaveName === newSaveName) return;
    try {
        const handle = await gypsumDir.getFileHandle(oldSaveName, { create: false });
        await handle.move(gypsumDir, newSaveName);
    } catch {
        // Not present — nothing to rename.
    }
}

/**
 * Migrates all `.gypsum` side-files tied to a renamed file:
 *   - history.gypsum: rewrites matching entries in-place.
 *   - <filename>-save.gypsum / <filename>-temp.gypsum: renamed to the new pattern.
 *
 * Safe to call even when there is no backup folder or no matching entries.
 *
 * @param {object} params
 * @param {string} params.oldFilename
 * @param {string} params.oldFilepath
 * @param {string} params.newFilename
 * @param {string} params.newFilepath
 * @returns {Promise<void>}
 */
export async function migrateBackupsForRename({ oldFilename, oldFilepath, newFilename, newFilepath }) {
    if (!appState.dirHandle) return;

    await rewriteHistoryFile({ oldFilename, oldFilepath, newFilename, newFilepath });

    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER);
        const oldSave = buildSaveFilename(oldFilepath, oldFilename);
        const newSave = buildSaveFilename(newFilepath, newFilename);
        const oldTemp = oldSave.replace(/-save\.gypsum$/, '-temp.gypsum');
        const newTemp = newSave.replace(/-save\.gypsum$/, '-temp.gypsum');
        await moveTransientIfExists(gypsumDir, oldSave, newSave);
        await moveTransientIfExists(gypsumDir, oldTemp, newTemp);
    } catch {
        // .gypsum folder not present — nothing to migrate.
    }
}
