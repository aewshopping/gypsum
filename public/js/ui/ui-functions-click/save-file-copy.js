import { appState } from '../../services/store.js';
import { getIsCurrentVersion } from '../../editing/editable-state.js';

const SAVE_FOLDER = '.gypsum';
let savePopoverTimer = null;

/**
 * Briefly shows a popover above the save button indicating success or failure.
 * @param {boolean} success
 */
function showSavePopover(success) {
    const popover = document.getElementById('save-popover');
    if (!popover) return;
    popover.textContent = success ? 'Saved' : 'Save failed';
    popover.className = success ? 'success' : 'error';
    popover.hidden = false;
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
 * Builds the .gypsum save filename for a given file.
 * Top-level files: '{filename}-save.gypsum'
 * Files in subdirectories: '{safeDir}-{filename}-save.gypsum'
 * @param {string} filepath
 * @param {string} filename
 * @returns {string}
 */
export function buildSaveFilename(filepath, filename) {
    const dirPart = extractDirFromFilepath(filepath);
    const safeDir = dirPart.replace(/[/\\]/g, '-');
    return safeDir
        ? `${safeDir}-${filename}-save.gypsum`
        : `${filename}-save.gypsum`;
}

/**
 * Writes content to a named file inside gypsumDir, then reads it back to verify.
 * @param {FileSystemDirectoryHandle} gypsumDir
 * @param {string} filename
 * @param {string} content
 * @returns {Promise<boolean>} true if the written content matches what was read back
 */
export async function writeAndVerify(gypsumDir, filename, content) {
    const handle = await gypsumDir.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    const savedText = await (await handle.getFile()).text();
    return savedText === content;
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

    const saveFilename = buildSaveFilename(snapshot.filepath, snapshot.filename);

    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true });
        const verified = await writeAndVerify(gypsumDir, saveFilename, textToSave);

        if (verified) {
            console.log(`Save verified: ${saveFilename}`);
        }
        showSavePopover(verified);
    } catch (err) {
        console.error('Save failed:', err);
        showSavePopover(false);
    }
}
