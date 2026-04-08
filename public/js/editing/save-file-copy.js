import { appState } from '../services/store.js';
import { SAVE_FOLDER } from '../constants.js';
import { buildSaveFilename, writeAndVerify, writeAndVerifyHandle } from '../services/file-save.js';

/**
 * Saves the given text to the .gypsum folder and, once verified, overwrites the
 * original file. Both writes are verified by read-back comparison.
 * On full success: deletes the temporary save file and updates the in-memory
 * snapshot content (so the unsaved-changes indicator resets).
 * @async
 * @param {{ filepath: string, filename: string, content: string }} snapshot
 * @param {string} textToSave
 * @returns {Promise<boolean>} true if both the save file and the original file
 *   were written and verified successfully
 */
export async function saveFileCopy(snapshot, textToSave) {
    const saveFilename = buildSaveFilename(snapshot.filepath, snapshot.filename);
    const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true });

    const saveVerified = await writeAndVerify(gypsumDir, saveFilename, textToSave);
    if (!saveVerified) {
        console.warn(`Save file verification failed: ${saveFilename}`);
        return false;
    }
    console.log(`Save verified: ${saveFilename}`);

    const fileObj = appState.myFiles.find(f => f.filepath === snapshot.filepath);
    if (!fileObj?.handle) return false;

    const originalVerified = await writeAndVerifyHandle(fileObj.handle, textToSave);
    if (!originalVerified) {
        console.warn(`Original file verification failed: ${snapshot.filename}`);
        return false;
    }
    console.log(`Original saved: ${snapshot.filename}`);

    await gypsumDir.removeEntry(saveFilename);
    snapshot.content = textToSave;
    return true;
}
