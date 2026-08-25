import { saveCurrentFile } from '../../editing/save-current-file.js';

/**
 * Saves the currently-viewed file, triggered by the save button or Ctrl+S.
 * The whole sequence lives in saveCurrentFile so autosave takes the identical path.
 * @async
 * @returns {Promise<void>}
 */
export async function handleSaveFileCopy() {
    await saveCurrentFile();
}
