import { appState, FILE_PROPERTIES } from '../../services/store.js';
import { readBackupHistory } from '../../history/backup-history-read.js';
import { resolveTargetDir } from '../../editing/rename-file.js';
import { extractDirFromFilepath } from '../../services/file-save.js';
import { getFileDataAndMetadata } from '../../services/file-parsing/file-info.js';
import { invalidateNoteNameIndex } from '../../services/internal-links/note-name-index.js';
import { checkFileErrors } from '../../services/file-parsing/file-errors.js';
import { sortAppStateFiles } from '../../services/file-object-sort.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';
import { refreshHistoryModal } from './history-modal.js';

/**
 * Finds a name that no file in `dir` is using, so recreating can never overwrite.
 * The original name is preferred — writing back to it is what reconnects the file to its
 * history, which is keyed on filename and filepath.
 * @async
 * @param {FileSystemDirectoryHandle} dir
 * @param {string} filename
 * @returns {Promise<string>}
 */
async function findFreeName(dir, filename) {
    const dot = filename.lastIndexOf('.');
    const stem = dot === -1 ? filename : filename.slice(0, dot);
    const ext = dot === -1 ? '' : filename.slice(dot);

    let candidate = filename;
    let n = 0;
    while (true) {
        try {
            await dir.getFileHandle(candidate, { create: false });
        } catch {
            return candidate; // nothing there — safe to write
        }
        n++;
        candidate = n === 1 ? `${stem}-recovered${ext}` : `${stem}-recovered-${n}${ext}`;
    }
}

/**
 * Recreates a file that history still holds versions of but the folder no longer contains,
 * writing its newest version back to its original path. Restored to that path, the file
 * picks up all of its existing history in the normal file modal.
 *
 * Never overwrites: if something already occupies the name, a '-recovered' variant is
 * written instead — which does mean the recreated file starts its own history, since
 * entries are matched on filename and filepath.
 * @async
 * @param {Event} event - The click event.
 * @param {HTMLElement} target - The row's recreate button, carrying the file's dataset.
 * @returns {Promise<void>}
 */
export async function handleHistoryRecreate(event, target) {
    if (!appState.dirHandle) return;
    const { filename, filepath } = target.dataset;

    const entries = await readBackupHistory(filename, filepath);
    if (!entries.length) return;

    try {
        const folder = extractDirFromFilepath(filepath);
        const dir = await resolveTargetDir(folder);
        const name = await findFreeName(dir, filename);

        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(entries[0].content);
        await writable.close();

        const newFilepath = folder ? `${folder}/${name}` : name;
        const fileObj = await getFileDataAndMetadata(handle, appState.myFiles.length);
        const newFile = { ...fileObj, filepath: newFilepath, internalId: newFilepath };
        appState.myFiles.push(newFile);
        appState.myFileHandlesMap.set(newFilepath, handle);
        invalidateNoteNameIndex();
        checkFileErrors(newFile);

        const { property, direction } = appState.sortState;
        sortAppStateFiles(property, FILE_PROPERTIES.get(property)?.type ?? 'string', direction);
        renderFiles();

        await refreshHistoryModal();
    } catch (err) {
        console.error('Recreate from history failed:', err);
        alert(`Could not recreate "${filename}": ${err?.message ?? 'see console for details.'}`);
    }
}
