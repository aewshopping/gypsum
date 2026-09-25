import { appState } from '../services/store.js';
import { SAVE_FOLDER } from '../constants.js';
import { buildSaveFilename, writeAndVerify, writeAndVerifyHandle } from '../services/file-save.js';

/**
 * Saves the given text to the .gypsum folder and, once verified, overwrites the
 * original file. Both writes are verified by read-back comparison.
 * On full success: deletes the temporary save file and updates the in-memory
 * snapshot content (so the unsaved-changes indicator resets).
 * @async
 * A batch passes the `.gypsum` folder and the file's own handle, taken once when it started, so a
 * folder loaded while it runs cannot receive the rest of its writes. The editor's save passes
 * neither and has them looked up, as it always has: it is one file and one write.
 * @param {{ filepath: string, filename: string, content: string }} snapshot
 * @param {string} textToSave
 * @param {{ gypsumDir?: FileSystemDirectoryHandle, handle?: FileSystemFileHandle }} [handles]
 * @returns {Promise<boolean>} true if both the save file and the original file
 *   were written and verified successfully
 */
export async function saveFileCopy(snapshot, textToSave, handles = {}) {
    const saveFilename = buildSaveFilename(snapshot.filepath, snapshot.filename);
    const gypsumDir = handles.gypsumDir
        ?? await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true });

    const saveVerified = await writeAndVerify(gypsumDir, saveFilename, textToSave);
    if (!saveVerified) {
        console.warn(`Save file verification failed: ${saveFilename}`);
        return false;
    }
    console.log(`Save verified: ${saveFilename}`);

    const handle = handles.handle ?? appState.myFiles.find(f => f.filepath === snapshot.filepath)?.handle;
    if (!handle) return false;

    const originalVerified = await writeAndVerifyHandle(handle, textToSave);
    if (!originalVerified) {
        console.warn(`Original file verification failed: ${snapshot.filename}`);
        return false;
    }
    console.log(`Original saved: ${snapshot.filename}`);

    await gypsumDir.removeEntry(saveFilename);
    snapshot.content = textToSave;
    return true;
}
