import { appState } from '../services/store.js';
import { getIsCurrentVersion } from './editable-state.js';
import { SAVE_FOLDER, buildSaveFilename, decodeModalHtml, writeAndVerify } from '../services/file-save.js';

const DEBOUNCE_MS = 3000;    // pause in typing before attempting autosave
const MIN_INTERVAL_MS = 60_000; // minimum time between successful autosaves

let autosaveTimer = null;
let lastAutosaveContent = null; // null means "use openFileSnapshot as baseline"
let lastAutosaveTime = 0;       // epoch ms of last successful autosave

/**
 * Schedules an autosave attempt after the user pauses typing.
 * Call this on every input event in the file editor.
 * Resets the debounce timer so only the final pause triggers the attempt.
 */
export function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(maybeAutosave, DEBOUNCE_MS);
}

/**
 * Cancels any pending autosave timer and resets tracking state.
 * Call this when the file modal opens or closes.
 */
export function resetAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    lastAutosaveContent = null;
    lastAutosaveTime = 0;
}

/**
 * Checks all conditions and, if met, performs an autosave.
 * Runs after the debounce timer fires.
 */
async function maybeAutosave() {
    if (Date.now() - lastAutosaveTime < MIN_INTERVAL_MS) return;

    const renderToggle = document.getElementById('render_toggle');
    if (!renderToggle?.checked) return;
    if (!getIsCurrentVersion()) return;
    if (!appState.dirHandle) return;

    const snapshot = appState.openFileSnapshot;
    if (!snapshot) return;

    const preElement = document.querySelector('#modal-content-text pre');
    if (!preElement) return;

    const textToSave = decodeModalHtml(preElement.innerHTML);

    // Skip if content unchanged since the last autosave (or since the file was opened)
    const baseline = lastAutosaveContent ?? snapshot.content;
    if (textToSave === baseline) return;

    await performAutosave(snapshot, textToSave);
}

/**
 * Executes the full autosave sequence:
 *   1. Write content to the save file and verify.
 *   2. Read the verified save file and write its content to the temp file.
 *   3. If the temp file is verified, delete the save file — leaving only the temp file.
 * @param {{ filepath: string, filename: string }} snapshot
 * @param {string} textToSave
 */
async function performAutosave(snapshot, textToSave) {
    const saveFilename = buildSaveFilename(snapshot.filepath, snapshot.filename);
    const tempFilename = saveFilename.replace(/-save\.gypsum$/, '-temp.gypsum');

    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER, { create: true });

        const saveOk = await writeAndVerify(gypsumDir, saveFilename, textToSave);
        if (!saveOk) return;

        // Read the on-disk save file and copy its content to the temp file.
        // This follows the save file's verified bytes rather than in-memory content.
        const saveContent = await (await (await gypsumDir.getFileHandle(saveFilename)).getFile()).text();
        const tempOk = await writeAndVerify(gypsumDir, tempFilename, saveContent);
        if (!tempOk) return;

        await gypsumDir.removeEntry(saveFilename);

        lastAutosaveContent = textToSave;
        lastAutosaveTime = Date.now();
        console.log(`Autosaved: ${tempFilename}`);
    } catch (err) {
        console.error('Autosave failed:', err);
    }
}

/**
 * Deletes the temp autosave file for the given snapshot, if it exists.
 * Silently ignores errors (e.g. file not found, folder not accessible).
 * @param {{ filepath: string, filename: string }|null} snapshot
 * @returns {Promise<void>}
 */
export async function deleteTempFileIfExists(snapshot) {
    if (!snapshot || !appState.dirHandle) return;
    const saveFilename = buildSaveFilename(snapshot.filepath, snapshot.filename);
    const tempFilename = saveFilename.replace(/-save\.gypsum$/, '-temp.gypsum');
    try {
        const gypsumDir = await appState.dirHandle.getDirectoryHandle(SAVE_FOLDER);
        await gypsumDir.removeEntry(tempFilename);
        console.log(`Deleted temp file: ${tempFilename}`);
    } catch {
        // temp file does not exist or folder is inaccessible — nothing to clean up
    }
}
