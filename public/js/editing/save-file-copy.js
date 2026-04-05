import { appState } from '../services/store.js';
import { SAVE_FOLDER, buildSaveFilename, writeAndVerify } from '../services/file-save.js';

/**
 * Saves a copy of the given text content to the .gypsum folder.
 * The save file is named {dir}-{filename}-save.gypsum for files in subdirectories,
 * or {filename}-save.gypsum for top-level files (no dir prefix).
 * Overwrites any existing save file with the same name.
 * Verifies the write by reading back and comparing to the provided content.
 * @async
 * @param {{ filepath: string, filename: string }} snapshot
 * @param {string} textToSave
 * @returns {Promise<boolean>} true if the save was verified successfully
 */
export async function saveFileCopy(snapshot, textToSave) {
    const saveFilename = buildSaveFilename(snapshot.filepath, snapshot.filename);
    const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true });
    const verified = await writeAndVerify(gypsumDir, saveFilename, textToSave);
    if (verified) {
        console.log(`Save verified: ${saveFilename}`);
    }
    return verified;
}
