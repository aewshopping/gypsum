import { appState } from '../services/store.js';
import { extractDirFromFilepath, writeAndVerifyHandle } from '../services/file-save.js';

/**
 * @file Core rename service. Resolves the target parent directory, performs a
 * filesystem-level collision check, copies the source file to the new
 * location, verifies, swaps `file.handle`, then deletes the original. Falls
 * back to leaving both files in place if the delete fails. No DOM access.
 *
 * FileSystemFileHandle.move() is deliberately not used: it is unsupported on
 * Chrome for Android, which is a target browser. Copy + delete uses only
 * primitives that are available everywhere.
 */

let renameInProgress = false;

// Slow copies on mobile can take several seconds for larger files. If the
// user closes the tab mid-rename they would lose both copies: partial new
// file removed, old file about to be deleted. The busy flag is cleared in a
// finally block in renameFile() so no error path can trap the user here.
window.addEventListener('beforeunload', (evt) => {
    if (renameInProgress) evt.preventDefault();
});

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
 * it is not the same entry as `selfHandle`, surfaces a blocking alert (because
 * the file appeared behind the app's back — validation already rejects clashes
 * with loaded files) and cancels the rename. No "proceed anyway" option: a
 * user never knowingly wants to overwrite a file they didn't know existed.
 * @param {FileSystemDirectoryHandle} dir
 * @param {string} name
 * @param {FileSystemFileHandle} selfHandle
 * @param {string} folderPath - Normalised folder path, used only for the alert message.
 */
async function assertNoCollision(dir, name, selfHandle, folderPath) {
    try {
        const existing = await dir.getFileHandle(name, { create: false });
        const same = await existing.isSameEntry(selfHandle);
        if (!same) {
            const location = folderPath ? `"${folderPath}"` : 'this folder';
            alert(`A file named "${name}" has just appeared in ${location}. Rename cancelled to prevent overwriting it.`);
            throw new Error('Rename cancelled: unknown file at target.');
        }
    } catch (err) {
        if (err?.name === 'NotFoundError') return;
        throw err;
    }
}

/**
 * Copies a file's text content into a new entry `newName` inside `targetDir`
 * and verifies by read-back text comparison. Removes the partial entry if
 * verification fails so no half-written file is left behind.
 *
 * Text-mode is fine: this helper only runs on .txt/.md notes that the app has
 * already loaded into memory. Reuses writeAndVerifyHandle so the write +
 * verify path matches how user edits are saved.
 * @param {FileSystemFileHandle} sourceHandle
 * @param {FileSystemDirectoryHandle} targetDir
 * @param {string} newName
 * @returns {Promise<FileSystemFileHandle>} the new file's handle
 */
export async function copyFile(sourceHandle, targetDir, newName) {
    const content = await (await sourceHandle.getFile()).text();
    const newHandle = await targetDir.getFileHandle(newName, { create: true });
    const ok = await writeAndVerifyHandle(newHandle, content);
    if (!ok) {
        try { await targetDir.removeEntry(newName); } catch {}
        throw new Error('Copy verification failed.');
    }
    return newHandle;
}

/**
 * Renames (and optionally relocates) a file on disk and updates appState.
 * Preconditions: caller has already validated inputs via validateRenameInputs
 * and confirmed `appState.dirHandle` is set.
 *
 * Flow: copy source → new location, verify, then update `file.handle` and
 * other appState references, then delete the original. If the copy or
 * verification fails, the old file is preserved untouched and `file.handle`
 * is not swapped. If the delete fails after a successful copy, both files
 * exist on disk (recoverable) and the app is bound to the verified new one.
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
    const oldFolder = extractDirFromFilepath(oldFilepath);

    const targetDir = await resolveTargetDir(newFolder);
    await assertNoCollision(targetDir, newName, file.handle, newFolder);

    renameInProgress = true;
    try {
        const newHandle = await copyFile(file.handle, targetDir, newName);

        // Swap only after the new file is verified; until this point a failure
        // leaves the old file intact and file.handle still pointing to it.
        file.handle = newHandle;
        file.filename = newName;
        file.filepath = newFilepath;
        file.id = newFilepath;
        // file.lastModified is intentionally left at its original value. The
        // on-disk mtime of the new copy is unavoidably "now" (the File System
        // Access API exposes no way to preserve it), but keeping the session
        // view pinned to the original mtime avoids a surprising sort reshuffle.

        if (appState.myFileHandlesMap) {
            appState.myFileHandlesMap.delete(oldFilepath);
            appState.myFileHandlesMap.set(newFilepath, newHandle);
        }

        if (appState.openFileSnapshot?.filepath === oldFilepath) {
            appState.openFileSnapshot.filename = newName;
            appState.openFileSnapshot.filepath = newFilepath;
        }
        if (appState.closeSnapshot?.filepath === oldFilepath) {
            appState.closeSnapshot.filename = newName;
            appState.closeSnapshot.filepath = newFilepath;
        }

        try {
            const oldParentDir = await resolveTargetDir(oldFolder);
            await oldParentDir.removeEntry(oldFilename);
        } catch (err) {
            console.warn(
                `Rename copy succeeded, but removing old file "${oldFilepath}" failed. ` +
                'Both the old and new files now exist on disk.',
                err,
            );
        }
    } finally {
        renameInProgress = false;
    }

    return { oldFilename, oldFilepath, newFilename: newName, newFilepath };
}
