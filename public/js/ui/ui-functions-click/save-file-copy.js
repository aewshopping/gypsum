import { appState } from '../../services/store.js';
import { getIsCurrentVersion } from '../../editing/editable-state.js';

const SAVE_FOLDER = '.gypsum';
let savePopoverTimer = null;

/**
 * Briefly shows a popover above the save button indicating success or failure.
 * A second call while the popover is visible restarts the animation.
 * @param {boolean} success
 */
function showSavePopover(success) {
    const popover = document.getElementById('save-popover');
    if (!popover) return;
    popover.textContent = success ? 'Saved' : 'Save failed';
    // Reset class and force reflow so the animation restarts if already playing
    popover.className = '';
    popover.hidden = false;
    void popover.offsetWidth;
    popover.className = success ? 'success' : 'error';
    clearTimeout(savePopoverTimer);
    savePopoverTimer = setTimeout(() => { popover.hidden = true; }, 2500);
}

/**
 * Extracts the directory portion of a filepath, handling both cases:
 *   - filepath includes the filename: 'subdir/notes.md' → 'subdir', 'notes.md' → ''
 *   - filepath is already a pure directory: 'subdir' → 'subdir', '' → ''
 * Detection: if the last path segment (after the final '/') contains a '.', it is
 * treated as a filename and stripped. Otherwise the whole value is a directory path.
 * @param {string} filepath
 * @returns {string}
 */
function extractDirFromFilepath(filepath) {
    const lastSlash = filepath.lastIndexOf('/');
    const lastSegment = lastSlash === -1 ? filepath : filepath.slice(lastSlash + 1);
    if (lastSegment.includes('.')) {
        return lastSlash === -1 ? '' : filepath.slice(0, lastSlash);
    }
    return filepath;
}

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

    const dirPart = extractDirFromFilepath(snapshot.filepath);
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
            showSavePopover(true);
        } else {
            showSavePopover(false);
        }
    } catch (err) {
        console.error('Save failed:', err);
        showSavePopover(false);
    }
}
