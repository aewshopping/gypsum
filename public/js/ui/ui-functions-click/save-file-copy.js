import { appState } from '../../services/store.js';
import { getIsCurrentVersion } from '../../editing/editable-state.js';

const SAVE_FOLDER = '.gypsum';

/**
 * Saves a copy of the currently-viewed file content to the .gypsum folder.
 * The save file is named {dir}-{filename}-save.gypsum for files in subdirectories,
 * or {filename}-save.gypsum for top-level files (no dir prefix).
 * Overwrites any existing save file with the same name.
 * Verifies the write by reading back and comparing to the modal content.
 * @async
 * @returns {Promise<void>}
 */
export async function handleSaveFileCopy() {
    const renderToggle = document.getElementById('render_toggle');
    if (!renderToggle?.checked || !getIsCurrentVersion()) return;

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

    // filepath includes the filename (e.g. "subdir/notes.md" or "notes.md" for top-level).
    // Strip the filename to get only the directory part, then build the save name.
    const dirPart = snapshot.filepath.slice(0, -(snapshot.filename.length + 1)); // +1 for the '/'
    const safeDir = dirPart.replace(/[/\\]/g, '-');
    const saveFilename = safeDir
        ? `${safeDir}-${snapshot.filename}-save.gypsum`
        : `${snapshot.filename}-save.gypsum`;

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
