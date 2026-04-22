import { appState } from '../services/store.js';
import { BACKUP_FILENAME, SAVE_FOLDER } from '../constants.js';
import { buildSaveFilename, writeAndVerifyHandle } from '../services/file-save.js';
import { copyFile } from './rename-file.js';

/**
 * Rewrites `.gypsum/history.gypsum` entries for the renamed file so past
 * snapshots continue to surface under the new name/path. Returns a list of
 * warning strings (empty on clean success or when there was nothing to do).
 * Missing history file/folder is benign; corrupt JSON or a failed write
 * produces a warning rather than a throw so the rename itself still completes.
 *
 * @param {object} params
 * @param {string} params.oldFilename
 * @param {string} params.oldFilepath
 * @param {string} params.newFilename
 * @param {string} params.newFilepath
 * @returns {Promise<string[]>}
 */
async function rewriteHistoryFile({ oldFilename, oldFilepath, newFilename, newFilepath }) {
    let fileHandle;
    let text;
    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER);
        fileHandle = await gypsumDir.getFileHandle(BACKUP_FILENAME);
        text = await (await fileHandle.getFile()).text();
    } catch (err) {
        if (err?.name === 'NotFoundError') return [];
        console.error('History migration: could not read history.gypsum', { oldFilename, newFilename, err });
        return ['Could not read history file; past snapshots may still reference the old name.'];
    }

    if (!text.trim()) return [];

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        console.error('History migration: history.gypsum is corrupt', { oldFilename, newFilename, err });
        return ['History file is corrupt; past snapshots may still reference the old name.'];
    }

    let changed = false;
    const retag = entry => {
        if (entry.filename === oldFilename && entry.filepath === oldFilepath) {
            entry.filename = newFilename;
            entry.filepath = newFilepath;
            changed = true;
        }
    };

    let toWrite;
    if (Array.isArray(parsed)) {
        parsed.forEach(retag);
        if (changed) toWrite = JSON.stringify(parsed, null, 2);
    } else if (parsed && Array.isArray(parsed.snapshots)) {
        parsed.snapshots.forEach(retag);
        if (changed) toWrite = JSON.stringify(parsed, null, 2);
    }

    if (toWrite === undefined) return [];

    try {
        const ok = await writeAndVerifyHandle(fileHandle, toWrite);
        if (!ok) {
            console.error('History migration: write verification failed', { oldFilename, newFilename });
            return ['History file write could not be verified; past snapshots may be stale.'];
        }
    } catch (err) {
        console.error('History migration: write threw', { oldFilename, newFilename, err });
        return ['History file could not be updated; past snapshots may still reference the old name.'];
    }

    return [];
}

/**
 * Renames transient `-save.gypsum` / `-temp.gypsum` files (if any) so that
 * in-flight saves or crash-recovery state stays attached to the right file.
 * Copy-then-delete rather than `.move()`: the latter is unsupported on Chrome
 * for Android. Silently ignores files that don't exist.
 * @param {FileSystemDirectoryHandle} gypsumDir
 * @param {string} oldSaveName
 * @param {string} newSaveName
 */
async function moveTransientIfExists(gypsumDir, oldSaveName, newSaveName) {
    if (oldSaveName === newSaveName) return;
    let handle;
    try {
        handle = await gypsumDir.getFileHandle(oldSaveName, { create: false });
    } catch {
        return;
    }
    try {
        await copyFile(handle, gypsumDir, newSaveName);
        await gypsumDir.removeEntry(oldSaveName);
    } catch (err) {
        console.warn(`Transient migration failed for ${oldSaveName}:`, err);
    }
}

/**
 * Migrates all `.gypsum` side-files tied to a renamed file:
 *   - history.gypsum: rewrites matching entries in-place.
 *   - <filename>-save.gypsum / <filename>-temp.gypsum: renamed to the new pattern.
 *
 * Safe to call even when there is no backup folder or no matching entries.
 * Returns an array of warning strings (empty on clean success) so the caller
 * can surface them to the user without aborting the rename itself.
 *
 * @param {object} params
 * @param {string} params.oldFilename
 * @param {string} params.oldFilepath
 * @param {string} params.newFilename
 * @param {string} params.newFilepath
 * @returns {Promise<string[]>}
 */
export async function migrateBackupsForRename({ oldFilename, oldFilepath, newFilename, newFilepath }) {
    if (!appState.dirHandle) return [];

    const warnings = [];

    const historyWarnings = await rewriteHistoryFile({ oldFilename, oldFilepath, newFilename, newFilepath });
    warnings.push(...historyWarnings);

    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER);
        const oldSave = buildSaveFilename(oldFilepath, oldFilename);
        const newSave = buildSaveFilename(newFilepath, newFilename);
        const oldTemp = oldSave.replace(/-save\.gypsum$/, '-temp.gypsum');
        const newTemp = newSave.replace(/-save\.gypsum$/, '-temp.gypsum');
        await moveTransientIfExists(gypsumDir, oldSave, newSave);
        await moveTransientIfExists(gypsumDir, oldTemp, newTemp);
    } catch (err) {
        if (err?.name !== 'NotFoundError') {
            console.error('Transient migration: could not access .gypsum folder', { oldFilename, newFilename, err });
            warnings.push('Could not access the .gypsum folder; any pending save/temp files were not migrated.');
        }
    }

    return warnings;
}
