import { appState } from '../services/store.js';

/**
 * @file Core rename service. Resolves the target parent directory, performs a
 * filesystem-level collision check, calls FileSystemFileHandle.move, then
 * updates all appState references tied to the old filename/filepath.
 * No DOM access.
 */

/**
 * Walks from `appState.dirHandle` down `folderPath` (slash-separated), creating
 * any missing directories along the way. Returns the innermost directory handle.
 * For an empty path, returns `appState.dirHandle` itself.
 * @param {string} folderPath - Normalised folder path (may be empty for root).
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function resolveTargetDir(folderPath) {
    let dir = appState.dirHandle;
    if (!folderPath) return dir;
    for (const segment of folderPath.split('/')) {
        dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    return dir;
}

/**
 * Checks whether an entry with `name` already exists in `dir`. If it does and
 * it is not the same entry as `selfHandle`, throws.
 * @param {FileSystemDirectoryHandle} dir
 * @param {string} name
 * @param {FileSystemFileHandle} selfHandle
 */
async function assertNoCollision(dir, name, selfHandle) {
    try {
        const existing = await dir.getFileHandle(name, { create: false });
        const same = await existing.isSameEntry(selfHandle);
        if (!same) {
            throw new Error('A file with that name already exists here.');
        }
    } catch (err) {
        if (err?.name === 'NotFoundError') return;
        if (err instanceof Error && err.message.startsWith('A file')) throw err;
        throw err;
    }
}

/**
 * Renames (and optionally relocates) a file on disk and updates appState.
 * Preconditions: caller has already validated inputs via validateRenameInputs
 * and confirmed `appState.dirHandle` is set.
 *
 * @param {object} params
 * @param {object} params.file - The file object from appState.myFiles.
 * @param {string} params.newFolder - Normalised folder path (may be empty).
 * @param {string} params.newName - Normalised new filename (with extension).
 * @returns {Promise<{oldFilename: string, oldFilepath: string, newFilename: string, newFilepath: string}>}
 */
export async function renameFile({ file, newFolder, newName }) {
    const oldFilename = file.filename;
    const oldFilepath = file.filepath;
    const newFilepath = newFolder ? `${newFolder}/${newName}` : newName;

    const targetDir = await resolveTargetDir(newFolder);
    await assertNoCollision(targetDir, newName, file.handle);

    await file.handle.move(targetDir, newName);

    file.filename = newName;
    file.filepath = newFilepath;

    if (appState.myFileHandlesMap) {
        appState.myFileHandlesMap.delete(oldFilename);
        appState.myFileHandlesMap.set(newName, file.handle);
    }

    if (appState.openFileSnapshot?.filename === oldFilename) {
        appState.openFileSnapshot.filename = newName;
        appState.openFileSnapshot.filepath = newFilepath;
    }
    if (appState.closeSnapshot?.filename === oldFilename) {
        appState.closeSnapshot.filename = newName;
        appState.closeSnapshot.filepath = newFilepath;
    }

    return { oldFilename, oldFilepath, newFilename: newName, newFilepath };
}
