import { appState } from './store.js';
import { getFileDataAndMetadata } from './file-parsing/file-info.js';
import { invalidateNoteNameIndex } from './internal-links/note-name-index.js';
import { checkFileErrors } from './file-parsing/file-errors.js';
import { resolveTargetDir } from '../editing/rename-file.js';

/**
 * Creates an empty note on disk and registers it in appState, creating any missing
 * folders along the way. Shared by the new-note button and by creating a note from an
 * unresolved [[internal link]]; neither the file list nor the modal is touched here —
 * each caller opens the result its own way.
 *
 * A file that already exists at the path is adopted rather than overwritten: it can only
 * have appeared behind the app's back, and losing its contents would be unrecoverable.
 *
 * @async
 * @param {string} folder - Normalised folder path, '' for the root of the loaded folder.
 * @param {string} filename - Filename including its extension.
 * @returns {Promise<object>} The new file object, as pushed onto appState.myFiles.
 */
export async function createEmptyNote(folder, filename) {
    const filepath = folder ? `${folder}/${filename}` : filename;
    const dir = await resolveTargetDir(folder);

    let handle;
    try {
        handle = await dir.getFileHandle(filename, { create: false });
    } catch {
        handle = await dir.getFileHandle(filename, { create: true });
        const writable = await handle.createWritable();
        await writable.write('');
        await writable.close();
    }

    const fileObj = await getFileDataAndMetadata(handle, appState.myFiles.length);
    const newFile = { ...fileObj, filepath, internalId: filepath };
    appState.myFiles.push(newFile);
    invalidateNoteNameIndex(); // the new note becomes linkable immediately
    appState.myFileHandlesMap.set(filepath, handle);
    checkFileErrors(newFile); // empty when created, but an adopted file can carry links

    return newFile;
}
