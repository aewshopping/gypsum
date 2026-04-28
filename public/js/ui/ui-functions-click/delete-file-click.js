import { appState } from '../../services/store.js';
import { showWarningModal } from './warning-modal.js';
import { doClose, setOpenedFileId } from './open-file-content-view-trans.js';
import { resolveTargetDir, copyFile } from '../../editing/rename-file.js';
import { buildParentMap } from '../../services/file-parsing/tag-taxon.js';
import { processSeachResults } from '../ui-functions-search/a-search-orchestrator.js';
import { SAVE_FOLDER } from '../../constants.js';

const TRASH_FOLDER = `${SAVE_FOLDER}/trash`;

/**
 * Builds the trash filename for a file being deleted.
 * Format: {folderPrefix~}stem-YYYYMMDD-HHMMSS-trash.gypsum
 * The folder prefix encodes the original directory path with '~' replacing '/'.
 * @param {object} file - File object from appState.myFiles.
 * @returns {string}
 */
function buildTrashFilename(file) {
    const parts = file.filepath.split('/');
    const dirParts = parts.slice(0, -1);
    const stem = file.filename.replace(/\.[^.]+$/, '');
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const prefix = dirParts.length ? `${dirParts.join('~')}~` : '';
    return `${prefix}${stem}-${ts}-trash.gypsum`;
}

/**
 * Performs the full delete: copies file to trash, prunes appState, closes modals,
 * and re-renders. Only called after the user confirms the warning dialog.
 * @returns {Promise<void>}
 */
async function handleDeleteFileConfirmed() {
    const fileId = appState.openFileSnapshot?.filepath;
    const file = appState.myFiles.find(f => f.id === fileId);

    // Phase A — Filesystem (try/catch: no state mutations if this fails)
    let trashDir;
    try {
        trashDir = await resolveTargetDir(TRASH_FOLDER);
        await copyFile(file.handle, trashDir, buildTrashFilename(file));
    } catch (err) {
        console.error('Delete failed (trash copy):', err);
        alert(`Delete failed: ${err?.message ?? 'See console for details.'}`);
        return;
    }

    // Remove original from disk; non-fatal if this fails (trash copy is already safe,
    // and findUnusedFilename queries the real filesystem so a leftover file just means
    // note-N numbering skips that slot — whereas a successful removeEntry lets it reuse it).
    try {
        const folder = file.filepath.split('/').slice(0, -1).join('/');
        const parentDir = await resolveTargetDir(folder);
        await parentDir.removeEntry(file.filename);
    } catch (err) {
        console.warn('Delete: could not remove original file from disk.', err);
    }

    // Phase B — State mutations (only reached if copy verified)
    const idx = appState.myFiles.indexOf(file);
    if (idx !== -1) appState.myFiles.splice(idx, 1);
    appState.myFileHandlesMap?.delete(fileId);

    for (const resultMap of appState.search.results.values()) {
        resultMap.delete(fileId);
    }

    appState.myParentMap = buildParentMap(appState.myFiles);

    // Phase C — Close modals
    setOpenedFileId(null);
    document.getElementById('modal-rename-file')?.close();
    doClose(); // captures openFileSnapshot synchronously, saves close-backup entry

    // Phase D — Post-close cleanup
    appState.openFileSnapshot = null;
    processSeachResults(); // rebuilds matchingFiles, updates filter counts, re-renders
}

/**
 * Handles a click on the "Delete file" button inside the rename modal.
 * Shows a confirmation warning before proceeding.
 * @param {Event} evt
 */
export function handleDeleteFile(evt) {
    evt.preventDefault();
    if (!appState.dirHandle) return;

    const fileId = appState.openFileSnapshot?.filepath;
    const file = appState.myFiles.find(f => f.id === fileId);
    if (!file) return;

    showWarningModal(
        `Move "${file.filename}" to trash?`,
        'Delete',
        'Cancel',
        handleDeleteFileConfirmed,
    );
}
