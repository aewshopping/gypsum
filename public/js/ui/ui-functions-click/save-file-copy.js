import { appState } from '../../services/store.js';

const SAVE_FOLDER = '.gypsum';

/**
 * Saves a copy of the currently-viewed file content to the .gypsum folder.
 * The save file is named {filepath}-{filename}-save.gypsum and will be overwritten if it exists.
 * Verifies the write by reading back and comparing to the modal content.
 * @async
 * @returns {Promise<void>}
 */
export async function handleSaveFileCopy() {
    if (!appState.dirHandle) return;

    const snapshot = appState.openFileSnapshot;
    if (!snapshot) return;

    const preElement = document.querySelector('#modal-content-text pre');
    if (!preElement) return;

    // Convert <br> to \n and decode HTML entities to get plain text for saving
    const modalHtml = preElement.innerHTML;
    const textToSave = modalHtml
        .replace(/<br>/gi, '\n')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

    // Sanitize filepath to avoid directory separators in the filename
    const safeFilepath = snapshot.filepath.replace(/[/\\]/g, '-');
    const saveFilename = `${safeFilepath}-${snapshot.filename}-save.gypsum`;

    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true });
        const saveHandle = await gypsumDir.getFileHandle(saveFilename, { create: true });

        const writable = await saveHandle.createWritable();
        await writable.write(textToSave);
        await writable.close();

        // Verify: read back and compare (performing the same <br> → \n conversion)
        const savedText = await (await saveHandle.getFile()).text();
        const modalTextForComparison = modalHtml
            .replace(/<br>/gi, '\n')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

        if (savedText === modalTextForComparison) {
            console.log(`Save verified: ${saveFilename}`);
        }
    } catch (err) {
        console.error('Save failed:', err);
    }
}
